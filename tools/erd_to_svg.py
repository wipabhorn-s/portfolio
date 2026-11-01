"""Turn a draw.io ERD into an SVG in the portfolio's colours.

Usage:
    python tools/erd_to_svg.py "path/to/ERD.drawio" images/erd/learnora.svg

Keeps the table positions and the relationship lines from draw.io, and adds
data attributes that erd-viewer.js uses to highlight a table's links.
Run it again whenever the .drawio file changes.
"""
import html
import re
import sys
import xml.etree.ElementTree as ET
from collections import defaultdict

# colours (same as styles.css)
BG = "#120B1C"
CARD = "#1E1530"
LINE = "#33264A"
INK = "#F7EEF8"
INK_SOFT = "#A99BBA"
ACCENT = "#FF6FAE"
LAVENDER = "#C9B8F5"
EDGE = "#8F7BB8"

ROW_H = 30
HEAD_H = 30
FONT = 12.5
CHAR_W = FONT * 0.6  # monospace
KEY_W = 46


def esc(s):
    return html.escape(s, quote=True)


def num(v, d=0.0):
    try:
        return float(v)
    except (TypeError, ValueError):
        return d


def style_map(s):
    out = {}
    for part in (s or "").split(";"):
        if "=" in part:
            k, v = part.split("=", 1)
            out[k] = v
    return out


def clean(v):
    v = html.unescape(v or "")
    v = re.sub(r"<br\s*/?>", " ", v)
    v = re.sub(r"<[^>]+>", "", v)
    return re.sub(r"\s+", " ", v).strip()


def fit(text, width):
    """Shorten a column line so it fits the row. Returns (shown, full)."""
    full = text
    max_chars = int(width / CHAR_W)
    if len(text) > max_chars:
        text = re.sub(r"ENUM\([^)]*\)", "ENUM(…)", text)
    if len(text) > max_chars:
        text = text[: max_chars - 1] + "…"
    return text, full


def main(src, dst):
    root = ET.parse(src).getroot()
    cells = root.findall(".//mxCell")
    by_id = {c.get("id"): c for c in cells}
    kids = defaultdict(list)
    for c in cells:
        kids[c.get("parent")].append(c)

    def geo(c):
        g = c.find("mxGeometry")
        if g is None:
            return 0, 0, 0, 0
        return num(g.get("x")), num(g.get("y")), num(g.get("width")), num(g.get("height"))

    def abs_xy(c):
        x, y = 0.0, 0.0
        while c is not None and c.get("id") not in ("0", "1"):
            gx, gy, _, _ = geo(c)
            x += gx
            y += gy
            c = by_id.get(c.get("parent"))
        return x, y

    tables = []
    row_info = {}  # row id -> (table name, abs rect, new y)
    for t in cells:
        if "shape=table;" not in (t.get("style") or ""):
            continue
        name = clean(t.get("value"))
        tx, ty = abs_xy(t)
        _, _, tw, _ = geo(t)
        rows = [r for r in kids[t.get("id")] if "shape=tableRow" in (r.get("style") or "")]
        rows.sort(key=lambda r: geo(r)[1])
        cols = []
        for r in rows:
            parts = sorted(kids[r.get("id")], key=lambda k: geo(k)[0])
            key = clean(parts[0].get("value")) if parts else ""
            text = " ".join(clean(p.get("value")) for p in parts[1:])
            cols.append((r.get("id"), key, text))
        # rows are redrawn at a fixed height, so the table keeps its top-left
        # corner and gets a tidy, even height
        th = HEAD_H + ROW_H * len(cols)
        for i, (rid, _, _) in enumerate(cols):
            ry = ty + HEAD_H + i * ROW_H
            row_info[rid] = (name, (tx, ry, tw, ROW_H))
        row_info[t.get("id")] = (name, (tx, ty, tw, HEAD_H))
        tables.append({"name": name, "x": tx, "y": ty, "w": tw, "h": th, "cols": cols})

    # the original rows may have had other heights; waypoints were drawn
    # against those, so map each original row centre y to the new one
    y_map = {}
    for t in cells:
        if "shape=tableRow" in (t.get("style") or ""):
            ox, oy = abs_xy(t)
            _, _, _, oh = geo(t)
            if t.get("id") in row_info:
                _, (nx, ny, nw, nh) = row_info[t.get("id")]
                y_map[round(oy + oh / 2, 1)] = ny + nh / 2

    edges = []
    for e in cells:
        if e.get("edge") != "1":
            continue
        s, t = e.get("source"), e.get("target")
        if s not in row_info or t not in row_info:
            continue
        st = style_map(e.get("style"))
        sname, (sx, sy, sw, sh) = row_info[s]
        tname, (txx, tyy, tw, th) = row_info[t]
        scx, tcx = sx + sw / 2, txx + tw / 2
        exit_x = num(st.get("exitX"), 1 if tcx > scx else 0)
        entry_x = num(st.get("entryX"), 0 if tcx > scx else 1)
        S = (sx + sw * exit_x, sy + sh / 2)
        T = (txx + tw * entry_x, tyy + th / 2)
        ds = 1 if exit_x >= 0.5 else -1
        dt = 1 if entry_x >= 0.5 else -1
        wps = []
        g = e.find("mxGeometry")
        if g is not None:
            arr = g.find("Array")
            if arr is not None:
                for p in arr.findall("mxPoint"):
                    px, py = num(p.get("x")), num(p.get("y"))
                    py = y_map.get(round(py, 1), py)
                    wps.append((px, py))
        pts = route(S, T, ds, dt, wps)
        edges.append({
            "a": sname, "b": tname, "pts": pts, "ds": ds, "dt": dt,
            "start": st.get("startArrow", "none"), "end": st.get("endArrow", "none"),
            "dashed": st.get("dashed") == "1",
        })

    xs = [t["x"] for t in tables] + [t["x"] + t["w"] for t in tables]
    ys = [t["y"] for t in tables] + [t["y"] + t["h"] for t in tables]
    for e in edges:
        xs += [p[0] for p in e["pts"]]
        ys += [p[1] for p in e["pts"]]
    pad = 60
    minx, miny = min(xs) - pad, min(ys) - pad
    W, H = max(xs) - minx + pad, max(ys) - miny + pad

    out = []
    out.append(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{minx:.0f} {miny:.0f} {W:.0f} {H:.0f}" '
        f'width="{W:.0f}" height="{H:.0f}" class="erd-svg" role="img" '
        f'aria-label="Entity relationship diagram: {len(tables)} tables, {len(edges)} relationships">'
    )
    out.append(
        "<defs>"
        f'<linearGradient id="erdHead" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{ACCENT}"/>'
        '<stop offset="1" stop-color="#B9408A"/></linearGradient>'
        "<style>"
        ".erd-svg text{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;}"
        ".erd-edge path{fill:none;transition:stroke .2s,opacity .2s;}"
        ".erd-table rect.erd-body{transition:stroke .2s;}"
        "</style></defs>"
    )
    # no paper: the diagram sits straight on the page background

    out.append('<g class="erd-edges">')
    for e in edges:
        dash = ' stroke-dasharray="7 6"' if e["dashed"] else ""
        d = rounded_path(e["pts"])
        out.append(f'<g class="erd-edge" data-a="{esc(e["a"])}" data-b="{esc(e["b"])}" stroke="{EDGE}">')
        out.append(f'<path d="{d}" stroke-width="1.6"{dash}/>')
        out.append(marker(e["pts"][0], e["ds"], e["start"]))
        out.append(marker(e["pts"][-1], e["dt"], e["end"]))
        out.append("</g>")
    out.append("</g>")

    for t in tables:
        x, y, w, h = t["x"], t["y"], t["w"], t["h"]
        out.append(f'<g class="erd-table" data-t="{esc(t["name"])}" tabindex="0">')
        out.append(f'<title>{esc(t["name"])} ({len(t["cols"])} columns)</title>')
        out.append(
            f'<rect class="erd-body" x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="12" '
            f'fill="{CARD}" stroke="{LINE}" stroke-width="1.5"/>'
        )
        out.append(
            f'<path d="M{x:.1f},{y + HEAD_H:.1f} V{y + 12:.1f} a12,12 0 0 1 12,-12 H{x + w - 12:.1f} '
            f'a12,12 0 0 1 12,12 V{y + HEAD_H:.1f} Z" fill="url(#erdHead)"/>'
        )
        out.append(
            f'<text x="{x + 16:.1f}" y="{y + HEAD_H / 2 + 5:.1f}" fill="#FFFFFF" font-size="14.5" '
            f'font-weight="700">{esc(t["name"])}</text>'
        )
        for i, (_, key, text) in enumerate(t["cols"]):
            ry = y + HEAD_H + i * ROW_H
            # one group per column; the viewer hides these when zoomed out and
            # reads data-k / data-n / data-ty for the table's info card
            cname, _, ctype = text.partition(" ")
            out.append(f'<g class="erd-col" data-k="{esc(key)}" data-n="{esc(cname)}" data-ty="{esc(ctype)}">')
            if i:
                out.append(
                    f'<line x1="{x + 1:.1f}" y1="{ry:.1f}" x2="{x + w - 1:.1f}" y2="{ry:.1f}" '
                    'stroke="#281D3B" stroke-width="1"/>'
                )
            cy = ry + ROW_H / 2 + 4.3
            if key:
                kc = ACCENT if key.startswith("PK") else LAVENDER
                out.append(
                    f'<text x="{x + 14:.1f}" y="{cy:.1f}" fill="{kc}" font-size="11" font-weight="700">{esc(key)}</text>'
                )
            name, _, rest = text.partition(" ")
            shown, full = fit(text, w - KEY_W - 14)
            sname, _, srest = shown.partition(" ")
            tip = f"<title>{esc(full)}</title>" if shown != full else ""
            out.append(
                f'<text x="{x + KEY_W:.1f}" y="{cy:.1f}" font-size="{FONT}">{tip}'
                f'<tspan fill="{INK}" font-weight="600">{esc(sname)}</tspan>'
                + (f'<tspan fill="{INK_SOFT}"> {esc(srest)}</tspan>' if srest else "")
                + "</text>"
            )
            out.append("</g>")
        out.append("</g>")
    out.append("</svg>")

    with open(dst, "w", encoding="utf-8") as f:
        f.write("\n".join(out))
    print(f"{dst}: {len(tables)} tables, {len(edges)} relationships, {W:.0f}x{H:.0f}")


def route(S, T, ds, dt, wps):
    """Orthogonal path from S to T through the draw.io waypoints."""
    stub = 24
    pts = [S]
    if not wps:
        if ds != dt:
            if (T[0] - S[0]) * ds > 2 * stub:  # facing each other
                mx = (S[0] + T[0]) / 2
                pts += [(mx, S[1]), (mx, T[1])]
            else:  # target is behind: loop around
                a = (S[0] + ds * stub, S[1])
                b = (T[0] + dt * stub, T[1])
                my = (S[1] + T[1]) / 2
                pts += [a, (a[0], my), (b[0], my), b]
        else:  # both on the same side
            x = max(S[0], T[0]) + stub if ds > 0 else min(S[0], T[0]) - stub
            pts += [(x, S[1]), (x, T[1])]
        pts.append(T)
        return simplify(pts)

    cur = S
    for p in wps:
        if abs(p[0] - cur[0]) > 0.5 and abs(p[1] - cur[1]) > 0.5:
            pts.append((p[0], cur[1]))  # go across first, then up or down
        pts.append(p)
        cur = p
    if abs(T[0] - cur[0]) > 0.5 and abs(T[1] - cur[1]) > 0.5:
        pts.append((cur[0], T[1]))  # arrive at the target sideways
    pts.append(T)
    return simplify(pts)


def simplify(pts):
    out = []
    for p in pts:
        if out and abs(p[0] - out[-1][0]) < 0.5 and abs(p[1] - out[-1][1]) < 0.5:
            continue
        out.append(p)
    # drop middle points on a straight line
    i = 1
    while i < len(out) - 1:
        a, b, c = out[i - 1], out[i], out[i + 1]
        if (abs(a[0] - b[0]) < 0.5 and abs(b[0] - c[0]) < 0.5) or (abs(a[1] - b[1]) < 0.5 and abs(b[1] - c[1]) < 0.5):
            out.pop(i)
        else:
            i += 1
    return out


def rounded_path(pts, r=10):
    d = f"M{pts[0][0]:.1f},{pts[0][1]:.1f}"
    for i in range(1, len(pts) - 1):
        a, b, c = pts[i - 1], pts[i], pts[i + 1]
        la = ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2) ** 0.5
        lc = ((c[0] - b[0]) ** 2 + (c[1] - b[1]) ** 2) ** 0.5
        rr = min(r, la / 2, lc / 2)
        if rr < 0.5:
            d += f" L{b[0]:.1f},{b[1]:.1f}"
            continue
        p1 = (b[0] + (a[0] - b[0]) / la * rr, b[1] + (a[1] - b[1]) / la * rr)
        p2 = (b[0] + (c[0] - b[0]) / lc * rr, b[1] + (c[1] - b[1]) / lc * rr)
        d += f" L{p1[0]:.1f},{p1[1]:.1f} Q{b[0]:.1f},{b[1]:.1f} {p2[0]:.1f},{p2[1]:.1f}"
    d += f" L{pts[-1][0]:.1f},{pts[-1][1]:.1f}"
    return d


def marker(p, side, kind):
    """Crow's-foot notation at a table edge. side: +1 right edge, -1 left edge."""
    x, y = p
    n = side

    def bar(d):
        return f'<line x1="{x + n * d:.1f}" y1="{y - 7:.1f}" x2="{x + n * d:.1f}" y2="{y + 7:.1f}" stroke-width="1.6"/>'

    def ring(d):
        return f'<circle cx="{x + n * d:.1f}" cy="{y:.1f}" r="4.5" fill="{BG}" stroke-width="1.6"/>'

    def crow():
        return (
            f'<path d="M{x:.1f},{y - 8:.1f} L{x + n * 12:.1f},{y:.1f} L{x:.1f},{y + 8:.1f}" '
            'fill="none" stroke-width="1.6"/>'
        )

    parts = {
        "ERmandOne": [bar(7), bar(12)],
        "ERone": [bar(9)],
        "ERzeroToOne": [bar(8), ring(17)],
        "ERzeroToMany": [crow(), ring(18)],
        "ERoneToMany": [crow(), bar(15)],
        "ERmany": [crow()],
    }.get(kind, [])
    return "".join(parts)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])

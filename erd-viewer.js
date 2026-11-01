// ERD MAP (projects/*-erd.html)
// The diagram fills the screen and moves like a map:
//   scroll wheel                  zoom in / out around the pointer
//   hold the wheel (or left) button and drag   move around
//   two fingers                   pinch to zoom on a phone
//   click a table                 light up it and the tables linked to it
//
//   <div class="erd-map" data-erd="../images/erd/xxx.svg"> ...title card... </div>
//
// The SVG comes from tools/erd_to_svg.py. It is put into the page (not shown
// as a picture), so tables can be clicked.
(function () {
  const root = document.querySelector('.erd-map[data-erd]');
  if (!root) return;

  const ICON = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  };
  const icon = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[n]}</svg>`;

  root.insertAdjacentHTML('beforeend', `
    <div class="erd-stage" tabindex="0" aria-label="Diagram. Arrow keys move, plus and minus zoom, 0 shows everything.">
      <div class="erd-canvas"></div>
    </div>
    <div class="erd-zoombar" role="group" aria-label="Zoom">
      <button type="button" data-z="in" aria-label="Zoom in" title="Zoom in">${icon('plus')}</button>
      <span class="erd-zoom" aria-live="polite">100%</span>
      <button type="button" data-z="out" aria-label="Zoom out" title="Zoom out">${icon('minus')}</button>
      <button type="button" data-z="fit" aria-label="Show everything" title="Show everything">${icon('fit')}</button>
    </div>
    <p class="erd-hint">Scroll to zoom &middot; hold and drag to move &middot; click a table</p>`);

  const stage = root.querySelector('.erd-stage');
  const canvas = root.querySelector('.erd-canvas');
  const zoomLabel = root.querySelector('.erd-zoom');
  const hint = root.querySelector('.erd-hint');
  if (matchMedia('(pointer: coarse)').matches) hint.innerHTML = 'Pinch to zoom &middot; drag to move &middot; tap a table';

  let svg = null, W = 0, H = 0;
  const MIN = 0.06, MAX = 2.4;
  const cur = { s: 1, x: 0, y: 0 }, goal = { s: 1, x: 0, y: 0 };
  let raf = 0, lastFrame = 0, touched = false;

  // ---- camera: "goal" is where we are going, "cur" eases towards it ----
  function render() {
    canvas.style.transform = `translate(${cur.x}px, ${cur.y}px) scale(${cur.s})`;
    zoomLabel.textContent = Math.round(cur.s * 100) + '%';
  }
  function tick() {
    lastFrame = performance.now();
    const k = 0.22;
    cur.s += (goal.s - cur.s) * k;
    cur.x += (goal.x - cur.x) * k;
    cur.y += (goal.y - cur.y) * k;
    const done = Math.abs(goal.s - cur.s) < goal.s * 0.001 && Math.abs(goal.x - cur.x) < 0.5 && Math.abs(goal.y - cur.y) < 0.5;
    if (done) Object.assign(cur, goal);
    render();
    raf = done ? 0 : requestAnimationFrame(tick);
  }
  function jumpNow() { cancelAnimationFrame(raf); raf = 0; Object.assign(cur, goal); render(); }
  function animate() {
    if (document.hidden) { jumpNow(); return; } // no animation frames in a hidden tab
    if (raf) return;
    const asked = performance.now();
    raf = requestAnimationFrame(tick);
    // some embedded or background views never run animation frames: jump there instead
    setTimeout(() => { if (raf && lastFrame < asked) jumpNow(); }, 200);
  }
  const clamp = (s) => Math.min(MAX, Math.max(MIN, s));

  function zoomAt(f, cx, cy) {
    const ns = clamp(goal.s * f);
    goal.x = cx - (cx - goal.x) * (ns / goal.s);
    goal.y = cy - (cy - goal.y) * (ns / goal.s);
    goal.s = ns;
    animate();
  }
  function fit(now) {
    if (!W) return;
    const r = stage.getBoundingClientRect();
    const s = clamp(Math.min(r.width / W, r.height / H) * 0.94);
    Object.assign(goal, { s, x: (r.width - W * s) / 2, y: (r.height - H * s) / 2 });
    now ? jumpNow() : animate();
  }
  const centre = () => { const r = stage.getBoundingClientRect(); return [r.width / 2, r.height / 2]; };

  // ---- click a table: light it up with every table it links to ----
  function select(name) {
    if (!svg) return;
    svg.classList.toggle('erd-focus', !!name);
    const lit = new Set([name]);
    svg.querySelectorAll('.erd-edge').forEach((e) => {
      const on = !!name && (e.dataset.a === name || e.dataset.b === name);
      e.classList.toggle('on', on);
      if (on) { lit.add(e.dataset.a); lit.add(e.dataset.b); }
    });
    svg.querySelectorAll('.erd-table').forEach((t) => {
      t.classList.toggle('on', !!name && lit.has(t.dataset.t));
      t.classList.toggle('picked', t.dataset.t === name);
    });
  }

  // ---- load the diagram ----
  fetch(root.dataset.erd)
    .then((res) => { if (!res.ok) throw new Error(res.status); return res.text(); })
    .then((text) => {
      canvas.innerHTML = text;
      svg = canvas.querySelector('svg');
      W = svg.width.baseVal.value; H = svg.height.baseVal.value;
      fit(true);
    })
    .catch(() => {
      canvas.innerHTML = `<img src="${root.dataset.erd}" alt="Entity relationship diagram" class="erd-img">`;
      const img = canvas.querySelector('img');
      img.decode().catch(() => {}).then(() => { W = img.naturalWidth || 2000; H = img.naturalHeight || 1500; fit(true); });
    });

  // ---- scroll wheel: zoom around the pointer (a trackpad pinch arrives as ctrl + wheel) ----
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = stage.getBoundingClientRect();
    const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
    zoomAt(Math.exp(-dy * (e.ctrlKey ? 0.012 : 0.0016)), e.clientX - r.left, e.clientY - r.top);
    firstTouch();
  }, { passive: false });

  // ---- hold the wheel or left button and drag to move; two fingers to pinch ----
  const pts = new Map();
  let moved = false, pinch = 0, button = 0;
  // stop the browser's own "auto-scroll" circle when the wheel is pressed
  stage.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });
  stage.addEventListener('auxclick', (e) => { if (e.button === 1) e.preventDefault(); });
  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.button !== 1) return; // left button or wheel
    if (e.button === 1) e.preventDefault();
    button = e.button;
    try { stage.setPointerCapture(e.pointerId); } catch (err) { /* keep dragging without capture */ }
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    moved = false;
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); }
    root.classList.add('grabbing');
  });
  stage.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    const p = pts.get(e.pointerId), dx = e.clientX - p[0], dy = e.clientY - p[1];
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
    if (pts.size === 1) {
      goal.x += dx; goal.y += dy; jumpNow();
    } else if (pts.size === 2) {
      const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), r = stage.getBoundingClientRect();
      if (pinch) { zoomAt(d / pinch, (a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top); jumpNow(); }
      pinch = d;
    }
    if (moved) firstTouch();
  });
  function end(e) {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = 0;
    if (!pts.size) root.classList.remove('grabbing');
    // a left click that did not drag picks a table (or clears the pick)
    if (!moved && button === 0 && e.type === 'pointerup') {
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      const t = hit && hit.closest('.erd-table');
      select(t && !t.classList.contains('picked') ? t.dataset.t : null);
    }
  }
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
  stage.addEventListener('dblclick', (e) => {
    const r = stage.getBoundingClientRect();
    zoomAt(2, e.clientX - r.left, e.clientY - r.top);
  });

  function firstTouch() {
    if (touched) return;
    touched = true;
    hint.classList.add('gone');
  }

  // ---- buttons and keys ----
  root.querySelectorAll('[data-z]').forEach((b) =>
    b.addEventListener('click', () => {
      const [cx, cy] = centre();
      if (b.dataset.z === 'in') zoomAt(1.5, cx, cy);
      else if (b.dataset.z === 'out') zoomAt(1 / 1.5, cx, cy);
      else { select(null); fit(); }
    })
  );
  let lastSize = '';
  new ResizeObserver(() => {
    const size = stage.clientWidth + 'x' + stage.clientHeight;
    if (size !== lastSize) { const first = !lastSize; lastSize = size; if (first || !touched) fit(true); }
  }).observe(stage);

  stage.addEventListener('keydown', (e) => {
    const step = 80, [cx, cy] = centre();
    const k = {
      ArrowLeft: () => { goal.x += step; animate(); }, ArrowRight: () => { goal.x -= step; animate(); },
      ArrowUp: () => { goal.y += step; animate(); }, ArrowDown: () => { goal.y -= step; animate(); },
      '+': () => zoomAt(1.5, cx, cy), '=': () => zoomAt(1.5, cx, cy), '-': () => zoomAt(1 / 1.5, cx, cy),
      0: () => fit(), Escape: () => select(null),
    }[e.key];
    if (k) { e.preventDefault(); k(); }
  });
})();

/* ==================================================================
   HERO LANYARD v2 — a cute ID badge hanging from a short strap.

   Three.js draws it. There is NO physics engine any more: the motion is
   a handful of springs written by hand, so every number is easy to read
   and tune.

   Moving parts (all springs:  acceleration = -k * position - c * velocity)
     dropY   whole lanyard falls in from above and bounces slightly
     swing   the strap + card swing like a pendulum around the anchor
     bend    the strap bends a little and wobbles when the swing changes
     tilt    the card leans in 3D while you drag it
     flip    tap / click turns the card over

   k = stiffness (how hard it pulls back), c = damping (how fast it calms down).
   If you studied control systems: each one is a PD controller / 2nd-order system.
   ================================================================== */
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

/* ------------------------------------------------------------------
   CONFIG — everything you are likely to edit lives here.
   ------------------------------------------------------------------ */
const CONFIG = {
  /* ---- front of the card ---- */
  front: {
    nickname: 'PRAEW',               // biggest text
    firstName: 'WIPABHORN',
    lastName: 'SAEYANG',
    role: 'Full-Stack Developer',    // shown in the highlight colour
    badge: 'OPEN TO WORK',
    signature: 'Praew',
    // Where the QR code takes people. '' = the links page (links.html) next to
    // this page, wherever the site is hosted. Or paste one full URL here, e.g.
    // 'https://www.linkedin.com/in/your-name'. Shorter URL = bigger, easier-to-scan squares.
    qrUrl: '',
    qrCaption: 'scan me',
    photo: 'images/me.jpg', // if it can't be loaded, the initials are shown instead
    photoFocusY: 0,         // which part of a tall photo to keep: 0 = top, 0.5 = middle, 1 = bottom
    initials: 'WS',
  },

  /* ---- back of the card ---- */
  back: {
    tiny: 'ABOUT ME',
    title: 'What I do',
    rows: [
      { label: 'Frontend', text: 'Next.js, React, TypeScript and Tailwind CSS. Responsive, accessible interfaces.' },
      { label: 'Backend', text: 'NestJS REST APIs with JWT sign-in, 2FA and online payments (Stripe, Opn).' },
      { label: 'Database', text: 'PostgreSQL with Prisma: schema design and queries that keep data reliable.' },
    ],
    footer: 'Wipabhorn Saeyang',
  },

  /* ---- colours ---- */
  colors: {
    holder: 'rgba(225,210,255,0.16)', // clear plastic holder with a hint of lavender (last number = how see-through)
    holderLine: 'rgba(255,255,255,0.35)', // thin outline around the plastic
    holderDeep: '#AE9BEA', // footer gradient on the back
    inner: '#FDEFF5',      // inner card
    innerDeep: '#F8D9E8',
    swirl: '#F3B6D2',      // pink swirls behind the photo
    ink: '#1E1B2E',
    soft: '#766E8C',
    faint: '#B9AECB',
    accent: '#B39DF0',     // number pills on the back
    highlight: '#E5408A',  // "Full-Stack Developer"
    dot: '#6FD08A',        // "open to work" dot
    strap: '#F4E1F1',
    stitch: '#D8B6DA',
    clip: '#EEEAF4',
  },
  fonts: {
    display: '"DM Sans", sans-serif',
    body: '"Inter", sans-serif',
    script: '"Mrs Saint Delafield", cursive',
  },

  /* ---- size (fractions of the hero's height) ---- */
  size: {
    cardHeight: 0.55, // card is 55% of the hero height
    aspect: 0.7,      // width = height * aspect, so the width grows with the height
    strap: 0.17,      // visible strap length
    thickness: 0.012, // card thickness
  },

  /* ---- horizontal position: 0 = left edge, 1 = right edge ---- */
  layout: {
    mobileQuery: '(max-width: 820px)', // keep in sync with the CSS breakpoint
    desktopX: 0.73,
    mobileX: 0.5,
  },

  /* ---- motion feel ---- */
  motion: {
    dropStiffness: 55,  // drop-in spring: higher = lands faster
    dropDamping: 8.5,   // lower = more bounce when it lands
    dropKick: 0.35,     // small sideways swing given when it lands (rad/s)

    swingStiffness: 7,  // pendulum: higher = faster back-and-forth
    swingDamping: 1.8,  // higher = the swing dies out sooner

    bendStiffness: 90,  // strap wobble: higher = faster little shakes
    bendDamping: 4,     // lower = wobbles longer
    bendAmount: 0.05,   // how much the swing makes the strap bend

    dragMaxAngle: 0.22, // how far (rad) you can pull the card sideways — "a little"
    dragFollow: 60,     // how tightly the card follows your finger
    dragTilt: 0.12,     // how much the card leans in 3D while dragging
    maxTilt: 0.45,
    tiltStiffness: 60,
    tiltDamping: 9,

    flipStiffness: 120, // tap to flip: a quick turn with a small overshoot
    flipDamping: 13,

    clickMaxMove: 6,    // px — moving more than this is a drag, not a tap
    clickMaxTime: 400,  // ms
  },
};

/* ------------------------------------------------------------------ */

const hero = document.querySelector('.hero');
const canvas = document.querySelector('.hero-canvas');
if (hero && canvas) init();

function init() {
  const M = CONFIG.motion;
  const K = CONFIG.colors;
  const F = CONFIG.fonts;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mobileMq = window.matchMedia(CONFIG.layout.mobileQuery);

  /* ================================================================
     WORLD UNITS — the camera always shows exactly VIEW_H units of
     height, so "65% of the hero" is simply 0.65 * VIEW_H.
     ================================================================ */
  const VIEW_H = 10;
  const CARD_H = CONFIG.size.cardHeight * VIEW_H;
  const CARD_W = CARD_H * CONFIG.size.aspect;
  const THICK = CONFIG.size.thickness * VIEW_H;
  const RADIUS = CARD_W * 0.08;
  const HIDDEN = 0.5;                         // strap length hidden above the top edge
  const STRAP_LEN = CONFIG.size.strap * VIEW_H + HIDDEN;
  const CLIP_LEN = 0.35;                      // ring -> top of the card
  // slot (the hole the clip goes through), measured on the card
  const SLOT_W = CARD_W * 0.3;
  const SLOT_H = CARD_H * 0.045;
  const SLOT_Y = CARD_H * 0.06;               // from the top edge to the slot centre
  const PIVOT_TO_CENTER = STRAP_LEN + CLIP_LEN + CARD_H / 2; // pendulum length

  /* ================================================================
     RENDERER / SCENE / CAMERA
     ================================================================ */
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (err) {
    return; // no WebGL: the hero simply shows the text
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  scene.add(new THREE.AmbientLight(0xffffff, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(3, 4, 8);
  scene.add(sun);

  /* ================================================================
     CARD TEXTURES — drawn with the Canvas 2D API.
     The canvas has the same proportions as the card, so canvas pixels
     map 1:1 onto the card.
     ================================================================ */
  const TW = 900;
  const TH = Math.round(TW / CONFIG.size.aspect);
  const PX = TW / CARD_W; // canvas pixels per world unit
  const frontCanvas = makeCanvas(TW, TH);
  const backCanvas = makeCanvas(TW, TH);
  const frontTex = makeTexture(frontCanvas);
  const backTex = makeTexture(backCanvas);
  let photo = null;

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  function makeTexture(c) {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function spacing(ctx, px) {
    if ('letterSpacing' in ctx) ctx.letterSpacing = px + 'px';
  }
  function wrapLines(ctx, text, maxWidth) {
    const lines = [];
    let line = '';
    text.split(' ').forEach((word) => {
      const test = line ? line + ' ' + word : word;
      if (line && ctx.measureText(test).width > maxWidth) {
        lines.push(line);
        line = word;
      } else line = test;
    });
    if (line) lines.push(line);
    return lines;
  }
  // four-pointed sparkle ✦
  function sparkle(ctx, x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.quadraticCurveTo(x, y, x - r, y);
    ctx.quadraticCurveTo(x, y, x, y - r);
    ctx.fill();
  }

  // inner card rectangle (same on both faces)
  const IN = { x: 46, y: 150, w: TW - 92, h: TH - 150 - 46, r: 34 };

  /* --- the clear plastic holder: shared by front and back --- */
  function drawHolder(ctx) {
    ctx.clearRect(0, 0, TW, TH); // transparent canvas = see-through plastic
    const R = RADIUS * PX;

    // very light frosted fill
    ctx.fillStyle = K.holder;
    roundRect(ctx, 0, 0, TW, TH, R);
    ctx.fill();

    // glossy diagonal sheen, like shiny plastic
    const sheen = ctx.createLinearGradient(0, 0, TW, TH * 0.6);
    sheen.addColorStop(0, 'rgba(255,255,255,0.55)');
    sheen.addColorStop(0.4, 'rgba(255,255,255,0.08)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    roundRect(ctx, 0, 0, TW, TH, R);
    ctx.fill();

    // thin outline + bright rim just inside it
    ctx.strokeStyle = K.holderLine;
    ctx.lineWidth = 4;
    roundRect(ctx, 2, 2, TW - 4, TH - 4, R - 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 6;
    roundRect(ctx, 12, 12, TW - 24, TH - 24, R - 12);
    ctx.stroke();

    // raised ring around the slot (the hole itself is cut in the 3D shape)
    const sw = SLOT_W * PX, sh = SLOT_H * PX, sy = SLOT_Y * PX;
    ctx.strokeStyle = K.holderLine;
    ctx.lineWidth = 10;
    roundRect(ctx, TW / 2 - sw / 2 - 12, sy - sh / 2 - 12, sw + 24, sh + 24, (sh + 24) / 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 5;
    ctx.stroke();

    // inner card with a soft shadow
    ctx.save();
    ctx.shadowColor = 'rgba(90,60,150,0.22)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 6;
    const ig = ctx.createLinearGradient(0, IN.y, 0, IN.y + IN.h);
    ig.addColorStop(0, K.inner);
    ig.addColorStop(1, K.innerDeep);
    ctx.fillStyle = ig;
    roundRect(ctx, IN.x, IN.y, IN.w, IN.h, IN.r);
    ctx.fill();
    ctx.restore();
  }

  function drawFront() {
    const ctx = frontCanvas.getContext('2d');
    const T = CONFIG.front;
    drawHolder(ctx);

    /* --- photo area: top part of the inner card (no text on it) --- */
    const ph = 620;
    ctx.save();
    roundRect(ctx, IN.x, IN.y, IN.w, IN.h, IN.r);
    ctx.clip();
    ctx.beginPath();
    ctx.rect(IN.x, IN.y, IN.w, ph);
    ctx.clip();

    // pink swirls background (shows when there is no photo)
    ctx.fillStyle = '#FBE3EE';
    ctx.fillRect(IN.x, IN.y, IN.w, ph);
    [[0.15, 0.75, 360], [0.85, 0.3, 300], [0.55, 0.55, 220]].forEach(([fx, fy, r]) => {
      const cx = IN.x + IN.w * fx, cy = IN.y + ph * fy;
      const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      rg.addColorStop(0, K.swirl);
      rg.addColorStop(1, 'rgba(243,182,210,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(IN.x, IN.y, IN.w, ph);
    });

    if (photo) {
      // "object-fit: cover", but for a tall photo keep the TOP (photoFocusY)
      const s = Math.max(IN.w / photo.width, ph / photo.height);
      const dw = photo.width * s, dh = photo.height * s;
      const dx = IN.x + (IN.w - dw) / 2;
      const dy = IN.y - (dh - ph) * T.photoFocusY;
      ctx.drawImage(photo, dx, dy, dw, dh); // drawn as-is: no colour overlay on the photo
    } else {
      ctx.fillStyle = '#FFFFFF';
      ctx.shadowColor = 'rgba(214,120,170,0.55)';
      ctx.shadowBlur = 30;
      ctx.font = '700 230px ' + F.display;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(T.initials, TW / 2, IN.y + ph / 2 + 20);
      ctx.shadowBlur = 0;
    }
    // a few sparkles (decoration only, no text)
    sparkle(ctx, IN.x + 70, IN.y + 520, 20, 'rgba(255,255,255,0.95)');
    sparkle(ctx, IN.x + 110, IN.y + 570, 11, 'rgba(255,255,255,0.85)');
    sparkle(ctx, IN.x + IN.w - 70, IN.y + 90, 16, 'rgba(255,255,255,0.9)');
    ctx.restore();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    /* --- info area --- */
    const top = IN.y + ph;
    const colX = IN.x + IN.w * 0.6; // vertical divider
    ctx.strokeStyle = 'rgba(30,27,46,0.12)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(colX, top + 40);
    ctx.lineTo(colX, IN.y + IN.h - 40);
    ctx.stroke();

    // left column
    const leftX = IN.x + 40, leftW = colX - leftX - 30;
    ctx.fillStyle = K.ink;
    let size = 128; // PRAEW: biggest, shrinks only if it doesn't fit
    do {
      ctx.font = '700 ' + size + 'px ' + F.display;
      size -= 2;
    } while (size > 40 && ctx.measureText(T.nickname).width > leftW);
    spacing(ctx, -3);
    ctx.fillText(T.nickname, leftX, top + 135);
    spacing(ctx, 0);

    ctx.font = '600 34px ' + F.display; // first + last name: same smaller size
    spacing(ctx, 5);
    ctx.fillText(T.firstName, leftX + 4, top + 195);
    ctx.fillText(T.lastName, leftX + 4, top + 240);
    spacing(ctx, 0);

    ctx.fillStyle = K.highlight;
    ctx.font = '600 33px ' + F.body; // 600 is the heaviest Inter weight the page loads
    ctx.fillText(T.role, leftX + 2, top + 305);

    // "open to work" pill
    ctx.font = '600 19px ' + F.body;
    spacing(ctx, 3);
    const pillW = ctx.measureText(T.badge).width + 78;
    const pillY = top + 345;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    roundRect(ctx, leftX, pillY, pillW, 50, 25);
    ctx.fill();
    ctx.fillStyle = K.dot;
    ctx.beginPath(); ctx.arc(leftX + 28, pillY + 25, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(30,27,46,0.6)';
    ctx.fillText(T.badge, leftX + 48, pillY + 32);
    spacing(ctx, 0);

    // right column: signature + scannable QR code
    const rx = colX + 30, rw = IN.x + IN.w - 36 - rx;
    ctx.fillStyle = 'rgba(30,27,46,0.85)';
    ctx.font = '100px ' + F.script;
    ctx.textAlign = 'center';
    ctx.fillText(T.signature, rx + rw / 2, top + 125);

    if (qrFactory) {
      // QR code: a 2D barcode. Any phone camera can read it.
      // 'L' = lowest error correction: fewer, bigger squares for the same URL
      const qr = qrFactory(0, 'L');   // 0 = pick the smallest size that fits
      qr.addData(T.qrUrl || new URL('links.html', location.href).href);
      qr.make();
      const n = qr.getModuleCount();
      const box = Math.min(rw, 236);
      const quiet = 2;                // white margin (in modules) so scanners find the edges
      const cell = Math.floor(box / (n + quiet * 2));
      const qs = cell * (n + quiet * 2);
      const qx = Math.round(rx + (rw - qs) / 2), qy = top + 160;
      ctx.fillStyle = '#FFFFFF';
      roundRect(ctx, qx, qy, qs, qs, 14);
      ctx.fill();
      ctx.fillStyle = K.ink;
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          if (qr.isDark(r, c)) ctx.fillRect(qx + (c + quiet) * cell, qy + (r + quiet) * cell, cell, cell);
        }
      }
      ctx.fillStyle = 'rgba(30,27,46,0.5)';
      ctx.font = '600 18px ' + F.body;
      spacing(ctx, 4);
      ctx.fillText(T.qrCaption.toUpperCase() + ' ♡', rx + rw / 2, qy + qs + 36);
      spacing(ctx, 0);
    }
    ctx.textAlign = 'left';

    frontTex.needsUpdate = true;
  }

  function drawBack() {
    const ctx = backCanvas.getContext('2d');
    const T = CONFIG.back;
    drawHolder(ctx);

    const x = IN.x + 50, w = IN.w - 100;
    ctx.textBaseline = 'alphabetic';

    ctx.fillStyle = 'rgba(30,27,46,0.45)';
    ctx.font = '600 18px ' + F.body;
    spacing(ctx, 4);
    ctx.fillText(T.tiny, x, IN.y + 80);
    spacing(ctx, 0);

    ctx.fillStyle = K.ink;
    ctx.font = '700 84px ' + F.display;
    spacing(ctx, -2);
    ctx.fillText(T.title, x, IN.y + 180);
    spacing(ctx, 0);
    sparkle(ctx, IN.x + IN.w - 90, IN.y + 110, 26, K.accent);
    sparkle(ctx, IN.x + IN.w - 140, IN.y + 165, 14, K.swirl);

    const footerH = 120;
    let y = IN.y + 240;
    const rowH = (IN.y + IN.h - footerH - 30 - y) / T.rows.length;
    T.rows.forEach((row, i) => {
      ctx.fillStyle = 'rgba(30,27,46,0.1)';
      ctx.fillRect(x, y, w, 2);

      ctx.fillStyle = K.accent;
      roundRect(ctx, x, y + 34, 72, 44, 22);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '600 22px ' + F.body;
      ctx.textAlign = 'center';
      ctx.fillText('0' + (i + 1), x + 36, y + 64);
      ctx.textAlign = 'left';

      ctx.fillStyle = K.ink;
      ctx.font = '600 46px ' + F.display;
      ctx.fillText(row.label, x + 96, y + 72);

      ctx.fillStyle = K.soft;
      ctx.font = '400 29px ' + F.body;
      wrapLines(ctx, row.text, w).forEach((line, n) => ctx.fillText(line, x, y + 128 + n * 40));
      y += rowH;
    });

    // footer strip, clipped to the inner card's rounded bottom
    ctx.save();
    roundRect(ctx, IN.x, IN.y, IN.w, IN.h, IN.r);
    ctx.clip();
    const fy = IN.y + IN.h - footerH;
    const fg = ctx.createLinearGradient(IN.x, 0, IN.x + IN.w, 0);
    fg.addColorStop(0, K.holderDeep);
    fg.addColorStop(1, K.swirl);
    ctx.fillStyle = fg;
    ctx.fillRect(IN.x, fy, IN.w, footerH);
    ctx.restore();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '600 30px ' + F.display;
    ctx.fillText(T.footer, x, fy + 72);
    sparkle(ctx, IN.x + IN.w - 70, fy + footerH / 2, 20, '#FFFFFF');

    backTex.needsUpdate = true;
  }

  // QR code library (tiny). Loaded on its own, so the card still shows if it fails.
  let qrFactory = null;
  import('https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/+esm')
    .then((m) => { qrFactory = m.default; drawFront(); })
    .catch(() => {});

  drawFront();
  drawBack();
  // canvas text uses whatever font is ready at draw time, so redraw when
  // the web fonts have loaded
  if (document.fonts && document.fonts.load) {
    Promise.all([
      document.fonts.load('700 64px "DM Sans"'),
      document.fonts.load('600 64px "DM Sans"'),
      document.fonts.load('400 26px "Inter"'),
      document.fonts.load('600 26px "Inter"'),
      document.fonts.load('64px "Mrs Saint Delafield"'),
    ]).then(() => { drawFront(); drawBack(); }).catch(() => {});
  }
  const img = new Image();
  img.onload = () => { photo = img; drawFront(); };
  img.src = CONFIG.front.photo;

  /* ================================================================
     MESHES

     hangGroup  sits at the bottom of the strap (the ring) and rotates
     │          with the swing. Holds the clip.
     └ tiltGroup  hinge at the top edge of the card: 3D lean + flip
       └ cardGroup  the card itself, moved down so its top is at the hinge
     ================================================================ */
  function cardShape() {
    const s = new THREE.Shape();
    const x = -CARD_W / 2, y = -CARD_H / 2, w = CARD_W, h = CARD_H, r = RADIUS;
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y);
    s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r);
    s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h);
    s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r);
    s.quadraticCurveTo(x, y, x + r, y);
    // the slot is a real hole, so you can see through it
    const hole = new THREE.Path();
    const hw = SLOT_W / 2, hh = SLOT_H / 2, cy = CARD_H / 2 - SLOT_Y;
    hole.absarc(-hw + hh, cy, hh, Math.PI / 2, Math.PI * 1.5, false);
    hole.absarc(hw - hh, cy, hh, Math.PI * 1.5, Math.PI * 2.5, false);
    s.holes.push(hole);
    return s;
  }
  // flat face whose UVs run 0..1 across the whole card, so the canvas maps 1:1
  function faceGeometry() {
    const g = new THREE.ShapeGeometry(cardShape(), 10);
    const pos = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      uv.setXY(i, pos.getX(i) / CARD_W + 0.5, pos.getY(i) / CARD_H + 0.5);
    }
    return g;
  }

  const hangGroup = new THREE.Group();
  const tiltGroup = new THREE.Group();
  const cardGroup = new THREE.Group();
  scene.add(hangGroup);
  hangGroup.add(tiltGroup);
  tiltGroup.position.y = -CLIP_LEN;
  tiltGroup.add(cardGroup);
  cardGroup.position.y = -CARD_H / 2;

  const edge = new THREE.Mesh(
    new THREE.ExtrudeGeometry(cardShape(), { depth: THICK, bevelEnabled: false, curveSegments: 10 })
      .translate(0, 0, -THICK / 2),
    [
      new THREE.MeshBasicMaterial({ visible: false }), // front/back caps: hidden, the faces draw these
      new THREE.MeshStandardMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.6, roughness: 0.2 }), // sides
    ]
  );
  const faceZ = THICK / 2 + 0.002;
  const front = new THREE.Mesh(faceGeometry(), new THREE.MeshStandardMaterial({ map: frontTex, roughness: 0.3, transparent: true }));
  front.position.z = faceZ;
  const back = new THREE.Mesh(faceGeometry(), new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.3, transparent: true }));
  back.position.z = -faceZ;
  back.rotation.y = Math.PI; // faces the other way, so its text isn't mirrored
  cardGroup.add(edge, front, back);

  // clip: a ring at the end of the strap + a little plate down into the slot
  const metal = new THREE.MeshStandardMaterial({ color: K.clip, roughness: 0.3, metalness: 0.5 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.035, 12, 32), metal);
  const plateLen = CLIP_LEN + SLOT_Y - 0.08;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.34, plateLen, THICK * 2.6), metal);
  plate.position.y = -0.08 - plateLen / 2;
  hangGroup.add(ring, plate);

  /* Strap: a flat ribbon with stitched edges. It is rebuilt every frame
     along a curve from the anchor to the ring, bent by `bend`. */
  const strapTexCanvas = makeCanvas(64, 128);
  {
    const ctx = strapTexCanvas.getContext('2d');
    ctx.fillStyle = K.strap;
    ctx.fillRect(0, 0, 64, 128);
    const sh = ctx.createLinearGradient(0, 0, 64, 0);
    sh.addColorStop(0, 'rgba(0,0,0,0.06)');
    sh.addColorStop(0.5, 'rgba(255,255,255,0.35)');
    sh.addColorStop(1, 'rgba(0,0,0,0.06)');
    ctx.fillStyle = sh;
    ctx.fillRect(0, 0, 64, 128);
    ctx.fillStyle = K.stitch;
    for (let y = 4; y < 128; y += 22) {
      ctx.fillRect(8, y, 4, 12);
      ctx.fillRect(52, y, 4, 12);
    }
  }
  const strapTex = makeTexture(strapTexCanvas);
  strapTex.wrapT = THREE.RepeatWrapping;

  const STRAP_W = 0.34;
  const SAMPLES = 24;
  const strapPos = new Float32Array((SAMPLES + 1) * 2 * 3);
  const strapUv = new Float32Array((SAMPLES + 1) * 2 * 2);
  const strapGeo = new THREE.BufferGeometry();
  strapGeo.setAttribute('position', new THREE.BufferAttribute(strapPos, 3));
  strapGeo.setAttribute('uv', new THREE.BufferAttribute(strapUv, 2));
  const idx = [];
  for (let i = 0; i < SAMPLES; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  strapGeo.setIndex(idx);
  for (let i = 0; i <= SAMPLES; i++) {
    const v = (i / SAMPLES) * (STRAP_LEN / STRAP_W) * 0.5; // stitches stay the same size
    strapUv.set([0, v, 1, v], i * 4);
  }
  const strapMesh = new THREE.Mesh(
    strapGeo,
    new THREE.MeshBasicMaterial({ map: strapTex, side: THREE.DoubleSide }) // unlit, so the colour stays exactly as set
  );
  strapMesh.frustumCulled = false; // its bounds change every frame
  scene.add(strapMesh);

  /* ================================================================
     MOTION STATE — each pair is (position, velocity) of one spring
     ================================================================ */
  let dropY = reduceMotion ? 0 : VIEW_H * 1.1, dropV = 0; // starts above the screen
  let landed = reduceMotion;
  let swing = 0, swingV = 0;    // pendulum angle (rad)
  let bend = 0, bendV = 0;      // strap bend
  let tiltX = 0, tiltXV = 0;    // lean forward/back
  let tiltY = 0, tiltYV = 0;    // lean left/right
  let flip = 0, flipV = 0, flipTarget = 0;

  // one spring step: returns [newPosition, newVelocity]
  function spring(x, v, target, k, c, dt, extraAcc = 0) {
    const a = k * (target - x) - c * v + extraAcc;
    v += a * dt;
    return [x + v * dt, v, a];
  }

  /* ================================================================
     LAYOUT — fit VIEW_H units in the canvas height; place the anchor
     ================================================================ */
  let viewW = 1, anchorX = 0;
  const anchorY = VIEW_H / 2 + HIDDEN;
  function layout() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    viewW = VIEW_H * camera.aspect;
    camera.position.set(0, 0, VIEW_H / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    camera.updateProjectionMatrix();
    const fx = mobileMq.matches ? CONFIG.layout.mobileX : CONFIG.layout.desktopX;
    const limit = Math.max(0, viewW / 2 - CARD_W / 2 - 0.3); // keep the card on screen
    anchorX = THREE.MathUtils.clamp((fx - 0.5) * viewW, -limit, limit);
  }
  layout();
  new ResizeObserver(() => { layout(); if (!running) render(); }).observe(canvas);

  /* ================================================================
     INPUT — drag a little, tap to flip
     The canvas has pointer-events:none (CSS), so scrolling and the
     buttons always work. We listen on .hero and only take over when
     the press lands on the card.
     ================================================================ */
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const hitPoint = new THREE.Vector3();
  let drag = null; // { id, x, y, time, moved, worldX, worldY, startSwing }
  let targetSwing = 0, targetTiltX = 0, targetTiltY = 0;

  function setRay(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
  }
  function hitsCard(e) {
    setRay(e);
    return raycaster.intersectObjects([edge, front, back], false).length > 0;
  }
  function pointerWorld(e) {
    setRay(e);
    raycaster.ray.intersectPlane(plane, hitPoint);
    return hitPoint;
  }

  hero.addEventListener('pointerdown', (e) => {
    if (drag || !landed || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (e.target.closest('a, button')) return;
    if (!hitsCard(e)) return;
    e.preventDefault();
    const p = pointerWorld(e);
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, time: performance.now(), moved: false,
             worldX: p.x, worldY: p.y, startSwing: swing };
    // start from where the card is now, not from where the last drag ended
    targetSwing = swing;
    targetTiltX = targetTiltY = 0;
    try { hero.setPointerCapture(e.pointerId); } catch (err) {}
    hero.classList.add('is-dragging');
  });

  hero.addEventListener('pointermove', (e) => {
    if (drag && e.pointerId === drag.id) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > M.clickMaxMove) drag.moved = true;
      if (reduceMotion) return;
      const p = pointerWorld(e);
      const dx = p.x - drag.worldX, dy = p.y - drag.worldY;
      // sideways drag swings the card, but only a little (clamped)
      targetSwing = THREE.MathUtils.clamp(drag.startSwing + dx / PIVOT_TO_CENTER, -M.dragMaxAngle, M.dragMaxAngle);
      // and leans it in 3D toward the finger
      targetTiltY = THREE.MathUtils.clamp(dx * M.dragTilt, -M.maxTilt, M.maxTilt);
      targetTiltX = THREE.MathUtils.clamp(-dy * M.dragTilt, -M.maxTilt, M.maxTilt);
    } else if (!drag && e.pointerType === 'mouse') {
      hero.classList.toggle('is-grabbable', landed && hitsCard(e));
    }
  });

  function endDrag(e, cancelled) {
    if (!drag || e.pointerId !== drag.id) return;
    hero.classList.remove('is-dragging');
    if (hero.hasPointerCapture(e.pointerId)) hero.releasePointerCapture(e.pointerId);
    const wasTap = !cancelled && !drag.moved && performance.now() - drag.time < M.clickMaxTime;
    drag = null;
    targetTiltX = targetTiltY = 0; // spring back upright; the swing carries on by itself
    if (wasTap) {
      flipTarget += Math.PI;
      if (reduceMotion) flip = flipTarget;
      else swingV += 0.25; // tiny rock so the flip feels physical
    }
  }
  hero.addEventListener('pointerup', (e) => endDrag(e, false));
  hero.addEventListener('pointercancel', (e) => endDrag(e, true));
  // touch: .hero has `touch-action: pan-y` (CSS), so a vertical swipe always
  // scrolls the page, even when it starts on the card (the browser then sends
  // pointercancel, which ends the drag). Sideways moves still swing the card.

  /* ================================================================
     UPDATE — runs every frame
     ================================================================ */
  function update(dt) {
    // 1. DROP-IN: spring from above the screen down to 0, small bounce
    if (!landed) {
      [dropY, dropV] = spring(dropY, dropV, 0, M.dropStiffness, M.dropDamping, dt);
      if (Math.abs(dropY) < 0.01 && Math.abs(dropV) < 0.05) {
        dropY = 0; dropV = 0; landed = true;
      }
      if (dropV > 0 && swingV === 0) swingV = M.dropKick; // first bounce: start a small swing
    }

    // 2. SWING: while dragging, follow the finger; otherwise a damped pendulum
    let swingAcc;
    if (drag) [swing, swingV, swingAcc] = spring(swing, swingV, targetSwing, M.dragFollow, 12, dt);
    else [swing, swingV, swingAcc] = spring(swing, swingV, 0, M.swingStiffness, M.swingDamping, dt);

    // 3. STRAP BEND: pushed by the swing's acceleration (and the landing),
    //    so the strap shivers a little whenever the motion changes
    const push = -swingAcc * M.bendAmount - dropV * 0.002;
    [bend, bendV] = spring(bend, bendV, 0, M.bendStiffness, M.bendDamping, dt, push * M.bendStiffness);

    // 4. TILT + FLIP
    [tiltX, tiltXV] = spring(tiltX, tiltXV, targetTiltX, M.tiltStiffness, M.tiltDamping, dt);
    [tiltY, tiltYV] = spring(tiltY, tiltYV, targetTiltY, M.tiltStiffness, M.tiltDamping, dt);
    [flip, flipV] = spring(flip, flipV, flipTarget, M.flipStiffness, M.flipDamping, dt);
  }

  /* ================================================================
     RENDER — turn the numbers above into positions
     ================================================================ */
  const A = new THREE.Vector3(), P = new THREE.Vector3(), C = new THREE.Vector3();
  const pt = new THREE.Vector3(), tan = new THREE.Vector3(), side = new THREE.Vector3();
  const Z = new THREE.Vector3(0, 0, 1);
  const curve = new THREE.QuadraticBezierCurve3(A, C, P);

  function render() {
    // anchor (top of strap) and ring (bottom of strap)
    A.set(anchorX, anchorY + dropY, 0);
    P.set(A.x + Math.sin(swing) * STRAP_LEN, A.y - Math.cos(swing) * STRAP_LEN, 0);
    // bend: push the middle of the strap sideways
    C.set((A.x + P.x) / 2 + Math.cos(swing) * bend, (A.y + P.y) / 2 + Math.sin(swing) * bend, 0);

    hangGroup.position.copy(P);
    hangGroup.rotation.z = swing + bend * 0.6; // the card lags the strap a little
    tiltGroup.rotation.set(tiltX, tiltY + flip, 0);

    for (let i = 0; i <= SAMPLES; i++) {
      const t = i / SAMPLES;
      curve.getPoint(t, pt);
      curve.getTangent(t, tan);
      side.crossVectors(tan, Z).normalize().multiplyScalar(STRAP_W / 2);
      strapPos.set([pt.x - side.x, pt.y - side.y, -0.02, pt.x + side.x, pt.y + side.y, -0.02], i * 6);
    }
    strapGeo.attributes.position.needsUpdate = true;
    renderer.render(scene, camera);
  }

  /* ================================================================
     LOOP — only while the hero is on screen
     ================================================================ */
  let running = false, rafId = 0, last = 0;
  function frame(now) {
    rafId = requestAnimationFrame(frame);
    // small fixed sub-steps keep the springs stable on slow frames
    let dt = Math.min((now - last) / 1000, 1 / 20);
    last = now;
    while (dt > 0) {
      const step = Math.min(dt, 1 / 120);
      update(step);
      dt -= step;
    }
    render();
  }
  function start() {
    if (running) return;
    running = true;
    last = performance.now();
    rafId = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(rafId);
  }
  new IntersectionObserver((entries) => {
    entries[0].isIntersecting ? start() : stop();
  }).observe(hero);
  render();
}

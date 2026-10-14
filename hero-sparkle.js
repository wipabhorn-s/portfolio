/* ==================================================================
   HERO SPARKLE — the night-sky effects behind and in front of the card.

     1. Twinkling stars   (canvas .hero-stars, behind everything)
        - tiny dots + a few pink/lavender 4-point sparkles
        - each one fades in and out on its own sine wave
        - they drift slightly with the mouse (parallax: near stars move more)
     2. Shooting stars    (same canvas) every few seconds
     3. Cursor sparkles   (canvas .hero-trail, in front) little stars that
                          pop out where the mouse moves, then fall and fade

   Plain Canvas 2D, no libraries. Every number you may want to tweak is
   in SETTINGS.
   ================================================================== */
(function () {
  var SETTINGS = {
    starsPer100k: 14,        // star density: stars per 100,000 px² of hero
    sparkleShare: 0.12,      // share of stars drawn as 4-point sparkles
    colors: ['#FFFFFF', '#FFFFFF', '#F7B6D2', '#C9B8F5', '#FFD6EA'],
    twinkleSpeed: [0.6, 2.2],// random range, radians per second
    parallax: 14,            // px the nearest stars shift with the mouse
    shootingEvery: [3, 7],   // seconds between shooting stars (random range)
    trailPerMove: 2,         // cursor sparkles spawned per mouse move
    trailLife: 0.9,          // seconds a cursor sparkle lives
    trailColors: ['#FF6FAE', '#F7B6D2', '#C9B8F5', '#FFFFFF'],
  };

  var hero = document.querySelector('.hero, .links-page'); // the links page reuses the same sky
  var bg = document.querySelector('.hero-stars');
  var fg = document.querySelector('.hero-trail');
  if (!hero || !bg) return; // .hero-trail is optional: leave it out for no cursor sparkles

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var bctx = bg.getContext('2d');
  var fctx = fg ? fg.getContext('2d') : null;
  var W = 0, H = 0, dpr = 1;
  var stars = [], shooters = [], trail = [];
  var mouseX = 0, mouseY = 0;     // -1..1 from the centre (for parallax)
  var smoothX = 0, smoothY = 0;   // eased version, so the parallax glides
  var nextShoot = 2;

  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  /* ---------- setup / resize ---------- */
  function resize() {
    var r = hero.getBoundingClientRect();
    W = r.width; H = r.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    [bg, fg].forEach(function (c) {
      if (!c) return;
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    });
    // draw in CSS pixels; the transform scales up for sharp retina output
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (fctx) fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    makeStars();
    if (reduceMotion) drawStars(0);
  }

  function makeStars() {
    var count = Math.round((W * H) / 100000 * SETTINGS.starsPer100k);
    stars = [];
    for (var i = 0; i < count; i++) {
      var sparkle = Math.random() < SETTINGS.sparkleShare;
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        depth: Math.random(),                        // 0 = far, 1 = near
        size: sparkle ? rand(4, 9) : rand(0.5, 1.8),
        sparkle: sparkle,
        color: sparkle ? pick(SETTINGS.colors.slice(2)) : pick(SETTINGS.colors),
        phase: Math.random() * Math.PI * 2,
        speed: rand(SETTINGS.twinkleSpeed[0], SETTINGS.twinkleSpeed[1]),
      });
    }
  }

  /* ---------- drawing helpers ---------- */
  // 4-point sparkle: four curved spikes meeting in the middle
  function drawSparkle(ctx, x, y, r) {
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.quadraticCurveTo(x, y, x - r, y);
    ctx.quadraticCurveTo(x, y, x, y - r);
    ctx.fill();
  }

  /* ---------- 1. stars ---------- */
  function drawStars(time) {
    bctx.clearRect(0, 0, W, H);
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      // brightness swings between 0.15 and 1 on a sine wave
      var twinkle = reduceMotion ? 0.7 : 0.575 + 0.425 * Math.sin(time * s.speed + s.phase);
      var x = s.x - smoothX * SETTINGS.parallax * s.depth;
      var y = s.y - smoothY * SETTINGS.parallax * s.depth;
      bctx.globalAlpha = twinkle;
      bctx.fillStyle = s.color;
      if (s.sparkle) {
        bctx.shadowColor = s.color;
        bctx.shadowBlur = 8;
        drawSparkle(bctx, x, y, s.size * (0.6 + 0.4 * twinkle)); // also grows a little
        bctx.shadowBlur = 0;
      } else {
        bctx.beginPath();
        bctx.arc(x, y, s.size, 0, Math.PI * 2);
        bctx.fill();
      }
    }
    bctx.globalAlpha = 1;
  }

  /* ---------- 2. shooting stars ---------- */
  function spawnShooter() {
    var angle = rand(0.35, 0.6); // radians below horizontal: heading down-right
    shooters.push({
      x: rand(-0.1, 0.6) * W,
      y: rand(-0.05, 0.35) * H,
      vx: Math.cos(angle) * rand(700, 1000),
      vy: Math.sin(angle) * rand(700, 1000),
      life: 0,
      maxLife: rand(0.7, 1.1),
    });
  }
  function drawShooters(dt) {
    for (var i = shooters.length - 1; i >= 0; i--) {
      var s = shooters[i];
      s.life += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      var t = s.life / s.maxLife;
      if (t >= 1) { shooters.splice(i, 1); continue; }
      var fade = Math.sin(t * Math.PI);          // fades in, then out
      var tail = 0.12;                            // tail length in seconds of travel
      var tx = s.x - s.vx * tail, ty = s.y - s.vy * tail;
      var g = bctx.createLinearGradient(tx, ty, s.x, s.y);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(255,214,234,' + fade + ')');
      bctx.strokeStyle = g;
      bctx.lineWidth = 2;
      bctx.lineCap = 'round';
      bctx.beginPath();
      bctx.moveTo(tx, ty);
      bctx.lineTo(s.x, s.y);
      bctx.stroke();
      bctx.globalAlpha = fade;
      bctx.fillStyle = '#FFFFFF';
      bctx.beginPath();
      bctx.arc(s.x, s.y, 2, 0, Math.PI * 2);
      bctx.fill();
      bctx.globalAlpha = 1;
    }
  }

  /* ---------- 3. cursor sparkles ---------- */
  function addTrail(x, y) {
    for (var i = 0; i < SETTINGS.trailPerMove; i++) {
      trail.push({
        x: x + rand(-6, 6),
        y: y + rand(-6, 6),
        vx: rand(-30, 30),
        vy: rand(-50, 10),
        size: rand(3, 8),
        spin: rand(-3, 3),
        angle: Math.random() * Math.PI,
        color: pick(SETTINGS.trailColors),
        life: 0,
      });
    }
    if (trail.length > 160) trail.splice(0, trail.length - 160); // keep it light
  }
  function drawTrail(dt) {
    fctx.clearRect(0, 0, W, H);
    for (var i = trail.length - 1; i >= 0; i--) {
      var p = trail[i];
      p.life += dt;
      var t = p.life / SETTINGS.trailLife;
      if (t >= 1) { trail.splice(i, 1); continue; }
      p.vy += 120 * dt;             // a little gravity: they float down
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.angle += p.spin * dt;
      fctx.save();
      fctx.translate(p.x, p.y);
      fctx.rotate(p.angle);
      fctx.globalAlpha = 1 - t;     // fade out over its life
      fctx.fillStyle = p.color;
      fctx.shadowColor = p.color;
      fctx.shadowBlur = 6;
      drawSparkle(fctx, 0, 0, p.size * (1 - t * 0.5));
      fctx.restore();
    }
  }

  /* ---------- input ---------- */
  hero.addEventListener('pointermove', function (e) {
    var r = hero.getBoundingClientRect();
    var x = e.clientX - r.left, y = e.clientY - r.top;
    mouseX = (x / r.width) * 2 - 1;
    mouseY = (y / r.height) * 2 - 1;
    if (fctx && !reduceMotion && e.pointerType === 'mouse') addTrail(x, y);
  });
  hero.addEventListener('pointerleave', function () { mouseX = 0; mouseY = 0; });

  /* ---------- loop (only while the hero is visible) ---------- */
  var running = false, raf = 0, last = 0, clock = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    var dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    clock += dt;
    // ease the parallax toward the mouse (6% of the way each frame)
    smoothX += (mouseX - smoothX) * 0.06;
    smoothY += (mouseY - smoothY) * 0.06;

    nextShoot -= dt;
    if (nextShoot <= 0) {
      spawnShooter();
      nextShoot = rand(SETTINGS.shootingEvery[0], SETTINGS.shootingEvery[1]);
    }
    drawStars(clock);
    drawShooters(dt);
    if (fctx) drawTrail(dt);
  }
  function start() {
    if (running || reduceMotion) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  resize();
  new ResizeObserver(resize).observe(hero);
  new IntersectionObserver(function (entries) {
    entries[0].isIntersecting ? start() : stop();
  }).observe(hero);
})();

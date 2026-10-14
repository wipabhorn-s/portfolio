(function(){
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var palette = ['#F7B6D2','#C9B8F5','#FF6FAE','#8E6BD8','#FBD3E4','#5B3A8C','#E9A4E0','#B79BF0','#D9327E','#F3C6F0','#7A4FB8','#FF9CC8','#A486E8','#E8C9FF'];

  /* ---- build the orbit ring (Technique B) ---- */
  var ring = document.getElementById('ring');
  var count = 14, radius = 220;
  for (var i = 0; i < count; i++){
    var angle = (360 / count) * i;
    var slot = document.createElement('div');
    slot.className = 'slot';
    // the radius comes from CSS (--orbit-r), so the ring can shrink on small screens
    slot.style.transform = 'rotate(' + angle + 'deg) translate(var(--orbit-r, ' + radius + 'px)) rotate(' + (-angle) + 'deg)';
    var tile = document.createElement('div');
    tile.className = 'tile';
    tile.style.background = palette[i % palette.length];
    slot.appendChild(tile);
    ring.appendChild(slot);
  }

  /* ---- build the vertical auto-scroll strip (Technique C) ---- */
  var track = document.getElementById('vTrack');
  var vShots = ['images/learnora.jpg', 'images/aum-stocks.jpg']; // covers of the live projects
  for (var loop = 0; loop < 2; loop++){ // duplicate set = seamless loop
    vShots.forEach(function(src){
      var t = document.createElement('div');
      t.className = 'vtile';
      t.style.background = 'url("' + src + '") top center / cover no-repeat';
      track.appendChild(t);
    });
  }

  /* ---- fade the pinned hero text as the cards scroll up over it (Technique A) ---- */
  var worksSection = document.querySelector('.works');
  var pinHeading = document.querySelector('.pin-heading');
  if (worksSection && pinHeading && !reduceMotion){
    var fadeDistance = window.innerHeight * 0.6; // fully faded after 60% of a viewport height of scrolling
    var onScroll = function(){
      var top = worksSection.getBoundingClientRect().top;
      var opacity = 1 - Math.min(Math.max(-top / fadeDistance, 0), 1);
      pinHeading.style.opacity = opacity;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ---- mobile hero: show the nav once you start scrolling, rise the name in ---- */
  var onScrollHero = function(){
    var past = window.scrollY > window.innerHeight * 0.2;
    document.body.classList.toggle('scrolled', past);     // nav: hides again at the very top
    if (past) document.body.classList.add('text-in');      // name: animates in only once
  };
  window.addEventListener('scroll', onScrollHero, { passive: true });
  onScrollHero();

  /* ---- SCROLLSPY: highlight the nav link of the section on screen ---- */
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('nav .links a[href^="#"]'));
  var linksBox = document.querySelector('nav .links');
  if (navLinks.length && linksBox){
    // the sliding pink pill behind the active link
    var pill = document.createElement('span');
    pill.className = 'nav-pill';
    linksBox.insertBefore(pill, linksBox.firstChild);

    // the section each link points to, e.g. "#work" -> <section id="work">
    var sections = navLinks.map(function(a){ return document.querySelector(a.getAttribute('href')); });
    var current = null;

    var setActive = function(link){
      if (link === current) return;
      current = link;
      navLinks.forEach(function(a){
        a.classList.toggle('active', a === link);
        if (a === link) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
      });
      if (link){
        // move the pill under the link (offsetLeft/offsetWidth are measured inside .links)
        pill.style.width = link.offsetWidth + 'px';
        pill.style.transform = 'translateX(' + link.offsetLeft + 'px)';
        pill.style.opacity = 1;
      } else {
        pill.style.opacity = 0; // back on the hero: nothing highlighted
      }
    };

    var spy = function(){
      // the active section is the last one whose top has passed 40% of the screen
      var line = window.innerHeight * 0.4;
      var active = null;
      sections.forEach(function(sec, i){
        if (sec && sec.getBoundingClientRect().top <= line) active = navLinks[i];
      });
      // at the very bottom of the page, the last link wins (the footer is short)
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4){
        active = navLinks[navLinks.length - 1];
      }
      setActive(active);
    };

    var ticking = false;
    window.addEventListener('scroll', function(){
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function(){ spy(); ticking = false; }); // at most once per frame
    }, { passive: true });
    window.addEventListener('resize', function(){ var c = current; current = null; setActive(c); });
    spy();
  }

  /* ---- brand: back to the very top, exactly like opening the site ---- */
  // (a plain href="#top" stops at the hero, which sits UNDER the sticky nav,
  //  so the page ends up scrolled down a little. Scrolling to 0 avoids that.)
  var brand = document.querySelector('nav .brand');
  if (brand){
    brand.addEventListener('click', function(e){
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
      history.replaceState(null, '', location.pathname + location.search); // no "#top" left in the URL
    });
  }
})();

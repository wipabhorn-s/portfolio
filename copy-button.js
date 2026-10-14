/* COPY BUTTON — used by links.html and the Contact section.
   Any <button class="links-copy" data-copy="..."> puts its data-copy text
   on the clipboard, then swaps its icon for a tick for a moment. */
document.querySelectorAll('.links-copy').forEach(function (btn) {
  var label = btn.getAttribute('aria-label');
  btn.addEventListener('click', function () {
    var text = btn.getAttribute('data-copy');
    var done = function (ok) {
      if (!ok) return;
      btn.classList.add('is-copied');
      btn.setAttribute('aria-label', 'Copied');
      setTimeout(function () { btn.classList.remove('is-copied'); btn.setAttribute('aria-label', label); }, 1600);
    };
    // older way, for browsers / pages (not https) without the Clipboard API
    var fallback = function () {
      var t = document.createElement('textarea');
      t.value = text;
      t.style.position = 'fixed';
      t.style.opacity = '0';
      document.body.appendChild(t);
      t.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (err) {}
      document.body.removeChild(t);
      done(ok);
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, fallback);
    } else {
      fallback();
    }
  });
});

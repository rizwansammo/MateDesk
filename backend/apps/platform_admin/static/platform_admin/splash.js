/* Shared Platform Admin splash behavior, aligned with MateDesk's 700ms splash. */
(function () {
  'use strict';

  var overlay = document.getElementById('pto');
  if (!overlay) return;

  var hideTimer;
  var leavingPage = false;

  function showSplash() {
    leavingPage = true;
    clearTimeout(hideTimer);
    overlay.style.display = 'flex';
    overlay.classList.remove('out');
    overlay.removeAttribute('aria-hidden');
  }

  window._ptoShow = showSplash;

  // Match the main application minimum display time and await font loading.
  // The font timeout prevents an unavailable font from blocking navigation.
  var minWait = new Promise(function (resolve) { setTimeout(resolve, 700); });
  var fontWait = document.fonts && document.fonts.ready
    ? Promise.race([
        document.fonts.ready,
        new Promise(function (resolve) { setTimeout(resolve, 1800); })
      ])
    : Promise.resolve();

  Promise.all([minWait, fontWait]).then(function () {
    if (leavingPage) return;
    requestAnimationFrame(function () {
      overlay.classList.add('out');
      overlay.setAttribute('aria-hidden', 'true');
      hideTimer = setTimeout(function () {
        if (overlay.classList.contains('out')) overlay.style.display = 'none';
      }, 450);
    });
  });

  document.addEventListener('click', function (event) {
    if (event.defaultPrevented || event.button !== 0 ||
        event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    var target = event.target;
    var link = target && target.closest ? target.closest('a[href]') : null;
    if (!link || link.hasAttribute('download') ||
        (link.target && link.target !== '_self')) return;

    var href = link.getAttribute('href');
    if (!href || href.charAt(0) === '#' || /^javascript:/i.test(href)) return;
    try {
      var destination = new URL(link.href, location.href);
      if (!/^https?:$/.test(destination.protocol) ||
          destination.origin !== location.origin ||
          destination.href === location.href) return;
    } catch (_) { return; }
    showSplash();
  });

  document.addEventListener('submit', function (event) {
    if (!event.defaultPrevented) showSplash();
  });

  // Safari and other browsers may restore a page from the back-forward cache.
  window.addEventListener('pageshow', function (event) {
    if (event.persisted) {
      leavingPage = false;
      overlay.classList.add('out');
      overlay.setAttribute('aria-hidden', 'true');
      overlay.style.display = 'none';
    }
  });
})();

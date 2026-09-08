/* GR Global — site behaviour. No dependencies. */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------------- header */

  var header = document.querySelector('.site-header');
  var ticking = false;

  function onScroll() {
    if (header) header.classList.toggle('is-stuck', window.scrollY > 40);
    ticking = false;
  }

  window.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(onScroll);
  }, { passive: true });
  onScroll();

  /* ------------------------------------------------------------ mobile nav */

  var burger = document.querySelector('.burger');
  var nav = document.getElementById('primary-nav');

  if (burger && nav) {
    burger.addEventListener('click', function () {
      var open = burger.getAttribute('aria-expanded') === 'true';
      burger.setAttribute('aria-expanded', String(!open));
      nav.classList.toggle('is-open', !open);
      document.body.style.overflow = !open ? 'hidden' : '';
    });

    nav.addEventListener('click', function (e) {
      if (e.target.closest('a') && nav.classList.contains('is-open')) {
        burger.setAttribute('aria-expanded', 'false');
        nav.classList.remove('is-open');
        document.body.style.overflow = '';
      }
    });
  }

  /* ----------------------------------------------------------- mega menus
     Services and Industries open a panel. On the wide layout the panel drops
     under the header and also opens on hover; inside the mobile drawer it is
     an inline list and only opens on a click. */

  var megaItems = Array.prototype.slice.call(document.querySelectorAll('.has-mega'));
  var wide = window.matchMedia('(min-width: 1100px)');
  var hoverTimer = null;

  function closeMega(item) {
    item.classList.remove('is-open');
    var t = item.querySelector('.nav__more');
    if (t) t.setAttribute('aria-expanded', 'false');
  }

  function closeAllMega(except) {
    megaItems.forEach(function (item) {
      if (item !== except) closeMega(item);
    });
  }

  function openMega(item) {
    closeAllMega(item);
    item.classList.add('is-open');
    var t = item.querySelector('.nav__more');
    if (t) t.setAttribute('aria-expanded', 'true');
  }

  megaItems.forEach(function (item) {
    var toggle = item.querySelector('.nav__more');
    if (!toggle) return;

    toggle.addEventListener('click', function () {
      if (item.classList.contains('is-open')) closeMega(item);
      else openMega(item);
    });

    // Touch reports as a pointerenter too, which would open the panel and
    // then immediately toggle it shut on the click that follows.
    item.addEventListener('pointerenter', function (e) {
      if (!wide.matches || e.pointerType === 'touch') return;
      window.clearTimeout(hoverTimer);
      openMega(item);
    });

    item.addEventListener('pointerleave', function (e) {
      if (!wide.matches || e.pointerType === 'touch') return;
      hoverTimer = window.setTimeout(function () { closeMega(item); }, 180);
    });

    // Tabbing out of the panel closes it behind you.
    item.addEventListener('focusout', function (e) {
      if (!wide.matches) return;
      if (!item.contains(e.relatedTarget)) closeMega(item);
    });
  });

  if (megaItems.length) {
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var open = document.querySelector('.has-mega.is-open');
      if (!open) return;
      var t = open.querySelector('.nav__more');
      closeMega(open);
      if (t) t.focus();
    });

    document.addEventListener('click', function (e) {
      if (e.target && e.target.closest && e.target.closest('.has-mega')) return;
      closeAllMega(null);
    });

    // Crossing the breakpoint would otherwise leave a panel open in a layout
    // that positions it somewhere else entirely.
    var onWideChange = function () { closeAllMega(null); };
    if (wide.addEventListener) wide.addEventListener('change', onWideChange);
    else if (wide.addListener) wide.addListener(onWideChange);
  }

  /* ------------------------------------------------------------ switcher
     Freight modes and export sectors. Choosing a tab shows that one's title,
     description and photographs and hides the rest. Panels are toggled with
     the hidden attribute, which keeps the lazy images in the closed ones from
     downloading at all until someone opens them. */

  Array.prototype.forEach.call(document.querySelectorAll('.switch'), function (sw) {
    var tabs = Array.prototype.slice.call(sw.querySelectorAll('[role="tab"]'));
    var panels = Array.prototype.slice.call(sw.querySelectorAll('[role="tabpanel"]'));
    if (!tabs.length || tabs.length !== panels.length) return;

    // Below 700px the panels sit inside the tab list as an accordion. There
    // the switcher starts with every panel shut, a row toggles its own panel
    // open and closed, and opening one closes whichever was open before, so
    // only ever one is showing. Above the breakpoint it stays a tab strip,
    // where a panel has to be open or the layout has nothing under the tabs.
    var accordion = window.matchMedia('(max-width: 699px)');

    var open = -1;    // panel currently showing, -1 when all are shut
    var cursor = 0;   // row that holds the roving tabindex

    function paint(moveFocus) {
      tabs.forEach(function (tab, n) {
        var on = n === open;
        tab.setAttribute('aria-selected', on ? 'true' : 'false');
        tab.setAttribute('aria-expanded', on ? 'true' : 'false');
        tab.tabIndex = n === cursor ? 0 : -1;
        panels[n].hidden = !on;
      });
      if (moveFocus) tabs[cursor].focus();
    }

    function select(index, moveFocus) {
      open = index;
      cursor = index;
      paint(moveFocus);
    }

    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () {
        if (!accordion.matches) { select(i, false); return; }

        // Closing a panel above the tapped row pulls everything under it
        // upwards. Measuring the row before and after and correcting the
        // scroll by the difference leaves it under the finger that tapped it.
        var before = tab.getBoundingClientRect().top;
        cursor = i;
        open = open === i ? -1 : i;
        paint(false);
        var shift = tab.getBoundingClientRect().top - before;
        if (shift) window.scrollBy(0, shift);
      });

      tab.addEventListener('keydown', function (e) {
        var next = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % tabs.length;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = tabs.length - 1;
        if (next === null) return;
        e.preventDefault();

        // As an accordion the arrows walk the rows without opening them;
        // Enter or Space on the focused row does that. As a tab strip the
        // arrows select, which is what the pattern expects.
        cursor = next;
        if (accordion.matches) paint(true);
        else select(next, true);
      });
    });

    // The mega menu links to service.html#air and industry.html#mining, so a
    // matching hash opens that tab instead of scrolling to a section that no
    // longer exists on its own.
    function fromHash(scroll) {
      var want = (window.location.hash || '').replace('#', '');
      if (!want) return false;
      for (var i = 0; i < tabs.length; i++) {
        if (tabs[i].getAttribute('data-tab') !== want) continue;
        select(i, false);
        if (scroll) {
          sw.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
        }
        return true;
      }
      return false;
    }

    // A hash from the mega menu opens that one on either layout. Without one
    // the tab strip opens its first panel and the accordion opens nothing.
    if (!fromHash(false)) {
      if (accordion.matches) paint(false);
      else select(0, false);
    }
    window.addEventListener('hashchange', function () { fromHash(true); });

    // Widening back to the tab strip with everything shut would leave the tabs
    // sitting on an empty band, so a panel is opened on the way across.
    var onAccordionChange = function () {
      if (!accordion.matches && open < 0) select(cursor, false);
    };
    if (accordion.addEventListener) accordion.addEventListener('change', onAccordionChange);
    else if (accordion.addListener) accordion.addListener(onAccordionChange);
  });

  /* ------------------------------------------------------------ lightbox
     Clicking a gallery photograph enlarges it. The overlay is built once, on
     the first click, so no page ships the markup and nothing is created for
     visitors who never open one. Stepping through stays inside the gallery
     that was clicked. */

  var galleries = Array.prototype.slice.call(document.querySelectorAll('.gallery'));

  if (galleries.length) {
    var box = null;
    var boxImg, boxCap, boxCount, btnPrev, btnNext, btnClose;
    var shots = [];
    var at = 0;
    var lastFocus = null;

    function build() {
      box = document.createElement('div');
      box.className = 'lightbox';
      box.hidden = true;
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      box.setAttribute('aria-label', 'Photograph viewer');
      box.innerHTML =
        '<div class="lightbox__bar">' +
          '<span class="lightbox__count"></span>' +
          '<span class="lightbox__nav">' +
            '<button type="button" class="lightbox__prev" aria-label="Previous photograph"><span class="lightbox__glyph"></span></button>' +
            '<button type="button" class="lightbox__next" aria-label="Next photograph"><span class="lightbox__glyph"></span></button>' +
            '<button type="button" class="lightbox__close" aria-label="Close viewer"><span class="lightbox__glyph"></span></button>' +
          '</span>' +
        '</div>' +
        '<figure class="lightbox__stage"><img alt=""></figure>' +
        '<p class="lightbox__cap"></p>';

      document.body.appendChild(box);
      boxImg = box.querySelector('.lightbox__stage img');
      boxCap = box.querySelector('.lightbox__cap');
      boxCount = box.querySelector('.lightbox__count');
      btnPrev = box.querySelector('.lightbox__prev');
      btnNext = box.querySelector('.lightbox__next');
      btnClose = box.querySelector('.lightbox__close');

      btnPrev.addEventListener('click', function () { step(-1); });
      btnNext.addEventListener('click', function () { step(1); });
      btnClose.addEventListener('click', close);

      // Clicking the backdrop closes; clicking the photograph itself does not.
      box.addEventListener('click', function (e) {
        if (e.target === box || e.target.classList.contains('lightbox__stage')) close();
      });
    }

    function show(i) {
      at = (i + shots.length) % shots.length;
      var src = shots[at];
      boxImg.src = src.getAttribute('src');
      boxImg.alt = src.getAttribute('alt') || '';
      boxCap.textContent = src.getAttribute('alt') || '';
      boxCount.textContent = (at + 1) + ' of ' + shots.length;
      var only = shots.length < 2;
      btnPrev.disabled = only;
      btnNext.disabled = only;
    }

    function step(by) { if (shots.length > 1) show(at + by); }

    function open(gallery, index) {
      if (!box) build();
      shots = Array.prototype.slice.call(gallery.querySelectorAll('img'));
      if (!shots.length) return;
      lastFocus = document.activeElement;
      show(index);
      box.hidden = false;
      document.body.style.overflow = 'hidden';
      btnClose.focus();
    }

    function close() {
      if (!box || box.hidden) return;
      box.hidden = true;
      boxImg.removeAttribute('src');
      document.body.style.overflow = '';
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    galleries.forEach(function (gallery) {
      gallery.addEventListener('click', function (e) {
        var img = e.target.closest('img');
        if (!img || !gallery.contains(img)) return;
        var all = Array.prototype.slice.call(gallery.querySelectorAll('img'));
        open(gallery, all.indexOf(img));
      });
    });

    document.addEventListener('keydown', function (e) {
      if (!box || box.hidden) return;
      if (e.key === 'Escape') { close(); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
      else if (e.key === 'Tab') {
        // Three buttons, so the trap is just a wrap at each end.
        var stops = [btnPrev, btnNext, btnClose].filter(function (b) { return !b.disabled; });
        var i = stops.indexOf(document.activeElement);
        if (i === -1) { e.preventDefault(); stops[0].focus(); return; }
        var next = e.shiftKey ? i - 1 : i + 1;
        if (next < 0 || next >= stops.length) {
          e.preventDefault();
          stops[e.shiftKey ? stops.length - 1 : 0].focus();
        }
      }
    });
  }

  /* --------------------------------------------------------- scroll reveal */

  var reveals = document.querySelectorAll('.reveal');

  if (reduced || !('IntersectionObserver' in window)) {
    reveals.forEach(function (el) { el.classList.add('is-in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });

    reveals.forEach(function (el, i) {
      el.style.transitionDelay = (Math.min(i % 4, 3) * 90) + 'ms';
      io.observe(el);
    });
  }

  /* ------------------------------------------------------------- counters */

  function groupIndian(n) {
    var s = String(n);
    if (s.length <= 3) return s;
    var last3 = s.slice(-3);
    var rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    return rest + ',' + last3;
  }

  function render(el, value) {
    var decimals = Number(el.dataset.decimals || 0);
    var text = decimals
      ? value.toFixed(decimals)
      : groupIndian(Math.round(value));
    el.textContent = text + (el.dataset.suffix || '');
  }

  function countUp(el) {
    var target = parseFloat(el.dataset.count);
    if (reduced) { render(el, target); return; }

    var start = null;
    var span = 1500;

    function step(now) {
      if (start === null) start = now;
      var p = Math.min((now - start) / span, 1);
      render(el, target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  var counters = document.querySelectorAll('[data-count]');

  if (!('IntersectionObserver' in window)) {
    counters.forEach(function (el) { render(el, parseFloat(el.dataset.count)); });
  } else {
    var co = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        countUp(entry.target);
        co.unobserve(entry.target);
      });
    }, { threshold: 0.4 });
    counters.forEach(function (el) { co.observe(el); });
  }

  /* ------------------------------------------------------------ hero video
     The poster image is the LCP element. The video is attached only after
     the page has loaded, and only where it is worth the bandwidth. */

  /* The clip is published at several sizes. It is a background sitting under a
     heavy gradient, so a phone gains nothing visible from the 1080p file and
     would pay 17MB for it. Pick by viewport, and fall back to whatever the
     markup names if the URL is not one of the sized ones. */
  function heroVideoSrc(url) {
    var want = window.innerWidth >= 1400 ? '1080p'
             : window.innerWidth >= 900 ? '720p'
             : '480p';
    return /\/\d{3,4}p\//.test(url) ? url.replace(/\/\d{3,4}p\//, '/' + want + '/') : url;
  }

  function loadHeroVideo() {
    var mount = document.querySelector('[data-video]');
    if (!mount) return;

    if (reduced) return;

    // No width gate any more: phones get the video too, just a smaller file.
    // Data saver and 2G are still respected, where the poster alone is kinder.
    var c = navigator.connection;
    if (c && (c.saveData || /2g/.test(c.effectiveType || ''))) return;

    var v = document.createElement('video');
    v.muted = true;
    v.defaultMuted = true;
    v.loop = true;
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    // iOS checks the attribute, not just the property, before it will autoplay.
    v.setAttribute('muted', '');
    v.setAttribute('aria-hidden', 'true');
    v.tabIndex = -1;
    v.preload = 'auto';
    v.src = heroVideoSrc(mount.dataset.video);

    v.addEventListener('canplay', function () {
      v.classList.add('is-ready');
      var p = v.play();
      if (p && p.catch) p.catch(function () {});
    }, { once: true });

    mount.appendChild(v);
  }

  /* -------------------------------------------------------- enquiry form */

  var form = document.getElementById('enquiry-form');

  if (form) {
    var status = form.querySelector('.form__status');
    var submit = form.querySelector('button[type="submit"]');
    var fields = Array.prototype.slice.call(
      form.querySelectorAll('input[required], select[required], textarea[required]')
    );

    function valid(el) {
      var v = (el.value || '').trim();
      if (v === '') return false;
      if (el.type === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
      if (el.type === 'tel') return v.replace(/[^\d]/g, '').length >= 7;
      return true;
    }

    function mark(el) {
      var wrap = el.closest('.field');
      if (!wrap) return true;
      var ok = valid(el);
      wrap.classList.toggle('is-invalid', !ok);
      el.setAttribute('aria-invalid', ok ? 'false' : 'true');
      return ok;
    }

    // Clear a field's error as soon as it becomes valid again.
    fields.forEach(function (el) {
      var evt = el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(evt, function () {
        var wrap = el.closest('.field');
        if (wrap && wrap.classList.contains('is-invalid')) mark(el);
      });
      el.addEventListener('blur', function () {
        if ((el.value || '').trim() !== '') mark(el);
      });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var firstBad = null;
      fields.forEach(function (el) {
        if (!mark(el) && !firstBad) firstBad = el;
      });

      if (firstBad) {
        status.hidden = true;
        firstBad.focus({ preventScroll: true });
        firstBad.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
        return;
      }

      // Keep the markup, not just the text, so the arrow icon survives.
      var original = submit.innerHTML;
      var done = false;

      submit.disabled = true;
      submit.textContent = 'Sending…';
      status.hidden = true;

      function fail(message) {
        status.textContent = message;
        status.hidden = false;
        status.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
      }

      fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
      })
        .then(function (r) {
          return r.json().catch(function () { return { ok: r.ok }; });
        })
        .then(function (data) {
          if (data && data.ok) {
            // Leave the button disabled; the page is on its way out.
            done = true;
            form.reset();
            window.location.href = data.redirect || 'thank-you.html';
            return;
          }
          fail((data && data.message) || 'Something went wrong. Please email info@grglobal.co.in.');
        })
        .catch(function () {
          fail('Network error. Please email info@grglobal.co.in or call +91 96871 35037.');
        })
        .finally(function () {
          if (done) return;
          submit.disabled = false;
          submit.innerHTML = original;
        });
    });
  }

  /* ------------------------------------------------------------ after load

     Google Tag Manager is not loaded here. It is the standard container
     snippet in the <head> of every page, so loading it again from script
     would fire gtm.js twice and double every pageview and conversion. */

  window.addEventListener('load', function () {
    loadHeroVideo();
  });
})();

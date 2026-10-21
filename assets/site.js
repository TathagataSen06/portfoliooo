// Shared page behaviour. No dependencies; every feature degrades to static content.
(() => {
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(pointer: fine)').matches;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  // ---- reveal on scroll ----
  const revealIO = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('is-in');
      revealIO.unobserve(e.target);
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  $$('[data-reveal]').forEach((el) => revealIO.observe(el));

  // ---- count-ups: element text is the final value, so no-JS readers see it ----
  const fmt = (v, dec, group = true) => v.toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: group });
  const countIO = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      countIO.unobserve(e.target);
      const el = e.target;
      const to = parseFloat(el.dataset.count);
      const dec = parseInt(el.dataset.dec || '0', 10);
      const pre = el.dataset.pre || '';
      const suf = el.dataset.suf || '';
      const group = el.dataset.group !== 'no';
      if (reduce) { el.textContent = pre + fmt(to, dec, group) + suf; continue; }
      const t0 = performance.now();
      const dur = 1400;
      const step = (t) => {
        const p = Math.min(1, (t - t0) / dur);
        const eased = 1 - Math.pow(1 - p, 4);
        el.textContent = pre + fmt(to * eased, dec, group) + suf;
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
  }, { threshold: 0.6 });
  $$('[data-count]').forEach((el) => {
    if (!reduce) el.textContent = (el.dataset.pre || '') + fmt(0, parseInt(el.dataset.dec || '0', 10)) + (el.dataset.suf || '');
    countIO.observe(el);
  });

  // ---- nav: scrolled state, sliding indicator for the current section, mobile sheet ----
  const nav = $('.nav');
  if (nav) {
    const onScroll = () => nav.classList.toggle('is-scrolled', scrollY > 40);
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    const ind = $('.nav-ind', nav);
    const links = $$('.nav-links a[href^="#"]', nav);
    const moveInd = (a) => {
      if (!ind) return;
      if (!a) { ind.style.opacity = '0'; return; }
      ind.style.opacity = '1';
      ind.style.width = a.offsetWidth + 'px';
      ind.style.transform = `translateX(${a.offsetLeft}px)`;
    };
    if (links.length) {
      const byId = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
      let current = null;
      const setCurrent = (id) => {
        current = byId.get(id) || null;
        links.forEach((a) => a.toggleAttribute('aria-current', a === current));
        moveInd(current);
      };
      const secIO = new IntersectionObserver((entries) => {
        for (const e of entries) if (e.isIntersecting) setCurrent(e.target.id);
      }, { rootMargin: '-45% 0px -50% 0px' });
      byId.forEach((_, id) => { const s = document.getElementById(id); if (s) secIO.observe(s); });
      const hero = $('.hero');
      if (hero) new IntersectionObserver(([e]) => { if (e.isIntersecting) setCurrent(null); }, { rootMargin: '-45% 0px -50% 0px' }).observe(hero);
      addEventListener('resize', () => moveInd(current));
    } else {
      moveInd($('.nav-links a[aria-current]', nav));
    }

    const btn = $('.nav-menu', nav);
    const setOpen = (open) => { nav.classList.toggle('is-open', open); btn && btn.setAttribute('aria-expanded', String(open)); };
    btn && btn.addEventListener('click', () => setOpen(!nav.classList.contains('is-open')));
    $$('.nav-sheet a', nav).forEach((a) => a.addEventListener('click', () => setOpen(false)));
    addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
    document.addEventListener('click', (e) => { if (!nav.contains(e.target)) setOpen(false); });
  }

  // ---- hero: the aurora drifts slightly toward the pointer ----
  const hero = $('.hero');
  if (hero && finePointer && !reduce) {
    hero.addEventListener('pointermove', (e) => {
      const r = hero.getBoundingClientRect();
      hero.style.setProperty('--px', ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
      hero.style.setProperty('--py', ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
    });
  }

  // ---- cursor spotlight on .spot cards ----
  if (finePointer) {
    document.addEventListener('pointermove', (e) => {
      const card = e.target.closest && e.target.closest('.spot');
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    }, { passive: true });
  }

  // ---- work filter (segmented control) ----
  const bento = $('#bento');
  const filters = $('.filters');
  if (bento && filters) {
    const btns = $$('button', filters);
    const ind = $('.ind', filters);
    const cards = $$('.card', bento);
    const place = (b) => { ind.style.width = b.offsetWidth + 'px'; ind.style.transform = `translateX(${b.offsetLeft}px)`; };
    btns.forEach((b) => {
      const f = b.dataset.filter;
      const n = f === 'all' ? cards.length : cards.filter((c) => c.dataset.tags.split(' ').includes(f)).length;
      b.insertAdjacentHTML('beforeend', `<span class="n">${n}</span>`);
    });
    const apply = (f) => {
      cards.forEach((c) => { c.hidden = f !== 'all' && !c.dataset.tags.split(' ').includes(f); });
      bento.classList.toggle('is-filtered', f !== 'all');
    };
    btns.forEach((b) => b.addEventListener('click', () => {
      if (b.getAttribute('aria-pressed') === 'true') return;
      btns.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      place(b);
      if (document.startViewTransition && !reduce) document.startViewTransition(() => apply(b.dataset.filter));
      else apply(b.dataset.filter);
    }));
    const active = btns.find((b) => b.getAttribute('aria-pressed') === 'true') || btns[0];
    requestAnimationFrame(() => place(active));
    addEventListener('resize', () => place(btns.find((b) => b.getAttribute('aria-pressed') === 'true')));
    document.fonts && document.fonts.ready.then(() => place(btns.find((b) => b.getAttribute('aria-pressed') === 'true')));
  }

  // ---- copy email ----
  const toast = $('.toast');
  $$('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(b.dataset.copy);
      if (toast) { toast.textContent = 'Email copied'; toast.classList.add('is-on'); clearTimeout(toast._t); toast._t = setTimeout(() => toast.classList.remove('is-on'), 1800); }
    } catch { location.href = 'mailto:' + b.dataset.copy; }
  }));

  // ---- case pages: reading progress + table-of-contents scroll-spy ----
  const bar = $('.progress');
  if (bar) {
    const upd = () => {
      const max = root.scrollHeight - innerHeight;
      bar.style.setProperty('--p', max > 0 ? (scrollY / max).toFixed(4) : 0);
    };
    addEventListener('scroll', upd, { passive: true });
    addEventListener('resize', upd);
    upd();
  }
  const toc = $$('.toc a');
  if (toc.length) {
    const map = new Map(toc.map((a) => [a.getAttribute('href').slice(1), a]));
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        toc.forEach((a) => a.toggleAttribute('aria-current', a === map.get(e.target.id)));
      }
    }, { rootMargin: '-30% 0px -60% 0px' });
    map.forEach((_, id) => { const s = document.getElementById(id); if (s) io.observe(s); });
  }
})();

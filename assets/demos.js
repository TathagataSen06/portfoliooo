// Interactive explainers for the case-study pages. Each demo is optional: the page reads fine without it.
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = (ms) => new Promise((r) => setTimeout(r, reduce ? 0 : ms));
  const onceVisible = (el, fn) => {
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io.disconnect(); fn(); } }, { threshold: 0.45 });
    io.observe(el);
  };

  // ---------- SanchaarSetu: one event through ingest → Kafka → consumer → departments ----------
  const flow = document.querySelector('[data-demo="flow"]');
  if (flow) {
    const stage = flow.querySelector('.flow-stage');
    const nodes = [...flow.querySelectorAll('.fnode')];
    const pkt = flow.querySelector('.packet');
    const log = flow.querySelector('.log');
    const btn = (a) => flow.querySelector(`[data-act="${a}"]`);
    const out = (k) => flow.querySelector(`[data-c="${k}"]`);
    const depts = [['factories', 'Factories'], ['bbmp', 'BBMP'], ['fire', 'Fire Safety']];
    const c = { ok: 0, dup: 0, dlq: 0 };
    let n = 0, last = null, busy = false, offline = false, audit = 1041, seed = 0x3f9a1c;
    const hex = () => { seed = (seed * 1103515245 + 12345) & 0xffffff; return seed.toString(16).padStart(6, '0'); };
    let prev = hex();

    const center = (i) => {
      const s = stage.getBoundingClientRect(), r = nodes[i].getBoundingClientRect();
      return [r.left - s.left + r.width / 2, r.top - s.top + r.height / 2];
    };
    const place = (i) => { const [x, y] = center(i); pkt.style.transform = `translate(${x}px, ${y}px)`; };
    const move = async (a, b) => {
      if (reduce) return place(b);
      const [x1, y1] = center(a), [x2, y2] = center(b);
      const anim = pkt.animate([{ transform: `translate(${x1}px, ${y1}px)` }, { transform: `translate(${x2}px, ${y2}px)` }],
        { duration: 560, easing: 'cubic-bezier(.65, 0, .35, 1)', fill: 'forwards' });
      await anim.finished;
      place(b);
      anim.cancel();
    };
    const hit = (i, cls = 'hit') => { nodes.forEach((nd) => nd.classList.remove('hit', 'bad')); nodes[i].classList.add(cls); };
    const say = (text, cls = '') => {
      const li = document.createElement('li');
      if (cls) li.className = cls;
      li.textContent = text;
      log.append(li);
      log.scrollTop = log.scrollHeight;
      while (log.children.length > 60) log.firstElementChild.remove();
    };
    const sync = () => {
      btn('send').disabled = busy;
      btn('dup').disabled = busy || !last;
      btn('offline').disabled = busy;
      for (const k in c) out(k).textContent = c[k];
      out('dlq').classList.toggle('warn', c.dlq > 0);
    };

    const run = async (dup) => {
      busy = true; sync();
      flow.querySelectorAll('.depts li').forEach((li) => li.removeAttribute('data-s'));
      const ev = dup ? last : (last = { ubid: `UBID-KA-${String(++n).padStart(3, '0')}`, type: n % 2 ? 'address_update' : 'signatory_update' });
      if (dup) say(`SWS retries ${ev.ubid} inside the same 60 s window`, 'dim');
      say(`POST /sws/webhook  ${ev.ubid}  ${ev.type}`);
      pkt.classList.remove('bad');
      place(0); pkt.classList.add('on'); hit(0);
      await wait(260); await move(0, 1); hit(1);
      if (dup) {
        pkt.classList.add('bad'); hit(1, 'bad');
        say('Redis SET NX → key already exists → duplicate dropped', 'bad');
        c.dup++;
        await wait(800);
        pkt.classList.remove('on'); nodes[1].classList.remove('bad');
        busy = false; sync();
        return;
      }
      say('Redis SET NX → new key, expires in 1 h');
      await wait(200); await move(1, 2); hit(2); say('produce → sanchaar-events · SWS gets "accepted" straight away');
      await wait(200); await move(2, 3); hit(3); say('no conflicting update in the 60 s window');
      say(ev.type === 'address_update' ? 'map registered_address → address  (0.91 ≥ 0.85, auto)' : 'map auth_signatory → signatory  (0.88 ≥ 0.85, auto)');
      await wait(200); await move(3, 4); hit(4);
      for (const [key, label] of depts) {
        const li = flow.querySelector(`[data-dept="${key}"]`);
        await wait(280);
        if (key === 'fire' && offline) {
          li.dataset.s = 'bad'; hit(4, 'bad');
          say(`${label} → 503 Service Unavailable`, 'bad');
          for (const s of [2, 4, 8, 16]) { await wait(420); say(`retry in ${s} s`, 'dim'); }
          await wait(420);
          say('4 retries used → sanchaar-dlq (an operator can replay it)', 'bad');
          c.dlq++;
        } else {
          li.dataset.s = 'ok';
          say(`${label} → 200 OK`, 'ok');
          c.ok++;
        }
        sync();
      }
      const next = hex();
      say(`audit #${++audit} chained · prev ${prev}… → ${next}…`, 'dim');
      prev = next;
      await wait(500);
      pkt.classList.remove('on'); nodes.forEach((nd) => nd.classList.remove('hit', 'bad'));
      busy = false; sync();
    };

    btn('send').addEventListener('click', () => run(false));
    btn('dup').addEventListener('click', () => run(true));
    btn('offline').addEventListener('click', (e) => {
      offline = !offline;
      e.currentTarget.setAttribute('aria-pressed', String(offline));
      say(offline ? 'Fire Safety department is now offline' : 'Fire Safety department is back online', 'dim');
    });
    sync();
  }

  // ---------- GraphSentinel: the detector walking a pattern ----------
  const gs = document.querySelector('[data-demo="graph"]');
  if (gs) {
    const svg = gs.querySelector('.gs-graph');
    const checks = gs.querySelector('.checks');
    const slot = gs.querySelector('.alert-slot');
    const btns = [...gs.querySelectorAll('[data-pattern]')];
    const P = {
      layer: {
        checks: [
          ['Accounts in the chain', '4', 'rule: at least 4'],
          ['First to last hop', '31 h', 'rule: within 48 h'],
          ['Average amount passed on', '96%', 'rule: at least 90%'],
          ['New or high-risk accounts', '2', 'B and C are under 180 days old'],
        ],
        alert: ['multi_hop_layering', 'confidence = 0.56 + 3×0.05 + 0.96×0.2 + 2×0.04, capped at 0.97'],
      },
      round: {
        checks: [
          ['Money returns to the origin', 'E→F→G→E', 'a closed loop'],
          ['Time to close the loop', '52 h', 'rule: within 72 h'],
          ['Share of the amount returned', '84%', 'rule: at least 75%'],
        ],
        alert: ['circular_round_trip', '₹8.4 L of the ₹10.0 L sent came back to E'],
      },
      struct: {
        checks: [
          ['Transfers just under ₹10 L', '4', 'the cash-reporting threshold'],
          ['Largest single transfer', '₹9.8 L', 'every one stays below ₹10 L'],
          ['Time span', '20 h', 'rule: within 72 h'],
        ],
        alert: ['structuring', '₹38.6 L moved in four sub-threshold pieces'],
      },
    };
    let token = 0;
    const show = async (p) => {
      const me = ++token;
      btns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pattern === p)));
      svg.classList.add('has-sel');
      svg.querySelectorAll('.on').forEach((el) => el.classList.remove('on'));
      checks.innerHTML = '';
      slot.innerHTML = '';
      const ns = [...svg.querySelectorAll(`.node[data-p="${p}"]`)];
      const es = [...svg.querySelectorAll(`.edge[data-p="${p}"]`)].sort((a, b) => a.dataset.i - b.dataset.i);
      ns[0].classList.add('on');
      for (let i = 0; i < es.length; i++) {
        await wait(430); if (me !== token) return;
        es[i].classList.add('on');
        if (ns[i + 1]) ns[i + 1].classList.add('on');
      }
      for (const [label, val, note] of P[p].checks) {
        await wait(300); if (me !== token) return;
        checks.insertAdjacentHTML('beforeend', `<li><span>${label}</span><b>${val}</b><small>${note}</small></li>`);
      }
      await wait(380); if (me !== token) return;
      slot.innerHTML = `<div class="alert-card"><small>Alert raised</small><b>${P[p].alert[0]}</b><span>${P[p].alert[1]}</span></div>`;
    };
    btns.forEach((b) => b.addEventListener('click', () => show(b.dataset.pattern)));
    onceVisible(gs, () => { if (!token) show('layer'); });
  }

  // ---------- BARC: a peak search sweeping the signal ----------
  const pk = document.querySelector('[data-demo="peaks"]');
  if (pk) {
    const svg = pk.querySelector('.pk-plot');
    const scan = svg.querySelector('.scan');
    const wins = [...svg.querySelectorAll('.win')];
    const marks = [...svg.querySelectorAll('.pk')];
    const list = pk.querySelector('.readout');
    const run = pk.querySelector('[data-act="run"]');
    const bins = JSON.parse(pk.dataset.bins);
    const x0 = 10, x1 = 630, dur = 2600;
    let raf = 0;
    const go = () => {
      cancelAnimationFrame(raf);
      wins.forEach((w) => w.classList.remove('on'));
      marks.forEach((m) => m.classList.remove('on'));
      list.innerHTML = '';
      run.disabled = true;
      scan.classList.add('on');
      const t0 = performance.now();
      const tick = (t) => {
        const p = reduce ? 1 : Math.min(1, (t - t0) / dur);
        const x = x0 + (x1 - x0) * p;
        scan.setAttribute('x1', x); scan.setAttribute('x2', x);
        wins.forEach((w) => { if (x >= +w.dataset.x) w.classList.add('on'); });
        marks.forEach((m, i) => {
          if (m.classList.contains('on') || x < +m.dataset.x) return;
          m.classList.add('on');
          list.insertAdjacentHTML('beforeend', `<li><b>${i + 1}</b>bin ${bins[i]}</li>`);
        });
        if (p < 1) raf = requestAnimationFrame(tick);
        else { scan.classList.remove('on'); run.disabled = false; run.textContent = 'Run again'; }
      };
      raf = requestAnimationFrame(tick);
    };
    run.addEventListener('click', go);
    onceVisible(pk, () => { if (!list.children.length) go(); });
  }
})();

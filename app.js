/* NWSS Course Guide — app logic (no build step, no dependencies) */
(function () {
  'use strict';
  const D = window.NWSS_DATA;
  const G = D.guide;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const main = $('#main');

  /* ---------------- helpers ---------------- */
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const linkify = s => esc(s)
    .replace(/(https?:\/\/[^\s<)]+[^\s<).,;])/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|[\s(])(www\.[^\s<)]+[^\s<).,;])/g, '$1<a href="https://$2" target="_blank" rel="noopener">$2</a>')
    .replace(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '<a href="mailto:$1">$1</a>');
  const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const alnum = s => fold(s).replace(/[^a-z0-9]/g, '');
  const gradeLabel = gs => !gs.length ? '' : gs.length === 1 ? 'Gr ' + gs[0] : 'Gr ' + gs[0] + '–' + gs[gs.length - 1];
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 1900); }
  async function copyText(txt) {
    try { await navigator.clipboard.writeText(txt); }
    catch (e) { const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (_) {} ta.remove(); }
    toast('Copied to clipboard');
  }
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return store._m[k] ?? d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { store._m[k] = v; } },
    _m: {}
  };

  /* ---------------- data prep ---------------- */
  const deptById = Object.fromEntries(D.depts.map(d => [d.id, d]));
  const deptOrder = D.depts.map(d => d.id);
  const courses = D.courses.map(c => {
    const text = [c.title, c.focus, ...(c.desc || []).map(b => b.text), ...(c.recommended || []), ...(c.notes || [])].join(' ');
    return Object.assign(c, {
      _title: fold(c.title),
      _codes: c.codes.map(alnum),
      _hay: fold(text + ' ' + (deptById[c.dept] || {}).name + ' ' + (c.sub || '')),
      _excerpt: ((c.desc || []).find(b => b.type === 'p' && b.text.length > 40) || (c.desc || [])[0] || { text: '' }).text,
      _color: (deptById[c.dept] || {}).color || '#EC7C30'
    });
  });
  const byId = Object.fromEntries(courses.map(c => [c.id, c]));
  const inDept = (c, d) => c.dept === d || (c.also || []).includes(d);
  const findByTitle = re => courses.find(c => re.test(c.title));

  /* ---------------- plan state ---------------- */
  let plan = store.get('nwss-plan-v1', { 9: [], 10: [], 11: [], 12: [] });
  ['9', '10', '11', '12'].forEach(g => { plan[g] = (plan[g] || []).filter(id => byId[id]); });
  const planned = id => ['9', '10', '11', '12'].filter(g => plan[g].includes(id));
  function savePlan() { store.set('nwss-plan-v1', plan); $('#planCount').textContent = Object.values(plan).reduce((a, b) => a + b.length, 0); }
  function addToPlan(id, g) { g = String(g); if (!plan[g].includes(id)) plan[g].push(id); savePlan(); toast(`Added to Grade ${g}`); refreshPlanButtons(); }
  function removeFromPlan(id, g) { (g ? [String(g)] : ['9', '10', '11', '12']).forEach(k => plan[k] = plan[k].filter(x => x !== id)); savePlan(); refreshPlanButtons(); }

  /* ---------------- explore state ---------------- */
  const ex = { q: '', grade: null, depts: new Set(), tags: new Set(), hideNA: true, sort: 'subject' };
  const saved = store.get('nwss-explore-v1', null);
  if (saved) { ex.grade = saved.grade ?? null; ex.sort = saved.sort || 'subject'; }

  function filterCourses(opts = {}) {
    const toks = fold(ex.q).split(/\s+/).filter(Boolean);
    const qAl = alnum(ex.q);
    let list = courses.filter(c => {
      if (ex.hideNA && c.tags.includes('notoffered')) return false;
      if (ex.grade && !c.grades.includes(ex.grade)) return false;
      if (!opts.ignoreDept && ex.depts.size && ![...ex.depts].some(d => inDept(c, d))) return false;
      for (const t of ex.tags) if (!c.tags.includes(t)) return false;
      if (toks.length) {
        const codeHit = qAl.length >= 3 && c._codes.some(k => k.includes(qAl));
        if (!codeHit && !toks.every(t => c._hay.includes(t))) return false;
      }
      return true;
    });
    if (toks.length) {
      const score = c => (c._codes.some(k => k.includes(qAl)) ? 4 : 0) + (toks.every(t => c._title.includes(t)) ? 3 : 0) + (c._title.startsWith(toks[0]) ? 1 : 0);
      list = list.map(c => [score(c), c]).sort((a, b) => b[0] - a[0]).map(x => x[1]);
    }
    return list;
  }

  /* ---------------- router ---------------- */
  let lastView = '#/explore';
  function parseHash() {
    const h = location.hash.replace(/^#\/?/, '');
    const [path, qs] = h.split('?');
    const parts = path.split('/').filter(Boolean);
    return { parts, params: new URLSearchParams(qs || '') };
  }
  let rendered = null;
  function route() {
    const { parts, params } = parseHash();
    const view = parts[0] || 'explore';
    if (view === 'course') {
      if (!rendered) renderView('explore', [], params);
      openCourse(decodeURIComponent(parts[1] || ''));
      return;
    }
    closeDrawer(true);
    lastView = location.hash || '#/explore';
    renderView(view, parts.slice(1), params);
  }
  function renderView(view, sub, params) {
    const key = view + '/' + sub.join('/');
    $$('nav.tabs a').forEach(a => a.setAttribute('aria-current', a.dataset.view === view ? 'page' : 'false'));
    $('#tabs').classList.remove('open'); $('#menuBtn').setAttribute('aria-expanded', 'false');
    if (rendered === key && view === 'explore') return;
    const prev = rendered; rendered = key;
    ({ explore: renderExplore, plan: renderPlan, grad: renderGrad, programs: renderPrograms, help: renderHelp }[view] || renderExplore)(sub, params);
    if (prev && prev.split('/')[0] !== view) window.scrollTo(0, 0);
    document.title = ({ explore: 'Explore Courses', plan: 'My Plan', grad: 'Graduation Requirements', programs: 'Programs', help: 'Get Started' }[view] || 'Explore Courses') + ' · NWSS Course Guide 2027–2028';
  }
  window.addEventListener('hashchange', route);

  /* ---------------- EXPLORE ---------------- */
  function renderExplore() {
    const total = courses.filter(c => !c.tags.includes('notoffered')).length;
    main.innerHTML = `
    <section class="hero">
      <div class="wrap">
        <h1>Find your courses for 2027–2028</h1>
        <p class="lede">Every course from the NWSS Course Description Booklet, searchable in one place. Save courses to <b>My Plan</b>, then enter them in MyEd.</p>
        <div class="search" role="search">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <label class="sr-only" for="q">Search courses</label>
          <input id="q" type="search" autocomplete="off" placeholder="Search ${total} courses — try “chemistry”, “guitar”, “MCH--11”, “audition”…" value="${esc(ex.q)}">
          <button class="clear" id="qClear" ${ex.q ? '' : 'hidden'}>Clear</button>
        </div>
        <div class="gradebar" role="group" aria-label="Filter by grade">
          <span class="label">Grade:</span>
          ${[null, 9, 10, 11, 12].map(g => `<button class="seg" data-grade="${g ?? ''}" aria-pressed="${ex.grade === g}">${g ? g : 'All'}</button>`).join('')}
          <span class="deadline">Course selection deadline: <b>${esc(G.deadline)}</b></span>
        </div>
      </div>
      <div class="stripe"></div>
    </section>
    <div class="wrap explore">
      <aside class="filters" id="filters" aria-label="Filters"></aside>
      <section aria-live="polite">
        <div class="results-head">
          <button class="filters-toggle" id="fToggle">Filters</button>
          <div class="count" id="count"></div>
          <div class="active-chips" id="chips"></div>
          <div class="spacer"></div>
          <label class="sr-only" for="sort">Sort</label>
          <select class="sort" id="sort">
            <option value="subject">Group by subject</option>
            <option value="az">A–Z</option>
            <option value="grade">By grade</option>
          </select>
        </div>
        <div id="results"></div>
      </section>
    </div>`;
    $('#sort').value = ex.sort;
    const q = $('#q');
    let t;
    q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { ex.q = q.value; $('#qClear').hidden = !q.value; updateResults(); }, 90); });
    $('#qClear').addEventListener('click', () => { q.value = ''; ex.q = ''; $('#qClear').hidden = true; updateResults(); q.focus(); });
    $$('.seg').forEach(b => b.addEventListener('click', () => { ex.grade = b.dataset.grade ? +b.dataset.grade : null; $$('.seg').forEach(x => x.setAttribute('aria-pressed', x === b)); updateResults(); }));
    $('#sort').addEventListener('change', e => { ex.sort = e.target.value; updateResults(); });
    $('#fToggle').addEventListener('click', () => $('#filters').classList.add('open'));
    updateResults();
  }

  function renderFilters() {
    const base = filterCourses({ ignoreDept: true });
    const counts = {}; deptOrder.forEach(d => counts[d] = base.filter(c => inDept(c, d)).length);
    const tagCounts = {}; Object.keys(D.tags).forEach(t => tagCounts[t] = filterCourses().filter(c => c.tags.includes(t)).length);
    const tagList = ['required', 'indigenous', 'honours', 'dual', 'application', 'fee', 'fullyear', 'new', 'ba'];
    $('#filters').innerHTML = `
      <div class="fgroup" style="display:flex;align-items:center"><h3 style="margin:0">Subject areas</h3><button class="linkbtn fclose" id="fClose">Done</button></div>
      <div class="fgroup">
        <button class="dept-btn" data-dept="" aria-pressed="${!ex.depts.size}"><span class="dot" style="background:#999"></span>All subjects<span class="n">${base.length}</span></button>
        ${D.depts.map(d => `<button class="dept-btn" data-dept="${d.id}" aria-pressed="${ex.depts.has(d.id)}"><span class="dot" style="background:${d.color}"></span>${esc(d.short)}<span class="n">${counts[d.id]}</span></button>`).join('')}
        <button class="dept-btn" data-goto="#/programs/ib"><span class="dot" style="background:var(--ib)"></span>IB Diploma Programme<span class="n">→</span></button>
      </div>
      <div class="fgroup">
        <h3>Show only</h3>
        ${tagList.map(t => `<label class="check"><input type="checkbox" data-tag="${t}" ${ex.tags.has(t) ? 'checked' : ''}><span>${esc(D.tags[t][0])} <span class="hint">(${tagCounts[t]})</span></span></label>`).join('')}
        <label class="check"><input type="checkbox" id="showNA" ${ex.hideNA ? '' : 'checked'}><span>Include courses not offered this year</span></label>
      </div>
      ${(ex.depts.size || ex.tags.size || ex.grade || ex.q) ? '<button class="linkbtn" id="resetAll">Reset all filters</button>' : ''}`;
    $$('#filters .dept-btn').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.goto) { location.hash = b.dataset.goto; return; }
      const d = b.dataset.dept;
      if (!d) ex.depts.clear(); else if (ex.depts.has(d)) ex.depts.delete(d); else { ex.depts.clear(); ex.depts.add(d); }
      updateResults(); if (window.innerWidth > 820) window.scrollTo({ top: Math.min(window.scrollY, $('.explore').offsetTop - 80) });
    }));
    $$('#filters [data-tag]').forEach(i => i.addEventListener('change', () => { i.checked ? ex.tags.add(i.dataset.tag) : ex.tags.delete(i.dataset.tag); updateResults(); }));
    $('#showNA').addEventListener('change', e => { ex.hideNA = !e.target.checked; updateResults(); });
    $('#fClose').addEventListener('click', () => $('#filters').classList.remove('open'));
    const r = $('#resetAll'); if (r) r.addEventListener('click', resetFilters);
  }
  function resetFilters() {
    ex.q = ''; ex.grade = null; ex.depts.clear(); ex.tags.clear(); ex.hideNA = true;
    const q = $('#q'); if (q) q.value = ''; $('#qClear').hidden = true;
    $$('.seg').forEach(x => x.setAttribute('aria-pressed', x.dataset.grade === ''));
    updateResults();
  }

  function card(c) {
    const p = planned(c.id).length > 0;
    const tags = c.tags.filter(t => ['required', 'indigenous', 'honours', 'application', 'dual', 'new', 'notoffered'].includes(t)).slice(0, 3);
    return `<article class="card ${c.tags.includes('notoffered') ? 'dim' : ''}" style="--c:${c._color}">
      <button class="open" data-open="${c.id}"><h3>${esc(c.title)}</h3></button>
      ${c.codes.length ? `<div class="codes">${esc(c.codes.join(' · '))}</div>` : ''}
      ${c._excerpt ? `<p class="excerpt">${esc(c._excerpt)}</p>` : ''}
      <div class="foot">
        ${c.grades.length ? `<span class="gpill">${gradeLabel(c.grades)}</span>` : ''}
        ${tags.map(t => `<span class="tag ${t}">${esc(D.tags[t][0])}</span>`).join('')}
        <button class="addbtn ${p ? 'on' : ''}" data-add="${c.id}" aria-label="${p ? 'Remove from' : 'Add to'} My Plan: ${esc(c.title)}">${p ? '✓ In plan' : '+ Plan'}</button>
      </div>
    </article>`;
  }

  function updateResults() {
    store.set('nwss-explore-v1', { grade: ex.grade, sort: ex.sort });
    renderFilters();
    const list = filterCourses();
    $('#count').innerHTML = `${list.length} course${list.length === 1 ? '' : 's'}${ex.grade ? ` <span>for Grade ${ex.grade}</span>` : ''}`;
    const chips = [];
    ex.depts.forEach(d => chips.push(['dept', d, deptById[d].short]));
    ex.tags.forEach(t => chips.push(['tag', t, D.tags[t][0]]));
    $('#chips').innerHTML = chips.map(([k, v, l]) => `<span class="achip">${esc(l)}<button data-k="${k}" data-v="${v}" aria-label="Remove filter ${esc(l)}">×</button></span>`).join('');
    $$('#chips button').forEach(b => b.addEventListener('click', () => { (b.dataset.k === 'dept' ? ex.depts : ex.tags).delete(b.dataset.v); updateResults(); }));
    const R = $('#results');
    if (!list.length) {
      R.innerHTML = `<div class="empty"><h3>No courses match</h3><p>Try a different word, or <button class="linkbtn" id="emptyReset">clear all filters</button>.</p></div>`;
      $('#emptyReset').addEventListener('click', resetFilters); return;
    }
    let html = '';
    if (ex.sort === 'subject' && !ex.q) {
      const groups = ex.depts.size ? [...ex.depts] : deptOrder;
      groups.forEach(d => {
        const inD = list.filter(c => (ex.depts.size ? inDept(c, d) : c.dept === d));
        if (!inD.length) return;
        const dep = deptById[d];
        const subs = [...new Set(inD.map(c => (c.dept === d ? c.sub : null) || ''))];
        html += `<section class="dept-section" id="dept-${d}"><div class="dept-head"><h2 style="color:${dep.color}">${esc(dep.name)}</h2><span class="n">${inD.length}</span>${dep.link ? `<a href="${dep.link}" target="_blank" rel="noopener">BC curriculum ↗</a>` : ''}</div>`;
        const topIntro = D.intros[d + '|'];
        if (topIntro && topIntro.length && d !== 'ib') html += introBox(topIntro, 'About ' + dep.short);
        subs.forEach(s => {
          const items = inD.filter(c => ((c.dept === d ? c.sub : null) || '') === s);
          if (s) html += `<div class="sub-head">${esc(s)}</div>`;
          const si = s && D.intros[d + '|' + s];
          if (si && si.length) html += introBox(si, 'Good to know');
          html += `<div class="grid">${items.map(card).join('')}</div>`;
        });
        html += `</section>`;
      });
    } else {
      let l = list;
      if (ex.sort === 'az') l = [...list].sort((a, b) => a.title.localeCompare(b.title));
      if (ex.sort === 'grade') l = [...list].sort((a, b) => (a.grades[0] || 99) - (b.grades[0] || 99) || a.title.localeCompare(b.title));
      html = `<div class="grid">${l.map(card).join('')}</div>`;
    }
    R.innerHTML = html;
  }
  const introBox = (paras, label) => `<details class="intro"><summary>${esc(label)}</summary>${paras.map(p => `<p>${linkify(p)}</p>`).join('')}</details>`;

  function refreshPlanButtons() {
    $$('[data-add]').forEach(b => {
      const on = planned(b.dataset.add).length > 0;
      b.classList.toggle('on', on); b.textContent = on ? '✓ In plan' : '+ Plan';
    });
    if (drawerCourse) renderPlanBar(drawerCourse);
    if (rendered === 'plan/') renderPlan();
  }

  /* global click delegation */
  document.addEventListener('click', e => {
    const o = e.target.closest('[data-open]');
    if (o) { e.preventDefault(); location.hash = '#/course/' + encodeURIComponent(o.dataset.open); return; }
    const a = e.target.closest('[data-add]');
    if (a) {
      e.preventDefault(); e.stopPropagation();
      const c = byId[a.dataset.add];
      if (planned(c.id).length) { removeFromPlan(c.id); toast('Removed from My Plan'); return; }
      const gs = c.grades.length ? c.grades : [9, 10, 11, 12];
      if (gs.length === 1) { addToPlan(c.id, gs[0]); return; }
      if (ex.grade && gs.includes(ex.grade)) { addToPlan(c.id, ex.grade); return; }
      showPop(a, c, gs); return;
    }
    if (!e.target.closest('.pop')) closePop();
  });
  let popEl = null;
  function showPop(anchor, c, gs) {
    closePop();
    popEl = document.createElement('div'); popEl.className = 'pop'; popEl.setAttribute('role', 'dialog');
    popEl.innerHTML = `<span class="lbl">Add to:</span>${gs.map(g => `<button class="pbtn" data-g="${g}">Gr ${g}</button>`).join('')}`;
    document.body.appendChild(popEl);
    const r = anchor.getBoundingClientRect();
    const w = popEl.offsetWidth;
    popEl.style.top = (window.scrollY + r.bottom + 6) + 'px';
    popEl.style.left = Math.max(8, Math.min(window.scrollX + r.right - w, window.scrollX + document.documentElement.clientWidth - w - 8)) + 'px';
    popEl.querySelectorAll('button').forEach(b => b.addEventListener('click', ev => { ev.stopPropagation(); addToPlan(c.id, b.dataset.g); closePop(); }));
    popEl.querySelector('button').focus();
  }
  function closePop() { if (popEl) { popEl.remove(); popEl = null; } }

  /* ---------------- COURSE DRAWER ---------------- */
  let drawerCourse = null, lastFocus = null;
  function openCourse(id) {
    const c = byId[id]; const dr = $('#drawer');
    if (!c) { location.hash = lastView; return; }
    drawerCourse = c; closePop();
    if (!dr.classList.contains('show')) lastFocus = document.activeElement;
    const dep = deptById[c.dept];
    const blocks = []; let ul = null;
    (c.desc || []).forEach(b => {
      if (b.type === 'li') { if (!ul) { ul = []; blocks.push(ul); } ul.push(b.text); return; }
      ul = null; blocks.push(b);
    });
    const body = blocks.map(b => Array.isArray(b) ? `<ul>${b.map(t => `<li>${linkify(t)}</li>`).join('')}</ul>` : b.type === 'h' ? `<h4>${esc(b.text)}</h4>` : `<p>${linkify(b.text)}</p>`).join('');
    const ctx = [];
    if (c.dept === 'socials' && c.sub === 'Psychology') ctx.push('Psychology courses are not recognized as a Social Studies credit.');
    if (c.tags.includes('ba')) ctx.push('BA (Board/Authority Authorized) courses count as elective credits. Check with your counsellor before relying on one to meet a specific requirement.');
    if (c.tags.includes('indigenous')) ctx.push('This course meets the Indigenous-focused graduation requirement (4 credits, in grade 10, 11 or 12).');
    const stem = c.title.replace(/\b(9|10|11|12)\b(\/\d+)*/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    const rel = courses.filter(x => x.id !== c.id && x.dept === c.dept && (x.sub === c.sub))
      .map(x => [x.title.replace(/\b(9|10|11|12)\b(\/\d+)*/g, '').replace(/\s+/g, ' ').trim().toLowerCase() === stem ? 0 : 1, x])
      .sort((a, b) => a[0] - b[0] || (a[1].grades[0] || 0) - (b[1].grades[0] || 0)).slice(0, 6).map(x => x[1]);
    dr.style.setProperty('--c', c._color);
    dr.innerHTML = `
      <div class="dhead">
        <div class="dept" style="color:${c._color}">${esc(dep ? dep.name : '')}${c.sub ? ' · ' + esc(c.sub) : ''}</div>
        <h2 id="dTitle">${esc(c.title)}</h2>
        <button class="close" id="dClose" aria-label="Close">×</button>
        ${c.codes.length ? `<div class="codechips">${c.codes.map(k => `<span class="codechip">${esc(k)}<button data-copy="${esc(k)}" aria-label="Copy code ${esc(k)}">Copy</button></span>`).join('')}</div>` : '<div class="hint">No MyEd course code listed in the booklet.</div>'}
        <div class="meta-row">
          ${c.grades.length ? `<span class="gpill">${c.grades.length > 1 ? 'Grades ' + c.grades.join(', ') : 'Grade ' + c.grades[0]}</span>` : ''}
          ${c.focus ? `<span class="tag">Focus: ${esc(c.focus)}</span>` : ''}
          ${c.tags.map(t => `<span class="tag ${t}" title="${esc(D.tags[t][1])}">${esc(D.tags[t][0])}</span>`).join('')}
        </div>
      </div>
      <div class="dbody">
        ${body || '<p class="hint">No description provided in the booklet.</p>'}
        ${c.facts.length ? `<dl class="facts">${c.facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${linkify(v)}</dd>`).join('')}</dl>` : ''}
        ${c.recommended.length ? `<div class="box rec"><h4>Recommended preparation</h4>${c.recommended.map(r => `<div>${linkify(r)}</div>`).join('')}</div>` : ''}
        ${c.notes.length ? `<div class="box note"><h4>Please note</h4>${c.notes.map(r => `<div>${linkify(r)}</div>`).join('')}</div>` : ''}
        ${ctx.length ? `<div class="box ctx">${ctx.map(x => `<div>${esc(x)}</div>`).join('')}</div>` : ''}
        ${rel.length ? `<h4>Related courses</h4><div class="related">${rel.map(x => `<button data-open="${x.id}"><span>${esc(x.title)}</span><span class="gpill">${gradeLabel(x.grades)}</span></button>`).join('')}</div>` : ''}
        <p class="hint" style="margin-top:22px">Questions about this course? Ask the subject teacher or your <a href="#/help">counsellor</a>.</p>
      </div>
      <div class="planbar" id="planbar"></div>`;
    renderPlanBar(c);
    $('#dClose').addEventListener('click', () => closeDrawer());
    $$('[data-copy]', dr).forEach(b => b.addEventListener('click', () => copyText(b.dataset.copy)));
    dr.classList.add('show'); dr.setAttribute('aria-hidden', 'false'); $('#scrim').classList.add('show');
    document.body.style.overflow = 'hidden';
    $('.dbody', dr).scrollTop = 0;
    setTimeout(() => $('#dClose').focus(), 30);
  }
  function renderPlanBar(c) {
    const pb = $('#planbar'); if (!pb) return;
    const gs = c.grades.length ? c.grades : [9, 10, 11, 12];
    const inG = planned(c.id);
    pb.innerHTML = `<span class="lbl">My Plan:</span>${gs.map(g => `<button class="pbtn ${inG.includes(String(g)) ? 'on' : ''}" data-pg="${g}">${inG.includes(String(g)) ? '✓ ' : '+ '}Grade ${g}</button>`).join('')}
      <button class="pbtn" style="margin-left:auto;border-color:var(--line)" id="shareBtn">Copy link</button>`;
    $$('[data-pg]', pb).forEach(b => b.addEventListener('click', () => {
      const g = b.dataset.pg; inG.includes(g) ? (removeFromPlan(c.id, g), toast('Removed from Grade ' + g)) : addToPlan(c.id, g);
    }));
    $('#shareBtn').addEventListener('click', () => copyText(location.href.split('#')[0] + '#/course/' + c.id));
  }
  function closeDrawer(silent) {
    const dr = $('#drawer');
    if (!dr.classList.contains('show')) return;
    dr.classList.remove('show'); dr.setAttribute('aria-hidden', 'true'); $('#scrim').classList.remove('show');
    document.body.style.overflow = ''; drawerCourse = null;
    if (!silent) { location.hash = lastView; }
    if (lastFocus && document.body.contains(lastFocus)) lastFocus.focus();
  }
  $('#scrim').addEventListener('click', () => closeDrawer());
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { if (popEl) closePop(); else if (drawerCourse) closeDrawer(); else $('#filters')?.classList.remove('open'); }
    if (e.key === '/' && rendered && rendered.startsWith('explore') && document.activeElement.tagName !== 'INPUT') { e.preventDefault(); $('#q')?.focus(); }
    if (e.key === 'Tab' && drawerCourse) { // focus trap
      const f = $$('#drawer button, #drawer a[href]'); if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });

  /* ---------------- MY PLAN ---------------- */
  function creditsOf(c) {
    const f = (c.facts || []).find(([k]) => /high school credits/i.test(k));
    if (f) { const m = f[1].match(/(\d+)\s*credits/i); if (m) return +m[1]; }
    if (c.dept === 'inclusive' && c.sub === 'Core Foundations' && !/Applications for Learning/.test(c.title)) return 0;
    return 4;
  }
  function gradChecks() {
    const ids = ['10', '11', '12'].flatMap(g => plan[g].map(id => byId[id]));
    const has = fn => ids.some(c => c && fn(c));
    const sr = (c, gs) => c.grades.some(g => gs.includes(g));
    return [
      ['Physical & Health Education 10', has(c => /^(Physical & Health Education 10|Éducation physique et santé 10)/.test(c.title))],
      ['Science 10', has(c => /^Science 10/.test(c.title))],
      ['Social Studies 10', has(c => /^(Social Studies 10|Sciences humaines 10)/.test(c.title))],
      ['A Math 10', has(c => inDept(c, 'math') && c.grades.includes(10))],
      ['A Language Arts 10', has(c => (c.dept === 'english' && c.grades.includes(10)) || /^English 10 Honours/.test(c.title))],
      ['A Language Arts 11', has(c => c.dept === 'english' && c.grades.includes(11))],
      ['A required Language Arts 12', has(c => c.dept === 'english' && c.grades.includes(12))],
      ['A Science 11 or 12', has(c => c.dept === 'science' && sr(c, [11, 12]) && !c.tags.includes('ba'))],
      ['A Social Studies 11 or 12', has(c => ((c.dept === 'socials' && c.sub === 'Social Studies') || /^(Explorations en sciences humaines|Justice sociale)/.test(c.title)) && sr(c, [11, 12]))],
      ['A Math 11 or 12', has(c => c.dept === 'math' && sr(c, [11, 12]))],
      ['An Arts Education or ADST 10, 11 or 12', has(c => (c.dept === 'arts' || c.dept === 'adst') && sr(c, [10, 11, 12]))],
      ['Career-Life Education 10', has(c => /^Career Life Education 10/.test(c.title))],
      ['Career-Life Connections 12', has(c => /^Career Life Connections 12/.test(c.title))],
      ['An Indigenous-focused course', has(c => c.tags.includes('indigenous'))],
    ];
  }
  function renderPlan() {
    const cols = ['9', '10', '11', '12'];
    const totalCr = ['10', '11', '12'].reduce((s, g) => s + plan[g].reduce((a, id) => a + creditsOf(byId[id]), 0), 0);
    const g12Cr = plan['12'].reduce((a, id) => a + creditsOf(byId[id]), 0);
    const checks = gradChecks();
    const met = checks.filter(x => x[1]).length;
    const any = cols.some(g => plan[g].length);
    main.innerHTML = `<div class="wrap page">
      <div class="page-title"><h1>My Plan</h1><p>Your shortlist is saved on this device only. Use it to fill in MyEd.</p></div>
      <div class="print-only"><h2>NWSS Course Plan 2027–2028</h2><p>Name: ______________________ &nbsp; Student #: __________</p></div>
      <div class="actions no-print" style="margin-bottom:16px">
        <a class="btn" href="#/explore">+ Add courses</a>
        <button class="btn ghost" id="copyPlan" ${any ? '' : 'disabled'}>Copy codes for MyEd</button>
        <button class="btn ghost" id="printPlan" ${any ? '' : 'disabled'}>Print / save as PDF</button>
        ${any ? '<button class="btn ghost" id="clearPlan" style="margin-left:auto">Clear plan</button>' : ''}
      </div>
      <div class="plan-grid">
        ${cols.map(g => {
          const n = plan[g].length;
          return `<section class="pcol"><h3>Grade ${g}<span class="cnt ${n === 8 ? 'full' : n > 8 ? 'over' : ''}">${n} / 8</span></h3>
          ${plan[g].map(id => { const c = byId[id]; return `<div class="pitem" style="--c:${c._color}"><div><button class="t" data-open="${c.id}">${esc(c.title)}</button><div class="cd">${esc(c.codes.join(' · ') || '—')}</div></div><button class="x" data-rm="${c.id}" data-g="${g}" aria-label="Remove ${esc(c.title)} from Grade ${g}">×</button></div>`; }).join('')}
          ${n < 8 ? `<a class="pempty no-print" href="#/explore" data-pickgrade="${g}">${n ? '+ Add more' : 'No courses yet — browse Grade ' + g + ' courses'}</a>` : ''}
          ${n > 8 ? '<div class="hint">Most students take 8 courses a year. Talk to your counsellor about a heavier load.</div>' : ''}
          </section>`;
        }).join('')}
      </div>
      <div class="cols" style="margin-top:18px">
        <section class="panel">
          <h2>Graduation check</h2>
          <p class="hint" style="margin-top:-4px">Based on the courses in your Grade 10–12 plan. This is a planning aid only — your counsellor confirms requirements.</p>
          <div class="meter" aria-hidden="true"><i style="width:${Math.round(met / checks.length * 100)}%"></i></div>
          <p style="margin:2px 0 14px;font-weight:600">${met} of ${checks.length} required areas planned</p>
          <ul class="checks">${checks.map(([l, ok]) => `<li><span class="ic ${ok ? 'y' : 'n'}">${ok ? '✓' : ''}</span>${esc(l)}</li>`).join('')}</ul>
        </section>
        <section class="panel">
          <h2>Credits</h2>
          <div class="big-stat"><div><b>${totalCr}</b><span>of 80 credits planned (Gr 10–12)</span></div><div><b>${g12Cr}</b><span>of 16+ Grade 12 credits</span></div></div>
          <p class="hint">Most courses are worth 4 credits. Graduation also requires at least 28 elective credits and the three Provincial Graduation Assessments (Literacy 10, Numeracy 10, Literacy 12).</p>
          <p class="hint">Remember to choose <b>alternate courses</b> in MyEd too — first choices aren't always possible.</p>
          <p><a href="#/grad">See all graduation requirements →</a></p>
        </section>
      </div>
    </div>`;
    $$('[data-rm]').forEach(b => b.addEventListener('click', () => { removeFromPlan(b.dataset.rm, b.dataset.g); renderPlan(); }));
    $$('[data-pickgrade]').forEach(a => a.addEventListener('click', () => { ex.grade = +a.dataset.pickgrade; }));
    const cp = $('#copyPlan'); if (cp) cp.addEventListener('click', () => {
      const txt = cols.filter(g => plan[g].length).map(g => `GRADE ${g}\n` + plan[g].map(id => { const c = byId[id]; return `  ${(c.codes[0] || '(no code)').padEnd(12)} ${c.title}${c.codes.length > 1 ? '  [codes: ' + c.codes.join(', ') + ']' : ''}`; }).join('\n')).join('\n\n');
      copyText('My NWSS course plan 2027–2028\n\n' + txt + '\n');
    });
    const pp = $('#printPlan'); if (pp) pp.addEventListener('click', () => window.print());
    const cl = $('#clearPlan'); if (cl) cl.addEventListener('click', () => { if (confirm('Remove every course from your plan?')) { plan = { 9: [], 10: [], 11: [], 12: [] }; savePlan(); renderPlan(); refreshPlanButtons(); } });
  }

  /* ---------------- GRADUATION ---------------- */
  function chipFor(name) {
    const n = fold(name).replace(/[–+\-]/g, ' ').replace(/\s+/g, ' ');
    const c = courses.find(x => fold(x.title).replace(/[–+\-]/g, ' ').replace(/\s+/g, ' ').includes(n));
    return c ? `<button class="clink" data-open="${c.id}">${esc(name)}</button>` : `<span class="clink plain">${esc(name)}</span>`;
  }
  function renderGrad(sub, params) {
    const dw = G.dogwood, dd = G.dual_dogwood;
    const stream = params.get('stream') === 'fi' ? 'fi' : 'english';
    const indig = courses.filter(c => c.tags.includes('indigenous'));
    main.innerHTML = `<div class="wrap page">
      <div class="page-title"><h1>Graduation requirements</h1><p>What every student needs for the B.C. Certificate of Graduation (Dogwood Diploma).</p></div>
      <nav class="subnav" aria-label="Sections">
        <a href="#dogwood">Dogwood Diploma</a><a href="#bygrade">Required courses by grade</a><a href="#indig">Indigenous-focused</a><a href="#assess">Graduation assessments</a><a href="#dual">French Immersion Dual Dogwood</a>
      </nav>
      <section class="panel" id="dogwood">
        <h2>B.C. Certificate of Graduation (Dogwood Diploma)</h2>
        <p>${esc(dw.summary)}</p>
        <div class="big-stat"><div><b>80</b><span>credits total</span></div><div><b>52</b><span>credits from required courses</span></div><div><b>28</b><span>elective credits (minimum)</span></div><div><b>16</b><span>credits at Grade 12 level (minimum)</span></div></div>
        <h3>52 credits are required from:</h3>
        <ul class="reqlist">${dw.required52.map((r, i) => `<li><span class="num">${i + 1}</span><span>${esc(r)}</span></li>`).join('')}</ul>
        <h3>Electives</h3><p>${esc(dw.electives)}</p>
        <h3>Plus three Provincial Graduation Assessments</h3>
        <div class="clist">${dw.assessments.map(a => `<span class="clink plain">${esc(a)}</span>`).join('')}</div>
      </section>
      <section class="panel" id="bygrade">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:10px"><h2 style="margin:0">Required courses by grade</h2>
          <div class="toggle" role="group" aria-label="Program"><button data-stream="english" aria-pressed="${stream === 'english'}">English program</button><button data-stream="fi" aria-pressed="${stream === 'fi'}">French Immersion</button></div></div>
        <p class="hint">Students take 8 courses per year. Courses marked “Gr 11 or 12” can be taken in either year.</p>
        <div class="tablewrap"><table class="req"><thead><tr><th></th><th>Grade 9</th><th>Grade 10</th><th>Grade 11</th><th>Grade 12</th></tr></thead>
        <tbody>${G.required_table[stream].map((row, i) => `<tr><td class="slot">Course ${i + 1}</td>${row.map(cell => `<td class="${/^Elective/.test(cell) ? 'elective' : ''}">${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      </section>
      <section class="panel" id="indig">
        <h2>Indigenous-focused requirement (4 credits)</h2>
        <p>${esc(G.indigenous.summary)}</p>
        <h3>Courses at NWSS that meet this requirement</h3>
        <div class="clist">${indig.map(c => `<button class="clink" data-open="${c.id}">${esc(c.title)}</button>`).join('')}</div>
        <p class="hint" style="margin-top:10px">The booklet also lists English First Peoples – Literary Studies + Writing 11, which may be offered.</p>
      </section>
      <section class="panel" id="assess">
        <h2>Graduation assessments</h2>
        <ul>${G.assess_notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>
        <h3>How results are reported</h3>
        <div class="scale">${G.scale.map(([k, v]) => `<div><b>${esc(k)}</b>${esc(v)}</div>`).join('')}</div>
      </section>
      <section class="panel" id="dual">
        <h2>French Immersion Dual Dogwood</h2>
        <p>${esc(dd.summary)}</p>
        <ul>${dd.items.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
        <h3>French Immersion students write four Graduation Assessments</h3>
        <div class="clist">${dd.assessments.map(a => `<span class="clink plain">${esc(a)}</span>`).join('')}</div>
        <p style="margin-top:14px"><a href="#/programs/fi">Browse French Immersion courses →</a></p>
      </section>
    </div>`;
    $$('[data-stream]').forEach(b => b.addEventListener('click', () => { location.hash = '#/grad?stream=' + b.dataset.stream; setTimeout(() => $('#bygrade').scrollIntoView(), 0); }));
    $$('.subnav a').forEach(a => a.addEventListener('click', e => { e.preventDefault(); $(a.getAttribute('href')).scrollIntoView({ behavior: 'smooth' }); }));
  }

  /* ---------------- PROGRAMS ---------------- */
  const PROGS = [['ib', 'IB Diploma'], ['fi', 'French Immersion'], ['dual', 'Dual Credit & Trades'], ['honours', 'Honours'], ['academies', 'Sports Academies'], ['arts', 'Performing Arts Programs'], ['online', 'Online Courses']];
  function courseList(list) { return `<div class="grid">${list.map(card).join('')}</div>`; }
  function renderPrograms(sub) {
    const p = PROGS.some(x => x[0] === sub[0]) ? sub[0] : 'ib';
    let body = '';
    if (p === 'ib') {
      const ib = G.ib;
      body = `<div class="ib-hero"><h2>International Baccalaureate Diploma Programme</h2>${ib.about.map(x => `<p>${esc(x)}</p>`).join('')}
        <p style="margin-top:14px"><a href="${ib.handbook}" target="_blank" rel="noopener" class="btn" style="background:#fff;color:var(--ib);border-color:#fff">Read the NWSS IB Programme Handbook ↗</a></p></div>
        <div class="cols">
          <section class="panel"><h2>Welcome to IB at NWSS</h2>${ib.intro.filter(x => !/^For further information/.test(x)).map(x => x.startsWith('• ') ? `<li style="margin-left:1.2em">${esc(x.slice(2))}</li>` : `<p>${esc(x)}</p>`).join('')}</section>
          <section class="panel"><h2>Earning the IB Diploma</h2><p>${esc(ib.earning)}</p>
            <h3>The core</h3>${ib.core.map(([k, v]) => `<p><b>${esc(k)}</b> — ${esc(v)}</p>`).join('')}
            ${ib.quotes.map(([q, w]) => `<blockquote class="q" style="margin-top:10px">“${esc(q)}”<cite>${esc(w)}</cite></blockquote>`).join('')}
          </section>
        </div>
        <section class="panel"><h2>IB courses offered at NWSS</h2><p class="hint">Choose one course from each of groups 1–5, plus one more from group 3, 4 or 6. Include 3–4 Higher Level (HL) courses.</p>
          <div class="ib-groups">${ib.groups.map(([g, list]) => `<div class="ibg"><h4>${esc(g)}</h4><ul>${list.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`).join('')}</div></section>
        <div class="cols">
          <section class="panel"><h2>Preparing in Grades 9–10</h2>
            <h3>Grade 9 or 10</h3><div class="clist">${ib.prep.g9or10.map(chipFor).join('')}</div>
            <h3>Grade 10 Honours courses</h3><div class="clist">${ib.prep.g10.map(n => chipFor(n.replace(/ \(.*\)/, '').replace('Foundations and Pre-Calculus 10 Honours', 'Mathematics 10 Honours'))).join('')}</div>
            <p class="hint" style="margin-top:10px">${esc(ib.prep.note)}</p></section>
          <section class="panel"><h2>Pre-requisites</h2><table class="req"><tbody>${ib.prereqs.map(([a, b]) => `<tr><td><b>${esc(a)}</b></td><td>${chipFor(b)}</td></tr>`).join('')}</tbody></table>
            <h3>Dual Dogwood + IB Diploma</h3><p>${esc(ib.dual)}</p></section>
        </div>
        <section class="panel"><h2>Sample pathways to a diploma</h2><p class="hint">Be sure to double-check university admission requirements during your course planning process.</p>
          <div class="ib-groups three">${ib.pathways.map(([g, list]) => `<div class="ibg"><h4>${esc(g)}</h4><ul>${list.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`).join('')}</div></section>`;
    } else if (p === 'fi') {
      body = `<section class="panel"><h2>French Immersion</h2><p>French Immersion students can earn both the Dogwood Diploma and the Diplôme de fin d’études secondaires en Colombie-Britannique. <a href="#/grad?stream=fi">See Dual Dogwood requirements →</a></p></section>
        ${courseList(courses.filter(c => c.dept === 'fi'))}`;
    } else if (p === 'dual') {
      const di = D.intros['dual|'] || [], ti = D.intros['adst|Trades & Apprenticeship'] || [];
      body = `<section class="panel"><h2>Dual Credit Programs</h2>${di.filter(x => x !== 'DUAL CREDIT').map(x => `<p>${linkify(x)}</p>`).join('')}</section>
        ${courseList(courses.filter(c => c.dept === 'dual'))}
        <section class="panel" style="margin-top:22px"><h2>Youth Explore & Train in Trades</h2>${ti.map(x => `<p>${linkify(x)}</p>`).join('')}</section>
        ${courseList(courses.filter(c => c.sub === 'Trades & Apprenticeship'))}`;
    } else if (p === 'honours') {
      body = `<section class="panel"><h2>Academic Enrichment — Honours</h2>${(D.intros['enrich|'] || []).map(x => `<p>${linkify(x)}</p>`).join('')}<p><a href="#/programs/ib">How Honours prepares students for IB →</a></p></section>
        ${courseList(courses.filter(c => c.dept === 'enrich'))}`;
    } else if (p === 'academies') {
      body = `<section class="panel"><h2>Sports Academies & Skills Programs</h2><p>Integrated athletic programs combining skill development, training and education. Some carry equipment requirements or course fees.</p></section>
        ${courseList(courses.filter(c => c.dept === 'phe' && (c.sub === 'Sports Academies' || /Skills|Football/.test(c.title))))}`;
    } else if (p === 'arts') {
      body = `<section class="panel"><h2>Performing Arts Programs</h2><p>Auditioned and extra-curricular performance programs in dance, theatre and music.</p></section>
        ${courseList(courses.filter(c => c.dept === 'arts' && (c.tags.includes('application') || c.tags.includes('fullyear') || /Musical Theatre/.test(c.title))))}`;
    } else if (p === 'online') {
      body = `<section class="panel"><h2>New Westminster Online Courses</h2><p>These courses are available through New Westminster Online. Talk to your counsellor about adding an online course to your program.</p>
        <div class="cols">${G.online.map(([k, list]) => `<div><h3>${esc(k)}</h3><div class="clist">${list.map(chipFor).join('')}</div></div>`).join('')}</div></section>`;
    }
    main.innerHTML = `<div class="wrap page">
      <div class="page-title"><h1>Programs</h1><p>Specialized programs and pathways at NWSS.</p></div>
      <nav class="subnav" aria-label="Programs">${PROGS.map(([k, l]) => `<a href="#/programs/${k}" class="${k === p ? 'on' : ''}">${esc(l)}</a>`).join('')}</nav>
      ${body}</div>`;
  }

  /* ---------------- HELP / GET STARTED ---------------- */
  function counsellorFor(last) {
    const n = fold(last).replace(/[^a-z]/g, '');
    if (!n) return null;
    const list = G.counsellors.filter(c => c.from);
    let hit = list[0];
    list.forEach(c => { if (n >= c.from) hit = c; });
    return hit;
  }
  function renderHelp() {
    const colors = ['#EC7C30', '#D9A21B', '#8DB52A', '#4C9A2A', '#2E6B1F'];
    main.innerHTML = `<div class="wrap page">
      <div class="page-title"><h1>Get started</h1><p>How course selection works at NWSS.</p></div>
      <div class="cols">
        <section class="panel">
          <h2>Five steps to choosing your courses</h2>
          <p><span class="tag new">Deadline</span> <b>${esc(G.deadline)}</b> — enter your selections in MyEducation BC.</p>
          <ol class="steps">${G.steps.map(([t, d], i) => `<li style="--sc:${colors[i]}"><div><b>${esc(t)}</b><span>${esc(d)}</span></div></li>`).join('')}</ol>
          <h3>A good program of studies should…</h3>
          <ul>${G.goals.map(g => `<li>${esc(g)}</li>`).join('')}</ul>
        </section>
        <section class="panel">
          <h2>Find your counsellor</h2>
          <p>Counsellors are assigned by last name.</p>
          <div class="finder"><label class="sr-only" for="lname">Your last name</label><input id="lname" placeholder="Type your last name…" autocomplete="family-name"><span class="result" id="lres" aria-live="polite"></span></div>
          <div class="couns">${G.counsellors.map((c, i) => `<div class="coun" data-ci="${i}"><div class="range">${esc(c.range)}</div><div class="nm">${esc(c.name)}</div><div class="em"><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></div>${c.note ? `<div class="nt">${esc(c.note)}</div>` : ''}</div>`).join('')}</div>
          <h3>Other contacts</h3>
          <ul>${G.contacts.map(([r, n, e]) => `<li><b>${esc(r)}:</b> ${esc(n)} — <a href="mailto:${e}">${e}</a></li>`).join('')}</ul>
        </section>
      </div>
      <section class="panel"><h2>About this guide</h2>${G.intro.map(x => `<p>${esc(x)}</p>`).join('')}</section>
      <section class="panel"><h2>B.C.’s curriculum</h2><div class="cols">${G.curriculum.map(([k, v]) => `<div><h3 style="margin-top:0">${esc(k)}</h3><p>${esc(v)}</p></div>`).join('')}</div></section>
    </div>`;
    const inp = $('#lname');
    inp.addEventListener('input', () => {
      const c = counsellorFor(inp.value);
      $$('.coun').forEach(el => el.classList.toggle('hit', c && G.counsellors[+el.dataset.ci] === c));
      $('#lres').textContent = c ? `→ ${c.name}` : '';
    });
  }

  /* ---------------- init ---------------- */
  $('#menuBtn').addEventListener('click', () => { const t = $('#tabs'); t.classList.toggle('open'); $('#menuBtn').setAttribute('aria-expanded', t.classList.contains('open')); });
  savePlan();
  if (!location.hash) history.replaceState(null, '', '#/explore');
  route();
})();

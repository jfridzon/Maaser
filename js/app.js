import {
  defaultConfig, cents, parseAmount, convert, live, ledger, recurring, dayOf, rateOf, dueOf, baseValue, totals,
  payInfo, paysLeftThisYear, normalizeKind, siteHost, normalizeUrl, onColor, SCHEDULES, BUILTIN_KINDS,
} from './core.js';
import { t, setLang, getLang, KIND_LABELS } from './i18n.js';
import { fetchRates, COMMON, currencyName, shortCode, formatMoney } from './rates.js';
import { client, whoAmI, syncEvents, syncSettings } from './sync.js';
import { icon } from './icons.js';
import { tabLens, touchLight } from './liquid.js';
import { VAPID_PUBLIC_KEY, SOURCE_URL } from './config.js';

const VERSION = '2.0.0';
const STORE = 'maaser.v1';
const DOTS = '••••••';
const TABS = [['home', 'tab.home', 'house'], ['moves', 'tab.moves', 'list'], ['give', 'tab.give', 'heart'], ['stats', 'tab.stats', 'chart']];
const KIND_ICON = { sueldo: 'case', regalo: 'gift', zelle: 'phone', otro: 'tag' };
const SWATCHES = ['#14B8A6', '#0EA5E9', '#6366F1', '#A855F7', '#EC4899', '#EF4444', '#F59E0B', '#22C55E'];
const PALETTE = ['#14B8A6', '#6366F1', '#F59E0B', '#EC4899', '#0EA5E9', '#22C55E', '#EF4444', '#94A3B8'];

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad2 = n => String(n).padStart(2, '0');
const isoDay = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const today = () => isoDay(new Date());
const parseDay = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const dateFmt = (s, o) => parseDay(s).toLocaleDateString(getLang(), o);
const longDay = s => dateFmt(s, { weekday: 'long', day: 'numeric', month: 'long' });
const shortDay = s => dateFmt(s, { day: 'numeric', month: 'short' });
const newId = k => `${Date.now()}-${k}-${Math.random().toString(36).slice(2, 7)}`;

function load() {
  const lang = (navigator.language || 'en').startsWith('es') ? 'es' : 'en';
  const base = { events: [], cfg: defaultConfig(lang), token: '', repo: '', lastSync: '', rates: { map: {}, at: 0 } };
  try {
    const s = JSON.parse(localStorage.getItem(STORE));
    if (s && Array.isArray(s.events)) {
      if (!s.cfg) {
        // Version 1 kept its settings at the top level.
        s.cfg = { ...defaultConfig('es'), setup: true, rate: s.rate || 10, goal: s.goal || 0, hideOnOpen: s.hideOnOpen !== false,
          schedule: s.anchor ? { freq: 'biweekly', anchor: s.anchor } : { freq: 'none', anchor: '' } };
      }
      return { ...base, ...s, cfg: { ...defaultConfig(lang), ...s.cfg } };
    }
  } catch (e) { /* blocked or empty storage starts fresh */ }
  return base;
}
const S = load();
const C = () => S.cfg;
const ui = { tab: 'home', masked: C().hideOnOpen !== false, filter: 'all', q: '', year: new Date().getFullYear(), syncState: '', syncError: '', sp: 'main', editSites: false, tap: null };
setLang(C().lang);

function save() { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) { toast(t('toast.storage')); } }
let cfgTimer;
function touchCfg() {
  C().updatedAt = Date.now();
  save();
  clearTimeout(cfgTimer);
  cfgTimer = setTimeout(sync, 1500);
}
const ctx = () => ({ base: C().base, rate: C().rate, rates: S.rates.map });
const fmt = (c, code = C().base) => formatMoney(c, code, getLang());
const money = c => (ui.masked ? DOTS : fmt(c));
const moneyRound = c => (ui.masked ? '•••' : fmt(Math.round(c / 100) * 100).replace(/[.,]00(?=\D*$)/, ''));
const catsVisible = () => C().cats.filter(c => !c.hidden);
const catName = id => { const c = C().cats.find(x => x.id === id); return (c && c.name) || (BUILTIN_KINDS.includes(id) ? t(`kind.${id}`) : t('kind.otro')); };
const catColor = id => { const c = C().cats.find(x => x.id === id); return (c && c.color) || PALETTE[Math.max(0, C().cats.findIndex(x => x.id === id)) % PALETTE.length]; };
const sortNew = list => list.sort((a, b) => dayOf(b).localeCompare(dayOf(a)) || b.ts - a.ts);
const L = () => ledger(S.events);

function applyTheme() {
  const a = C().accent, root = document.documentElement.style;
  root.setProperty('--accent', a);
  root.setProperty('--on-accent', onColor(a));
  $('dock').classList.toggle('flip', C().hand === 'right');
  document.documentElement.lang = getLang();
}

function ring(pct, size, stroke, label) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, p = Math.max(0, Math.min(1, pct));
  return `<div class="ring" style="width:${size}px;height:${size}px"><svg width="${size}" height="${size}"><circle class="bgc" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}"/><circle class="fg" data-off="${c * (1 - p)}" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" stroke-dasharray="${c}" stroke-dashoffset="${c}"/></svg><span>${label}</span></div>`;
}
const settle = fn => requestAnimationFrame(() => requestAnimationFrame(fn));
const animateRings = root => settle(() => root.querySelectorAll('.fg').forEach(c => { c.style.strokeDashoffset = c.dataset.off; }));
const screen = (title, body) => `<div class="top">${title}</div><div class="scroll">${body}</div>`;
const empty = (name, text) => `<div class="empty"><span class="ico">${icon(name, 26)}</span>${text}</div>`;

function rowFor(e) {
  const c = ctx(), given = e.type === 'given', tax = e.type === 'tax', start = e.type === 'start';
  const title = given ? (e.to || t('row.given')) : tax ? t('row.tax') : start ? t('row.start') : catName(e.kind);
  const foreign = e.cur && e.cur !== C().base && !ui.masked ? fmt(cents(e.amount), e.cur) : '';
  const sub = [shortDay(dayOf(e)), foreign, e.kept ? t('row.kept') : '', e.deductible ? t('row.deductible') : '', e.note].filter(Boolean).map(esc).join(' · ');
  const value = given ? `−${money(baseValue(e, c))}` : tax ? `−${money(-totals([e], c).due)}` : start ? money(baseValue(e, c)) : `+${money(dueOf(e, c))}`;
  const ic = given ? `<span class="ico out">${icon('arrowup', 19)}</span>` : tax ? `<span class="ico warm">${icon('scale', 19)}</span>`
    : start ? `<span class="ico">${icon('flag', 19)}</span>` : `<span class="ico">${icon(KIND_ICON[e.kind] || 'tag', 19)}</span>`;
  return `<div class="swipe"><button class="under" data-act="delete" data-id="${esc(e.id)}">${t('row.delete')}</button><button class="row" data-act="detail" data-id="${esc(e.id)}">${ic}<span class="m"><div class="t">${esc(title)}</div><div class="s">${sub}</div></span><span class="v ${given ? 'good' : ''}">${value}</span></button></div>`;
}

const paidThisMonth = r => L().some(e => e.type === 'given' && e.to === r.to && dayOf(e).slice(0, 7) === today().slice(0, 7));

function renderHome() {
  const c = ctx(), list = sortNew(L()), all = totals(list, c);
  const year = String(new Date().getFullYear()), y = totals(list.filter(e => dayOf(e).startsWith(year)), c);
  const p = payInfo(C().schedule, today()), done = y.due > 0 ? y.given / y.due : 0;
  const label = all.owed < 0 ? t('home.over') : all.owed === 0 ? t('home.even') : t('home.owe');
  const pays = list.filter(e => e.kind === 'sueldo');
  const missing = p && pays.length && !pays.some(e => dayOf(e) >= p.last);
  const pending = recurring(S.events).filter(r => !paidThisMonth(r));
  // One note at a time keeps the screen calm.
  const note = missing ? `<button class="note warn gl" data-act="add" data-kind="sueldo">${icon('case', 22)}<span class="grow">${t('note.missing')}<small>${esc(t('note.missingSub', { d: longDay(p.last) }))}</small></span>${icon('chevron', 16)}</button>`
    : C().fridayNote && new Date().getDay() === 5 && all.owed > 0 ? `<button class="note gl" data-act="give">${icon('flame', 22)}<span class="grow">${t('note.friday')}<small>${t('note.fridaySub')}</small></span>${icon('chevron', 16)}</button>`
      : pending.length ? `<button class="note gl" data-act="tab" data-tab="give">${icon('repeat', 22)}<span class="grow">${t('note.fixed')}<small>${t('note.fixedSub')}</small></span>${icon('chevron', 16)}</button>` : '';
  let sub = dateFmt(today(), { weekday: 'long', day: 'numeric', month: 'long' });
  if (C().hebrewDate) { try { sub = new Intl.DateTimeFormat(`${getLang()}-u-ca-hebrew`, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()).replace(/\s*AM$/, ''); } catch (e) { /* keep civil date */ } }
  const quick = catsVisible().slice(0, 3).map(k => `<button class="act" data-act="add" data-kind="${esc(k.id)}"><b class="glass gl">${icon(KIND_ICON[k.id] || 'tag', 23)}</b><span>${esc(catName(k.id))}</span></button>`).join('');
  const when = p ? (p.days === 0 ? t('home.today') : p.days === 1 ? t('home.tomorrow') : t('home.inDays', { n: p.days })) : '';
  $('s-home').innerHTML = screen('Maaser', `
    <div class="head"><div><small>${esc(sub)}</small><h1>Maaser</h1></div>
      <button class="round glass gl" data-act="settings" aria-label="${t('a.settings')}">${icon('gear', 22)}</button></div>
    <div class="hero">
      <div class="hero-top"><span class="hero-label">${label}</span><button class="hero-cur" data-act="convert-owed">${esc(shortCode(C().base))}${icon('swap', 14, 2.2)}</button></div>
      <div class="hero-amount ${ui.masked ? 'dots' : ''}" id="owed">${ui.masked ? DOTS : fmt(Math.abs(all.owed))}</div>
      <div class="hero-foot"><div class="track"><i id="heroBar" style="width:0"></i></div><span>${y.due ? t('home.given', { p: Math.round(done * 100), y: year }) : t('home.none', { y: year })}</span></div>
    </div>
    ${note}
    <div class="actions">${quick}<button class="act" data-act="give"><b class="glass gl">${icon('heart', 23)}</b><span>${t('tab.give')}</span></button></div>
    ${p ? `<div class="card pay"><span class="ico">${icon('calendar', 19)}</span><div class="grow"><div class="t">${t('home.nextPay')}</div><div class="s">${esc(longDay(p.next))}</div></div><span class="tag">${esc(when)}</span><i class="pay-bar" style="--w:${Math.round((1 - p.days / p.span) * 100)}%"></i></div>` : ''}
    <div class="title">${t('home.recent')}${list.length > 3 ? `<button data-act="tab" data-tab="moves">${t('home.all')}</button>` : ''}</div>
    <div class="card stagger">${list.length ? list.slice(0, 3).map(rowFor).join('') : empty('plus', t('home.first'))}</div>`);
  settle(() => { const b = $('heroBar'); if (b) b.style.width = `${Math.min(100, done * 100)}%`; });
}

const emptyMoves = q => empty(q ? 'search' : 'list', q ? t('moves.none') : t('moves.empty'));
function renderMoves() {
  const q = ui.q.trim().toLowerCase(), c = ctx();
  const list = sortNew(L()).filter(e => {
    if (ui.filter === 'in' && e.type === 'given') return false;
    if (ui.filter === 'out' && e.type !== 'given') return false;
    return !q || [e.to, e.note, e.kind && catName(e.kind), String(e.amount)].filter(Boolean).join(' ').toLowerCase().includes(q);
  });
  const groups = new Map();
  for (const e of list) {
    const k = dayOf(e).slice(0, 7);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(e);
  }
  const html = [...groups].map(([k, items]) => `<div class="month"><span>${esc(dateFmt(`${k}-01`, { month: 'long', year: 'numeric' }))}</span><span>${moneyRound(totals(items, c).owed)}</span></div><div class="card">${items.map(rowFor).join('')}</div>`).join('');
  const box = document.querySelector('#s-moves .results');
  if (box) { box.innerHTML = html || emptyMoves(q); setSeg(); return; }
  $('s-moves').innerHTML = screen(t('tab.moves'), `
    <div class="head"><h1>${t('tab.moves')}</h1></div>
    <label class="search">${icon('search', 18)}<input id="q" type="search" placeholder="${t('moves.search')}" autocomplete="off" value="${esc(ui.q)}"></label>
    <div class="gap"></div>
    <div class="seg" id="seg"><span class="lens"></span><button data-act="filter" data-f="all">${t('moves.all')}</button><button data-act="filter" data-f="in">${t('moves.in')}</button><button data-act="filter" data-f="out">${t('moves.out')}</button></div>
    <div class="results stagger">${html || emptyMoves(q)}</div>`);
  setSeg();
}
function setSeg() {
  const seg = $('seg');
  if (!seg) return;
  const btns = [...seg.querySelectorAll('button')], i = btns.findIndex(b => b.dataset.f === ui.filter);
  btns.forEach((b, n) => b.classList.toggle('on', n === i));
  const lens = seg.querySelector('.lens');
  lens.style.width = `calc((100% - 6px) / ${btns.length})`;
  lens.style.transform = `translateX(${i * 100}%)`;
}

function siteTile(s) {
  const host = siteHost(s.url), mark = s.mark || (s.name || '?')[0].toUpperCase();
  const logo = s.logo !== false && !s.mark && host ? `<img src="https://icons.duckduckgo.com/ip3/${esc(host)}.ico" alt="" loading="lazy" onerror="this.remove()">` : '';
  return `<button class="site" data-act="site" data-id="${esc(s.id)}"><b style="background:${esc(s.color)}"><em>${esc(mark)}</em>${logo}</b><span>${esc(s.name)}</span></button>`;
}
function renderGive() {
  const c = ctx(), year = String(new Date().getFullYear());
  const list = L().filter(e => dayOf(e).startsWith(year)), y = totals(list, c);
  const goal = cents(C().goal || 0), pct = goal ? y.given / goal : (y.due ? y.given / y.due : 0);
  const byTo = new Map();
  for (const e of list) if (e.type === 'given') { const k = e.to || t('give.nobody'); byTo.set(k, (byTo.get(k) || 0) + baseValue(e, c)); }
  const ranked = [...byTo].sort((a, b) => b[1] - a[1]);
  const fixed = recurring(S.events);
  const fixedRows = fixed.map(r => {
    const paid = paidThisMonth(r);
    return `<div class="row"><span class="ico">${icon('repeat', 19)}</span><span class="m"><div class="t">${esc(r.to)}</div><div class="s">${esc(t('give.fixedSub', { v: money(baseValue(r, c)) }))}</div></span><button class="tag ${paid ? 'done' : ''}" data-act="${paid ? 'recur-remove' : 'recur-pay'}" data-id="${esc(r.id)}">${paid ? t('give.logged') : t('give.log')}</button></div>`;
  }).join('');
  $('s-give').innerHTML = screen(t('tab.give'), `
    <div class="head"><h1>${t('tab.give')}</h1></div>
    <div class="card pad goal">${ring(pct, 76, 8, `${Math.round(Math.min(pct, 9.99) * 100)}%`)}
      <div class="grow"><div class="s">${t('give.year', { y: year })}</div><div class="big">${money(y.given)}</div>
      <div class="s">${esc(goal ? t('give.goal', { v: moneyRound(goal) }) : t('give.of', { v: moneyRound(y.due) }))}</div></div></div>
    <div class="title">${t('give.sites')}${C().sites.length ? `<button data-act="sites-edit">${ui.editSites ? t('give.done') : t('give.edit')}</button>` : ''}</div>
    <div class="sites ${ui.editSites ? 'wiggle' : ''}">${C().sites.map(siteTile).join('')}
      <button class="site" data-act="site-new"><b class="add">${icon('plus', 24)}</b><span>${t('give.addSite')}</span></button>
</div>
    <div class="title">${t('give.fixed')}<button data-act="recur-add">${t('give.fixedAdd')}</button></div>
    ${fixedRows ? `<div class="card">${fixedRows}</div>` : ''}
    ${ranked.length ? `<div class="title">${t('give.who')}</div><div class="card stagger">${ranked.slice(0, 6).map(([k, v]) => `<div class="row"><span class="ico letter">${esc(k[0].toUpperCase())}</span><span class="m"><div class="t">${esc(k)}</div></span><span class="v">${money(v)}</span></div>`).join('')}</div>` : ''}`);
  animateRings($('s-give'));
}

function renderStats() {
  const c = ctx(), yr = String(ui.year), list = L().filter(e => dayOf(e).startsWith(yr)), y = totals(list, c);
  const months = Array.from({ length: 12 }, (_, m) => totals(list.filter(e => dayOf(e).slice(5, 7) === pad2(m + 1)), c));
  const top = Math.max(1, ...months.map(m => Math.max(m.due, m.given)));
  const thisYear = ui.year === new Date().getFullYear(), nowM = new Date().getMonth();
  const letter = i => new Date(2026, i, 1).toLocaleDateString(getLang(), { month: 'narrow' });
  const bars = months.map((m, i) => `<div class="col ${thisYear && i === nowM ? 'now' : ''}"><div class="bars"><i style="height:${Math.max(m.due ? 3 : 0, m.due / top * 100)}%;animation-delay:${i * 28}ms"></i><i class="b" style="height:${Math.max(m.given ? 3 : 0, m.given / top * 100)}%;animation-delay:${i * 28 + 60}ms"></i></div><small>${letter(i)}</small></div>`).join('');
  const kinds = Object.entries(y.kinds).sort((a, b) => b[1] - a[1]);
  const avg = y.pays ? Math.round(y.salary / y.pays) : 0;
  const left = thisYear ? paysLeftThisYear(C().schedule, today()) : 0;
  const projected = avg && left ? y.due + Math.round(avg * left * C().rate / 100) : 0;
  const tile = (name, value, text) => `<div class="tile"><span class="ico">${icon(name, 16)}</span><b>${value}</b><span>${text}</span></div>`;
  const tool = (act, name, label) => `<button class="row" data-act="${act}"><span class="ico">${icon(name, 19)}</span><span class="m"><div class="t">${label}</div></span><span class="chev">${icon('chevron', 16)}</span></button>`;
  $('s-stats').innerHTML = screen(t('tab.stats'), `
    <div class="head"><h1>${t('tab.stats')}</h1><div class="year"><button data-act="year" data-d="-1" aria-label="-1">${icon('left', 16)}</button><b>${yr}</b><button data-act="year" data-d="1" aria-label="+1">${icon('chevron', 16)}</button></div></div>
    <div class="tiles">${tile('case', moneyRound(y.income), t('stats.income'))}${tile('scale', moneyRound(y.due), t('stats.due'))}${tile('heart', moneyRound(y.given), t('stats.given'))}${tile('flag', moneyRound(Math.max(0, y.owed)), t('stats.left'))}</div>
    <div class="title">${t('stats.monthly')}</div>
    <div class="card pad"><div class="chart">${bars}</div><div class="legend"><span><i></i>${t('stats.legendDue')}</span><span><i class="b"></i>${t('stats.legendGiven')}</span></div></div>
    ${kinds.length > 1 ? `<div class="title">${t('stats.sources')}</div><div class="card pad"><div class="stack">${kinds.map(([k, v]) => `<i style="flex:${v};background:${catColor(k)}"></i>`).join('')}</div>${kinds.map(([k, v]) => `<div class="li flat"><span class="lbl"><i class="dot" style="background:${catColor(k)}"></i>${esc(catName(k))}</span><span class="val">${moneyRound(v)}</span></div>`).join('')}</div>` : ''}
    ${projected ? `<div class="gap2"></div><div class="card"><div class="row"><span class="ico">${icon('chart', 19)}</span><span class="m"><div class="t">${t('stats.estimate')}</div><div class="s">${t('stats.estimateSub', { n: left })}</div></span><span class="v">${money(projected)}</span></div></div>` : ''}
    <div class="title">${t('stats.tools')}</div>
    <div class="card">${tool('convert', 'swap', t('stats.convert'))}${tool('tool-check', 'scale', t('stats.check'))}${tool('tool-tax', 'doc', t('stats.close'))}${tool('tool-share', 'share', t('stats.share'))}</div>
    ${y.deductible ? `<p class="foot">${esc(t('stats.deductible', { y: yr, v: money(y.deductible) }))}</p>` : ''}`);
}

const RENDER = { home: renderHome, moves: renderMoves, give: renderGive, stats: renderStats };
const renderAll = () => { RENDER[ui.tab](); bindScroll(); };
let lastTop = 0;
function bindScroll() {
  const host = $(`s-${ui.tab}`), sc = host.querySelector('.scroll');
  if (!sc || sc.dataset.b) return;
  sc.dataset.b = 1;
  sc.addEventListener('scroll', () => {
    host.classList.toggle('scrolled', sc.scrollTop > 46);
    const y = sc.scrollTop;
    if (Math.abs(y - lastTop) > 8) { $('dock').classList.toggle('mini', y > lastTop && y > 60); lastTop = y; }
  }, { passive: true });
}
let lens;
function renderDock() {
  $('tabs').innerHTML = '<span class="lens" id="lens"></span>' + TABS.map(([k, label, ic]) =>
    `<span class="tab" data-tab="${k}">${icon(ic, 23)}<small>${t(label)}</small></span>`).join('');
  $('fab').innerHTML = icon('plus', 26, 2.4);
  $('fab').setAttribute('aria-label', t('a.add'));
  paintEye();
  const old = $('tabs').cloneNode(true);
  $('tabs').replaceWith(old); // drop listeners from a previous language
  lens = tabLens($('tabs'), $('lens'), TABS.length, i => setTab(TABS[i][0]));
}
function paintEye() {
  $('eyeBtn').innerHTML = icon(ui.masked ? 'eyeoff' : 'eye', 22);
  $('eyeBtn').setAttribute('aria-label', ui.masked ? t('a.eyeShow') : t('a.eyeHide'));
}
function setTab(name, instant) {
  const i = TABS.findIndex(x => x[0] === name);
  const changed = name !== ui.tab || instant;
  ui.tab = name;
  lens.set(i, instant);
  document.querySelectorAll('.tab').forEach((b, n) => b.classList.toggle('on', n === i));
  if (!changed) return;
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === `s-${name}`));
  if (name === 'moves') $('s-moves').innerHTML = '';
  $('dock').classList.remove('mini');
  haptic();
  renderAll();
}

function haptic() { try { $('haptic').click(); } catch (e) { /* unsupported */ } }
let toastTimer, undoTarget = null;
function toast(text, undoId, stay) {
  $('toastText').textContent = text;
  $('toastUndo').hidden = !undoId;
  $('toastUndo').textContent = t('toast.undo');
  undoTarget = undoId || null;
  $('toast').classList.add('on');
  clearTimeout(toastTimer);
  if (!stay) toastTimer = setTimeout(() => $('toast').classList.remove('on'), undoId ? 5000 : 2400);
}
function hud() {
  const h = document.createElement('div');
  h.className = 'hud glass';
  h.innerHTML = '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.500l4.600 4.600L19 7.500"/></svg>';
  document.body.append(h);
  setTimeout(() => h.remove(), 1050);
}
function countUp(el, to) {
  const t0 = performance.now(), dur = 620;
  const step = now => {
    const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(Math.round(to * e));
    if (k < 1 && !ui.masked) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

const stack = [];
function openSheet(render) {
  const dim = document.createElement('div'), el = document.createElement('div');
  dim.className = 'dim';
  el.className = 'sheet';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  $('sheets').append(dim, el);
  const sh = { dim, el, render };
  stack.push(sh);
  render(el);
  // The sheet grows out of the control that opened it, like glass morphing between shapes.
  const r = el.getBoundingClientRect(), p = ui.tap || { x: innerWidth / 2, y: innerHeight };
  el.style.transformOrigin = `${p.x - r.left}px ${p.y - r.top}px`;
  dim.addEventListener('click', closeSheet);
  bindDrag(sh);
  settle(() => { dim.classList.add('on'); el.classList.add('on'); });
  return sh;
}
function closeSheet() {
  const sh = stack.pop();
  if (!sh) return;
  sh.el.classList.remove('on');
  sh.dim.classList.remove('on');
  setTimeout(() => { sh.el.remove(); sh.dim.remove(); }, 420);
}
const topSheet = () => stack[stack.length - 1];
const rerender = () => { const sh = topSheet(); if (sh) sh.render(sh.el); };
function bindDrag(sh) {
  let y0 = null, dy = 0;
  sh.el.addEventListener('pointerdown', e => {
    if (!e.target.closest('.grab,.bar') || e.target.closest('button')) return;
    y0 = e.clientY; dy = 0;
    sh.el.classList.add('drag');
    sh.el.setPointerCapture(e.pointerId);
  });
  sh.el.addEventListener('pointermove', e => {
    if (y0 == null) return;
    dy = Math.max(0, e.clientY - y0);
    sh.el.style.transform = `translateY(${dy}px)`;
  });
  const end = () => {
    if (y0 == null) return;
    y0 = null;
    sh.el.classList.remove('drag');
    sh.el.style.transform = '';
    if (dy > 110) closeSheet();
  };
  sh.el.addEventListener('pointerup', end);
  sh.el.addEventListener('pointercancel', end);
}
const sheetBar = (title, ok, leftAct = 'close', leftIcon = 'x') => `<div class="grab"><i></i></div><div class="bar"><button class="circle gl" data-act="${leftAct}" aria-label="${t(leftAct === 'close' ? 'a.close' : 'a.back')}">${icon(leftIcon, 19, 2.2)}</button><h3>${esc(title)}</h3>${ok ? `<button class="circle ok gl" data-act="${ok}" aria-label="${t('a.save')}">${icon('check', 21, 2.6)}</button>` : '<span class="circle ghost"></span>'}</div>`;
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'];
const keypad = () => `<div class="pad-keys">${KEYS.map(k => `<button class="key gl" data-act="key" data-k="${k}" aria-label="${k === 'del' ? t('row.delete') : k}">${k === 'del' ? icon('del', 26) : k}</button>`).join('')}</div>`;

// K is whatever the keypad is typing into: an entry or the converter.
let K = null;
function pressKey(k) {
  let d = K.digits;
  if (k === 'del') d = d.slice(0, -1);
  else if (k === '.') { if (!d.includes('.')) d = `${d || '0'}.`; }
  else if (d.includes('.') ? d.split('.')[1].length < 2 : d.length < 10) d = d === '0' ? k : d + k;
  K.digits = d;
  K.paint(true);
}
function showDigits(el, digits, bump) {
  const [whole, frac] = digits.split('.');
  el.textContent = digits ? `${Number(whole || 0).toLocaleString('en-US')}${digits.includes('.') ? `.${frac}` : ''}` : '0';
  el.classList.toggle('empty-a', !digits);
  el.style.fontSize = el.textContent.length > 10 ? '38px' : '';
  if (bump) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
}

let D = null;
const TITLE = { income: 'entry.income', given: 'entry.given', start: 'entry.start', tax: 'entry.tax', check: 'entry.check', recur: 'entry.recur' };
function openEntry(mode, opts = {}) {
  D = { mode, kind: catsVisible()[0] ? catsVisible()[0].id : 'otro', kept: false, rate: C().rate, digits: '', to: '', note: '', date: today(), deductible: false, editId: null, cur: C().base, more: false, ...opts };
  D.paint = paintEntry;
  K = D;
  const canSwitch = (mode === 'income' || mode === 'given') && !D.editId;
  openSheet(el => {
    const names = [...new Set([...C().sites.map(s => s.name), ...sortNew(L()).filter(e => e.type === 'given' && e.to).map(e => e.to)])].slice(0, 6);
    const chips = D.mode === 'income' ? `<div class="chips">${catsVisible().map(k => `<button class="chip ${D.kind === k.id ? 'on' : ''}" data-act="kind" data-k="${esc(k.id)}">${esc(catName(k.id))}</button>`).join('')}</div>`
      : (D.mode === 'given' || D.mode === 'recur') && names.length ? `<div class="chips">${names.map(n => `<button class="chip ${D.to === n ? 'on' : ''}" data-act="pick-to" data-to="${esc(n)}">${esc(n)}</button>`).join('')}</div>` : '';
    const rows = [];
    const who = D.mode === 'given' || D.mode === 'recur';
    if (who) rows.push(`<label class="li"><span>${t('entry.who')}</span><input id="f-to" value="${esc(D.to)}" placeholder="${t('entry.name')}" autocomplete="off"></label>`);
    if (D.more && D.mode === 'income') rows.push(`<div class="li"><span>${t('entry.percent')}</span><div class="stepper"><button data-act="rate" data-d="-1" aria-label="-1">−</button><b id="f-rate">${D.rate}%</b><button data-act="rate" data-d="1" aria-label="+1">+</button></div></div>`, `<button class="li" data-act="kept"><span>${t('entry.kept')}</span><i class="switch ${D.kept ? 'on' : ''}"></i></button>`);
    if (D.more && D.mode === 'given') rows.push(`<button class="li" data-act="deductible"><span>${t('entry.deductible')}</span><i class="switch ${D.deductible ? 'on' : ''}"></i></button>`);
    if (D.mode !== 'check' && D.mode !== 'recur' && (D.more || D.mode === 'start' || D.mode === 'tax')) rows.push(`<label class="li"><span>${t('entry.date')}</span><input id="f-date" type="date" value="${D.date}"></label>`);
    if (D.more && (D.mode === 'income' || D.mode === 'given')) rows.push(`<label class="li"><span>${t('entry.note')}</span><input id="f-note" value="${esc(D.note)}" placeholder="${t('entry.optional')}" autocomplete="off"></label>`);
    const canMore = (D.mode === 'income' || D.mode === 'given') && !D.more;
    el.innerHTML = `${sheetBar(t(TITLE[D.mode]), D.mode === 'check' ? '' : 'save')}<div class="body">
      ${canSwitch ? `<div class="seg"><span class="lens" style="width:calc((100% - 6px) / 2);transform:translateX(${D.mode === 'given' ? 100 : 0}%)"></span><button class="${D.mode === 'income' ? 'on' : ''}" data-act="mode" data-m="income">${t('entry.income')}</button><button class="${D.mode === 'given' ? 'on' : ''}" data-act="mode" data-m="given">${t('entry.given')}</button></div>` : ''}
      ${chips}
      <div class="amount-wrap"><button class="pill gl" data-act="entry-cur">${esc(shortCode(D.cur))}${icon('down', 13, 2.6)}</button><div class="amount" id="amt">0</div><button class="pill icon gl" data-act="paste" aria-label="${t('entry.paste')}">${icon('paste', 17)}</button></div>
      <div class="hint" id="hint"></div>
      ${keypad()}
      ${rows.length ? `<div class="list">${rows.join('')}</div>` : ''}
      ${canMore ? `<button class="more" data-act="entry-more">${t('entry.more')}${icon('down', 14, 2.4)}</button>` : ''}
      ${D.mode === 'tax' ? `<p class="foot">${esc(t('hint.taxNote', { p: C().rate }))}</p>` : ''}
      ${D.editId ? `<div class="list"><button class="li danger" data-act="delete" data-id="${esc(D.editId)}">${t('entry.delete')}</button></div>` : ''}
    </div>`;
    paintEntry();
  });
}
function keepFields() {
  if ($('f-to')) D.to = $('f-to').value;
  if ($('f-note')) D.note = $('f-note').value;
  if ($('f-date')) D.date = $('f-date').value || D.date;
}
function rerenderEntry() { keepFields(); rerender(); }
const entryBaseCents = () => {
  const v = convert(Number(D.digits || 0), D.cur, C().base, S.rates.map);
  return v == null ? null : cents(v);
};
function paintEntry(bump) {
  const a = $('amt'), h = $('hint');
  if (!a) return;
  showDigits(a, D.digits, bump);
  const c = entryBaseCents(), has = !!D.digits && Number(D.digits) > 0, foreign = D.cur !== C().base;
  const owed = totals(L(), ctx()).owed;
  if (has && c == null) { h.textContent = t('entry.noRates'); return; }
  if (D.mode === 'income') {
    const due = D.kept ? c : Math.round(c * D.rate / 100);
    h.textContent = !has ? (D.kept ? t('hint.kept') : t('hint.percent', { p: D.rate }))
      : D.kept ? t('hint.keptEq', { v: fmt(Math.round(c * 100 / D.rate)) })
        : foreign ? t('hint.dueEq', { b: fmt(c), v: fmt(due) }) : t('hint.due', { v: fmt(due) });
  }
  if (D.mode === 'given') {
    const left = owed - c;
    h.textContent = !has ? (ui.masked ? t('hint.howMuch') : t('hint.owe', { v: fmt(Math.max(0, owed)) })) : left >= 0 ? t('hint.left', { v: fmt(left) }) : t('hint.extra', { v: fmt(-left) });
  }
  if (D.mode === 'tax') h.textContent = has ? t('hint.tax', { v: fmt(Math.round(c * C().rate / 100)) }) : t('hint.taxEmpty');
  if (D.mode === 'start') h.textContent = t('hint.start');
  if (D.mode === 'recur') h.textContent = t('hint.recur');
  if (D.mode === 'check') {
    const diff = c - Math.max(0, owed);
    h.textContent = !has ? t('hint.checkEmpty') : diff === 0 ? t('hint.checkOk') : diff < 0 ? t('hint.checkLow', { v: fmt(-diff) }) : t('hint.checkHigh', { v: fmt(diff) });
  }
}
function saveEntry() {
  keepFields();
  const amount = Number(D.digits || 0), base = entryBaseCents();
  const shake = () => { const a = $('amt'); a.classList.remove('shake'); void a.offsetWidth; a.classList.add('shake'); };
  if (!(amount > 0) || base == null) { shake(); return; }
  const e = { id: newId(D.mode), ts: Date.now(), type: D.mode, amount, cur: D.cur, base: C().base, baseAmount: base / 100, date: D.date };
  if (D.mode === 'income') { e.kind = D.kind; e.rate = D.rate; if (D.kept) e.kept = true; }
  if (D.mode === 'tax') e.rate = C().rate;
  if (D.mode === 'given' || D.mode === 'recur') {
    e.to = D.to.trim();
    if (D.mode === 'recur' && !e.to) { $('f-to').focus(); return; }
    if (D.deductible) e.deductible = true;
  }
  if (D.note.trim()) e.note = D.note.trim();
  if (D.editId) S.events.push({ id: newId('void'), ts: Date.now(), type: 'void', target: D.editId });
  S.events.push(e);
  save();
  closeSheet();
  haptic();
  hud();
  renderAll();
  if (!D.editId) setTimeout(() => toast(e.type === 'income' ? t('toast.added', { v: fmt(dueOf(e, ctx())) }) : e.type === 'given' ? t('toast.logged', { v: fmt(base) }) : t('toast.saved'), e.id), 900);
  sync();
}
function voidEvent(id) {
  S.events.push({ id: newId('void'), ts: Date.now(), type: 'void', target: id });
  save();
  renderAll();
  sync();
}
function openDetail(id) {
  const e = live(S.events).find(x => x.id === id);
  if (!e) return;
  openEntry(e.type, { editId: id, kind: e.kind || 'otro', kept: !!e.kept, rate: rateOf(e, ctx()), digits: String(e.amount), to: e.to || '', note: e.note || '', date: dayOf(e), deductible: !!e.deductible, cur: e.cur || 'USD', more: true });
}
async function pasteAmount() {
  try {
    const n = parseAmount(await navigator.clipboard.readText());
    if (!n) { toast(t('entry.pasteFail')); return; }
    K.digits = String(n);
    haptic();
    K.paint(true);
  } catch (e) { toast(t('entry.pasteFail')); }
}

function pickCurrency(current, done) {
  let q = '';
  openSheet(el => {
    el.innerHTML = `${sheetBar(t('cur.pick'))}<div class="body"><label class="search">${icon('search', 18)}<input id="curq" type="search" placeholder="${t('cur.search')}" autocomplete="off"></label><div class="list" id="curList"></div></div>`;
    const paint = () => {
      const all = [...new Set([...COMMON, ...Object.keys(S.rates.map).sort()])];
      const hits = all.filter(c => !q || `${c} ${currencyName(c, getLang(), t)}`.toLowerCase().includes(q)).slice(0, q ? 40 : COMMON.length);
      $('curList').innerHTML = hits.map(c => `<button class="li" data-act="cur-pick" data-c="${esc(c)}"><span class="lbl"><b class="code">${esc(shortCode(c))}</b>${esc(currencyName(c, getLang(), t))}</span>${c === current ? `<span class="chk">${icon('check', 18, 2.6)}</span>` : ''}</button>`).join('');
    };
    paint();
    $('curq').addEventListener('input', ev => { q = ev.target.value.trim().toLowerCase(); paint(); });
  });
  ui.curDone = code => { closeSheet(); done(code); };
}

let X = null;
function openConverter(amountCents) {
  X = { digits: amountCents ? String(amountCents / 100) : '', from: C().base, to: C().base === 'USD' ? 'EUR' : 'USD', paint: paintConverter };
  K = X;
  openSheet(el => {
    el.innerHTML = `${sheetBar(t('conv.title'))}<div class="body">
      <div class="conv"><button class="pill gl" data-act="conv-cur" data-side="from">${esc(shortCode(X.from))}${icon('down', 13, 2.6)}</button><div class="amount" id="amt">0</div><button class="pill icon gl" data-act="paste" aria-label="${t('entry.paste')}">${icon('paste', 17)}</button></div>
      <div class="conv-mid"><i></i><button class="circle gl" data-act="conv-swap" aria-label="swap">${icon('swap', 18)}</button><i></i></div>
      <div class="conv"><button class="pill gl" data-act="conv-cur" data-side="to">${esc(shortCode(X.to))}${icon('down', 13, 2.6)}</button><div class="amount out" id="convOut">0</div><span class="pill icon ghost"></span></div>
      <div class="hint" id="hint"></div>${keypad()}</div>`;
    paintConverter();
  });
}
function paintConverter(bump) {
  showDigits($('amt'), X.digits, bump);
  const n = Number(X.digits || 0), out = convert(n, X.from, X.to, S.rates.map), one = convert(1, X.from, X.to, S.rates.map);
  $('convOut').textContent = out == null ? '—' : fmt(cents(out), X.to);
  $('hint').textContent = one == null ? t('conv.offline') : `${t('conv.rate', { a: shortCode(X.from), b: fmt(cents(one) || 1, X.to) })}${S.rates.at ? ` · ${t('conv.updated', { d: new Date(S.rates.at).toLocaleDateString(getLang(), { day: 'numeric', month: 'short' }) })}` : ''}`;
}

const navRow = (page, ic, label, value = '') => `<button class="li nav" data-act="sp" data-p="${page}"><span class="lbl"><span class="ico sm">${icon(ic, 16)}</span>${label}</span><span class="val">${esc(value)}</span><span class="chev">${icon('chevron', 15)}</span></button>`;
const toggle = (act, label, on) => `<button class="li" data-act="${act}"><span>${label}</span><i class="switch ${on ? 'on' : ''}"></i></button>`;
function settingsPage() {
  const c = C();
  const pages = {
    main: () => `<div class="list first">
        ${navRow('lang', 'globe', t('set.language'), c.lang === 'es' ? 'Español' : 'English')}
        <button class="li nav" data-act="set-base"><span class="lbl"><span class="ico sm">${icon('coin', 16)}</span>${t('set.currency')}</span><span class="val">${esc(shortCode(c.base))}</span><span class="chev">${icon('chevron', 15)}</span></button>
        <div class="li"><span class="lbl"><span class="ico sm">${icon('scale', 16)}</span>${t('set.percent')}</span><div class="stepper"><button data-act="set-rate" data-d="-1" aria-label="-1">−</button><b id="set-rate">${c.rate}%</b><button data-act="set-rate" data-d="1" aria-label="+1">+</button></div></div>
      </div>
      <div class="list">${navRow('look', 'palette', t('set.look'))}${navRow('pay', 'calendar', t('set.pay'), t(`freq.${c.schedule.freq}`))}${navRow('cats', 'tag', t('set.cats'))}</div>
      <div class="list">${navRow('sync', 'cloud', t('set.sync'))}${VAPID_PUBLIC_KEY ? navRow('notify', 'bell', t('set.notify')) : ''}${navRow('extras', 'sparkle', t('set.extras'))}${navRow('about', 'info', t('set.about'))}</div>`,
    lang: () => `<div class="list first">${[['en', 'English'], ['es', 'Español']].map(([k, v]) => `<button class="li" data-act="set-lang" data-l="${k}"><span>${v}</span>${c.lang === k ? `<span class="chk">${icon('check', 18, 2.6)}</span>` : ''}</button>`).join('')}</div>`,
    look: () => `<div class="head2 first">${t('set.accent')}</div><div class="list pad swatches">${SWATCHES.map(h => `<button class="sw ${c.accent.toLowerCase() === h.toLowerCase() ? 'on' : ''}" style="background:${h}" data-act="set-accent" data-c="${h}" aria-label="${h}"></button>`).join('')}<label class="sw custom" aria-label="${t('set.custom')}"><input id="set-color" type="color" value="${esc(c.accent)}"></label></div>
      <div class="list"><div class="li"><span>${t('set.hand')}</span><div class="seg small"><span class="lens" style="width:calc((100% - 6px) / 2);transform:translateX(${c.hand === 'right' ? 100 : 0}%)"></span><button class="${c.hand !== 'right' ? 'on' : ''}" data-act="set-hand" data-h="left">${t('set.handLeft')}</button><button class="${c.hand === 'right' ? 'on' : ''}" data-act="set-hand" data-h="right">${t('set.handRight')}</button></div></div>${toggle('set-hide', t('set.hide'), c.hideOnOpen !== false)}</div>
      <div class="head2">${t('set.icon')}</div><div class="list pad iconbox"><img id="iconPreview" alt="" width="72" height="72"><a class="pill gl" target="_blank" rel="noopener" href="./?icon=${encodeURIComponent(c.accent.slice(1))}">${t('set.iconOpen')}</a></div><p class="foot">${t('set.iconNote')}</p>`,
    pay: () => `<div class="list first"><label class="li"><span>${t('set.freq')}</span><select id="set-freq">${SCHEDULES.map(f => `<option value="${f}" ${c.schedule.freq === f ? 'selected' : ''}>${t(`freq.${f}`)}</option>`).join('')}</select></label>
      ${['weekly', 'biweekly', 'monthly'].includes(c.schedule.freq) ? `<label class="li"><span>${t('set.anchor')}</span><input id="set-anchor" type="date" value="${esc(c.schedule.anchor)}"></label>` : ''}</div>
      <div class="list"><label class="li"><span>${t('set.goal')}</span><input id="set-goal" inputmode="decimal" placeholder="${t('set.noGoal')}" value="${c.goal || ''}" autocomplete="off"></label><button class="li" data-act="set-start"><span>${t('set.start')}</span><span class="chev">${icon('chevron', 15)}</span></button></div>`,
    cats: () => `<div class="list first">${catsVisible().map(k => `<button class="li" data-act="cat-edit" data-id="${esc(k.id)}"><span class="lbl"><i class="dot" style="background:${catColor(k.id)}"></i>${esc(catName(k.id))}</span><span class="chev">${icon('chevron', 15)}</span></button>`).join('')}<button class="li btn" data-act="cat-new">${t('set.addCat')}</button></div>`,
    sync: () => { const st = syncLabel(); return `<div class="list first"><label class="li"><span>${t('set.token')}</span><input id="set-token" class="tok" value="${esc(S.token)}" placeholder="${t('set.tokenHint')}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></label>
        <label class="li"><span>${t('set.repo')}</span><input id="set-repo" value="${esc(S.repo)}" placeholder="owner/maaser-data" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></label>
        <button class="li btn" data-act="paste-token">${t('set.connect')}</button><button class="li btn" data-act="sync-now">${t('set.syncNow')}</button>
        <div class="li"><span>${t('set.status')}</span><span class="status ${st.cls}" id="set-status"><i></i><span>${esc(st.text)}</span></span></div></div>
      <p class="foot">${t('set.syncNote')}</p>
      <div class="list"><button class="li btn" data-act="export">${t('set.export')}</button><label class="li btn">${t('set.import')}<input id="importFile" type="file" accept="application/json,.json" hidden></label></div>`; },
    notify: () => `<div class="list first">${toggle('notify-toggle', t('set.notifyOn'), c.notify)}</div><p class="foot">${t('set.notifyNote')}</p>`,
    extras: () => `<div class="list first">${toggle('set-hebrew', t('set.hebrew'), c.hebrewDate)}${toggle('set-friday', t('set.friday'), c.fridayNote)}</div>`,
    about: () => `<div class="list first"><a class="li" href="${SOURCE_URL}" target="_blank" rel="noopener"><span>${t('set.source')}</span><span class="chev">${icon('chevron', 15)}</span></a><div class="li"><span>${t('set.version')}</span><span class="val">${VERSION}</span></div></div>`,
  };
  return pages[ui.sp]();
}
const SP_TITLE = { main: 'set.title', lang: 'set.language', look: 'set.look', pay: 'set.pay', cats: 'set.cats', sync: 'set.sync', notify: 'set.notify', extras: 'set.extras', about: 'set.about' };
function openSettings() {
  ui.sp = 'main';
  openSheet(el => {
    const sub = ui.sp !== 'main';
    el.innerHTML = `${sheetBar(t(SP_TITLE[ui.sp]), '', sub ? 'sp-back' : 'close', sub ? 'left' : 'x')}<div class="body page">${settingsPage()}</div>`;
    const img = $('iconPreview');
    if (img) img.src = drawIcon(C().accent, 144);
  });
}
function syncLabel() {
  if (ui.syncState === 'busy') return { cls: '', text: t('sync.busy') };
  if (ui.syncState === 'bad') return { cls: 'bad', text: ui.syncError };
  if (!S.token) return { cls: '', text: t('sync.none') };
  if (S.lastSync) return { cls: 'ok', text: new Date(S.lastSync).toLocaleString(getLang(), { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) };
  return { cls: '', text: t('sync.never') };
}
function paintSync() {
  const st = syncLabel(), box = $('set-status');
  if (!box) return;
  box.className = `status ${st.cls}`;
  box.lastElementChild.textContent = st.text;
}

function openSiteEditor(site) {
  const s = site ? { ...site } : { id: newId('site'), name: '', url: '', color: PALETTE[C().sites.length % PALETTE.length], mark: '', logo: true };
  const isNew = !site;
  openSheet(el => {
    el.innerHTML = `${sheetBar(t(isNew ? 'set.newSite' : 'set.editSite'), 'site-save')}<div class="body">
      <div class="preview-site" id="sitePrev"></div>
      <div class="list"><label class="li"><span>${t('set.siteName')}</span><input id="s-name" value="${esc(s.name)}" autocomplete="off"></label>
      <label class="li"><span>${t('set.siteLink')}</span><input id="s-url" value="${esc(s.url)}" inputmode="url" placeholder="example.org/donate" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></label>
      <label class="li"><span>${t('set.siteMark')}</span><input id="s-mark" value="${esc(s.mark)}" maxlength="3" autocomplete="off"></label></div>
      <div class="head2">${t('set.color')}</div><div class="list pad swatches">${PALETTE.map(h => `<button class="sw" style="background:${h}" data-act="site-color" data-c="${h}" aria-label="${h}"></button>`).join('')}<label class="sw custom"><input id="s-color" type="color" value="${esc(s.color)}"></label></div>
      ${isNew ? '' : `<div class="list"><button class="li danger" data-act="site-remove">${t('set.remove')}</button></div>`}</div>`;
    const paint = () => {
      s.name = $('s-name').value; s.url = $('s-url').value; s.mark = $('s-mark').value.trim();
      $('sitePrev').innerHTML = siteTile({ ...s, name: s.name || '…' });
      document.querySelectorAll('.sw[data-act=site-color]').forEach(b => b.classList.toggle('on', b.dataset.c === s.color));
    };
    el.addEventListener('input', ev => { if (ev.target.id === 's-color') s.color = ev.target.value; paint(); });
    paint();
    ui.site = { s, isNew, paint };
  });
}
function openCatEditor(cat) {
  const k = cat ? { ...cat, name: cat.name || catName(cat.id) } : { id: newId('cat'), name: '', color: PALETTE[C().cats.length % PALETTE.length] };
  const isNew = !cat;
  openSheet(el => {
    el.innerHTML = `${sheetBar(t(isNew ? 'set.newCat' : 'set.editCat'), 'cat-save')}<div class="body"><div class="list first"><label class="li"><span>${t('set.catName')}</span><input id="c-name" value="${esc(k.name)}" autocomplete="off"></label></div>
      <div class="head2">${t('set.color')}</div><div class="list pad swatches">${PALETTE.map(h => `<button class="sw ${catColorOf(k) === h ? 'on' : ''}" style="background:${h}" data-act="cat-color" data-c="${h}" aria-label="${h}"></button>`).join('')}</div>
      ${isNew || catsVisible().length < 2 ? '' : `<div class="list"><button class="li danger" data-act="cat-remove">${t('set.remove')}</button></div>`}</div>`;
    ui.cat = { k, isNew };
  });
}
const catColorOf = k => k.color || catColor(k.id);

function openWelcome() {
  openSheet(el => {
    const c = C();
    el.innerHTML = `<div class="body welcome"><img src="assets/icon-180.png" alt="" width="84" height="84"><h2>${t('hello.title')}</h2><p>${t('hello.sub')}</p>
      <div class="list"><div class="li"><span>${t('set.language')}</span><div class="seg small"><span class="lens" style="width:calc((100% - 6px) / 2);transform:translateX(${c.lang === 'es' ? 100 : 0}%)"></span><button class="${c.lang === 'en' ? 'on' : ''}" data-act="set-lang" data-l="en">English</button><button class="${c.lang === 'es' ? 'on' : ''}" data-act="set-lang" data-l="es">Español</button></div></div>
      <button class="li" data-act="set-base"><span>${t('set.currency')}</span><span class="val">${esc(shortCode(c.base))}</span></button>
      <div class="li"><span>${t('set.percent')}</span><div class="stepper"><button data-act="set-rate" data-d="-1" aria-label="-1">−</button><b id="set-rate">${c.rate}%</b><button data-act="set-rate" data-d="1" aria-label="+1">+</button></div></div></div>
      <button class="cta gl" data-act="hello-done">${t('hello.go')}</button></div>`;
  });
}

// Draws the app icon in any color: a ring of ten with one lit, around the letter yud, whose value is ten.
function drawIcon(hex, size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d'), s = size;
  const grad = g.createLinearGradient(s * 0.15, 0, s * 0.85, s);
  const mix = (a, b, k) => `#${[1, 3, 5].map(i => Math.round(parseInt(a.substr(i, 2), 16) * (1 - k) + parseInt(b.substr(i, 2), 16) * k).toString(16).padStart(2, '0')).join('')}`;
  grad.addColorStop(0, mix(hex, '#FFFFFF', 0.12));
  grad.addColorStop(0.55, mix(hex, '#000000', 0.38));
  grad.addColorStop(1, mix(hex, '#000000', 0.74));
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  g.lineCap = 'round';
  g.lineWidth = s * 0.078;
  const gap = Math.PI * 2 / 10 * 0.2;
  for (let i = 0; i < 10; i++) {
    const mid = -Math.PI / 2 + i * Math.PI * 2 / 10;
    g.beginPath();
    g.arc(s / 2, s / 2, s * 0.335, mid - Math.PI / 10 + gap, mid + Math.PI / 10 - gap);
    g.strokeStyle = i ? 'rgba(255,255,255,.24)' : '#fff';
    g.shadowBlur = i ? 0 : s * 0.06;
    g.shadowColor = 'rgba(255,255,255,.9)';
    g.stroke();
  }
  g.shadowBlur = s * 0.03;
  g.shadowColor = 'rgba(0,0,0,.45)';
  g.fillStyle = '#fff';
  g.font = `bold ${s * 0.88}px "Times New Roman", serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('י', s / 2, s / 2);
  return c.toDataURL('image/png');
}

let syncing = false;
function syncFailed(err) {
  const known = { token: 'sync.token', permission: 'sync.permission', repo: 'sync.repo' };
  return known[err.message] ? t(known[err.message]) : t('sync.offline');
}
async function sync(manual) {
  if (!S.token || syncing) { paintSync(); return; }
  syncing = true;
  ui.syncState = 'busy';
  paintSync();
  try {
    if (!S.repo) { S.repo = `${await whoAmI(S.token)}/maaser-data`; const r = $('set-repo'); if (r) r.value = S.repo; save(); }
    const api = client(S.token, S.repo);
    const added = await syncEvents(api, S.events, (e, id) => {
      e.id = id;
      e.ts = e.ts || Number(id.split('-')[0].slice(0, 13)) || Date.now();
      if (e.type !== 'void') {
        e.amount = Number(String(e.amount).replace(',', '.'));
        if (!(e.amount > 0)) return false;
      }
      if (e.type === 'income') e.kind = normalizeKind(e.kind, C().cats, KIND_LABELS);
      S.events.push(e);
      return true;
    });
    const remote = await syncSettings(api, C());
    if (remote) { S.cfg = { ...defaultConfig(C().lang), ...remote }; setLang(C().lang); applyTheme(); renderDock(); lens.set(TABS.findIndex(x => x[0] === ui.tab), true); }
    S.lastSync = new Date().toISOString();
    ui.syncState = '';
    save();
    if (added || remote) renderAll();
    if (manual) { haptic(); toast(t('toast.synced')); }
  } catch (err) {
    ui.syncState = 'bad';
    ui.syncError = syncFailed(err);
    if (manual) toast(ui.syncError);
  } finally {
    syncing = false;
    paintSync();
  }
}
async function loadRates(force) {
  const stale = Date.now() - (S.rates.at || 0) > 3600e3;
  if (!force && !stale) return;
  try {
    const map = await fetchRates(S.rates.map);
    if (Object.keys(map).length > 1) { S.rates = { map, at: Date.now() }; save(); if (K && K.paint && stack.length) K.paint(); }
  } catch (e) { /* keep the last known rates */ }
}

const b64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), c => c.charCodeAt(0));
async function toggleNotify(btn) {
  if (C().notify) { C().notify = false; touchCfg(); btn.querySelector('.switch').classList.remove('on'); return; }
  if (!S.token) { toast(t('set.notifyToken')); return; }
  if (!('PushManager' in window) || !navigator.serviceWorker) { toast(t('set.notifyInstall')); return; }
  if (await Notification.requestPermission() !== 'granted') { toast(t('set.notifyDenied')); return; }
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64url(VAPID_PUBLIC_KEY) });
    const api = client(S.token, S.repo), old = await api.read('push/subscription.json');
    await api.write('push/subscription.json', JSON.stringify(sub), old && old.sha);
    C().notify = true;
    touchCfg();
    btn.querySelector('.switch').classList.add('on');
    haptic();
  } catch (e) { toast(t('set.notifySetup')); }
}

function exportData() {
  const file = new File([JSON.stringify({ app: 'maaser', version: 2, cfg: C(), events: S.events }, null, 2)], `maaser-${today()}.json`, { type: 'application/json' });
  shareFile(file);
}
function shareFile(file, text) {
  if (navigator.canShare && navigator.canShare({ files: [file] })) navigator.share({ text, files: [file] }).catch(() => {});
  else { const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; a.click(); }
}
async function importData(file) {
  try {
    const d = JSON.parse(await file.text());
    if (d.app !== 'maaser' || !Array.isArray(d.events)) throw new Error('bad');
    const mine = new Set(S.events.map(e => e.id)), fresh = d.events.filter(e => !mine.has(e.id));
    S.events.push(...fresh);
    if (d.cfg) S.cfg = { ...C(), ...d.cfg, updatedAt: Date.now() };
    save(); setLang(C().lang); applyTheme(); renderAll(); rerender(); sync();
    toast(t('set.imported', { n: fresh.length }));
  } catch (e) { toast(t('set.importBad')); }
}
function shareYear() {
  const c = ctx(), yr = String(ui.year), list = sortNew(L().filter(e => dayOf(e).startsWith(yr))), y = totals(list, c);
  const text = `Maaser ${yr}\n${t('stats.income')}: ${fmt(y.income)}\n${t('stats.due')}: ${fmt(y.due)}\n${t('stats.given')}: ${fmt(y.given)}\n${t('stats.left')}: ${fmt(Math.max(0, y.owed))}`;
  const q = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const csv = ['date,type,detail,amount,currency,value,owed,note'].concat(list.map(e =>
    [dayOf(e), e.type, e.to || (e.kind ? catName(e.kind) : ''), e.amount, e.cur || 'USD', baseValue(e, c) / 100, e.type === 'income' ? dueOf(e, c) / 100 : '', e.note || ''].map(q).join(','))).join('\n');
  shareFile(new File([csv], `maaser-${yr}.csv`, { type: 'text/csv' }), text);
}

const ACTIONS = {
  tab: el => setTab(el.dataset.tab),
  add: el => openEntry('income', el.dataset.kind ? { kind: el.dataset.kind } : {}),
  give: el => openEntry('given', el.dataset.to ? { to: el.dataset.to } : {}),
  close: closeSheet,
  save: saveEntry,
  key: el => pressKey(el.dataset.k),
  paste: pasteAmount,
  kind: el => { D.kind = el.dataset.k; rerenderEntry(); },
  'pick-to': el => { keepFields(); D.to = el.dataset.to; rerenderEntry(); },
  mode: el => { keepFields(); if (D.mode !== el.dataset.m) { D.mode = el.dataset.m; rerender(); } },
  rate: el => { D.rate = Math.max(1, Math.min(100, D.rate + Number(el.dataset.d))); $('f-rate').textContent = `${D.rate}%`; paintEntry(); },
  kept: () => { D.kept = !D.kept; rerenderEntry(); },
  deductible: () => { D.deductible = !D.deductible; rerenderEntry(); },
  'entry-more': () => { D.more = true; rerenderEntry(); },
  'entry-cur': () => { keepFields(); pickCurrency(D.cur, c => { D.cur = c; K = D; rerender(); }); },
  detail: el => { if (!swiped) openDetail(el.dataset.id); },
  delete: el => { if (stack.length) closeSheet(); voidEvent(el.dataset.id); toast(t('toast.deleted')); },
  undo: () => { if (undoTarget) voidEvent(undoTarget); $('toast').classList.remove('on'); },
  eye: () => {
    ui.masked = !ui.masked;
    haptic();
    paintEye();
    renderAll();
    const el = $('owed');
    if (!ui.masked && ui.tab === 'home' && el) { el.classList.add('pop'); countUp(el, Math.abs(totals(L(), ctx()).owed)); }
  },
  filter: el => { ui.filter = el.dataset.f; renderMoves(); },
  settings: openSettings,
  year: el => { ui.year += Number(el.dataset.d); renderStats(); },
  convert: () => openConverter(0),
  'convert-owed': () => openConverter(ui.masked ? 0 : Math.max(0, totals(L(), ctx()).owed)),
  'conv-swap': () => { [X.from, X.to] = [X.to, X.from]; rerender(); haptic(); },
  'conv-cur': el => { const side = el.dataset.side; pickCurrency(X[side], c => { X[side] = c; K = X; rerender(); }); },
  'cur-pick': el => ui.curDone(el.dataset.c),
  'tool-check': () => openEntry('check'),
  'tool-tax': () => openEntry('tax'),
  'tool-share': shareYear,
  'recur-add': () => openEntry('recur'),
  'recur-pay': el => {
    const r = recurring(S.events).find(x => x.id === el.dataset.id);
    if (!r) return;
    S.events.push({ id: newId('given'), ts: Date.now(), type: 'given', amount: r.amount, cur: r.cur, base: r.base, baseAmount: r.baseAmount, to: r.to, date: today() });
    save(); haptic(); hud(); renderAll(); sync();
  },
  'recur-remove': el => { voidEvent(el.dataset.id); toast(t('give.fixedRemoved')); },
  site: el => {
    const s = C().sites.find(x => x.id === el.dataset.id);
    if (!s) return;
    if (ui.editSites) { openSiteEditor(s); return; }
    if (s.url) window.open(normalizeUrl(s.url), '_blank', 'noopener');
    openEntry('given', { to: s.name });
  },
  'sites-edit': () => { ui.editSites = !ui.editSites; renderGive(); },
  'site-new': () => openSiteEditor(null),
  'site-color': el => { ui.site.s.color = el.dataset.c; ui.site.paint(); },
  'site-save': () => {
    const { s, isNew } = ui.site;
    if (!s.name.trim()) { $('s-name').focus(); return; }
    s.name = s.name.trim(); s.url = s.url.trim();
    C().sites = isNew ? [...C().sites, s] : C().sites.map(x => (x.id === s.id ? s : x));
    touchCfg(); closeSheet(); haptic(); renderAll();
  },
  'site-remove': () => { C().sites = C().sites.filter(x => x.id !== ui.site.s.id); touchCfg(); closeSheet(); renderAll(); },
  'cat-new': () => openCatEditor(null),
  'cat-edit': el => openCatEditor(C().cats.find(x => x.id === el.dataset.id)),
  'cat-color': el => { ui.cat.k.color = el.dataset.c; document.querySelectorAll('.sw[data-act=cat-color]').forEach(b => b.classList.toggle('on', b === el)); },
  'cat-save': () => {
    const { k, isNew } = ui.cat, name = $('c-name').value.trim();
    if (!name) { $('c-name').focus(); return; }
    k.name = name;
    C().cats = isNew ? [...C().cats, k] : C().cats.map(x => (x.id === k.id ? k : x));
    touchCfg(); closeSheet(); rerender(); renderAll();
  },
  'cat-remove': () => { C().cats = C().cats.map(x => (x.id === ui.cat.k.id ? { ...x, hidden: true } : x)); touchCfg(); closeSheet(); rerender(); renderAll(); },
  sp: el => { ui.sp = el.dataset.p; rerender(); },
  'sp-back': () => { ui.sp = 'main'; rerender(); },
  'set-lang': el => { C().lang = el.dataset.l; setLang(C().lang); touchCfg(); renderDock(); lens.set(TABS.findIndex(x => x[0] === ui.tab), true); document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === ui.tab)); $('s-moves').innerHTML = ''; renderAll(); rerender(); },
  'set-base': () => pickCurrency(C().base, c => { C().base = c; touchCfg(); renderAll(); rerender(); }),
  'set-rate': el => { C().rate = Math.max(1, Math.min(100, C().rate + Number(el.dataset.d))); $('set-rate').textContent = `${C().rate}%`; touchCfg(); renderAll(); },
  'set-accent': el => { C().accent = el.dataset.c; touchCfg(); applyTheme(); haptic(); rerender(); },
  'set-hand': el => { C().hand = el.dataset.h; touchCfg(); applyTheme(); rerender(); },
  'set-hide': el => { C().hideOnOpen = C().hideOnOpen === false; el.querySelector('.switch').classList.toggle('on', C().hideOnOpen); touchCfg(); },
  'set-hebrew': el => { C().hebrewDate = !C().hebrewDate; el.querySelector('.switch').classList.toggle('on', C().hebrewDate); touchCfg(); renderAll(); },
  'set-friday': el => { C().fridayNote = !C().fridayNote; el.querySelector('.switch').classList.toggle('on', C().fridayNote); touchCfg(); renderAll(); },
  'set-start': () => openEntry('start'),
  'paste-token': async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text) { $('set-token').value = text; S.token = text; save(); }
    } catch (e) { toast(t('toast.pasteField')); return; }
    sync(true);
  },
  'sync-now': () => { S.token = $('set-token').value.trim(); S.repo = $('set-repo').value.trim(); save(); sync(true); },
  export: exportData,
  'notify-toggle': toggleNotify,
  'hello-done': () => { C().setup = true; touchCfg(); closeSheet(); renderAll(); },
};
document.addEventListener('pointerdown', e => { ui.tap = { x: e.clientX, y: e.clientY }; }, { passive: true, capture: true });
document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-act]');
  if (el && ACTIONS[el.dataset.act]) ACTIONS[el.dataset.act](el);
});
document.addEventListener('input', ev => {
  const { id, value } = ev.target;
  if (id === 'q') { ui.q = value; renderMoves(); }
  // Saved on every keystroke: on iPhone, tapping a button does not blur the field, so "change" never fires.
  if (id === 'set-token') { S.token = value.trim(); ui.syncState = ''; save(); paintSync(); }
  if (id === 'set-repo') { S.repo = value.trim(); save(); }
  if (id === 'set-goal') { C().goal = parseAmount(value); touchCfg(); }
  if (id === 'set-anchor' && value) { C().schedule.anchor = value; touchCfg(); renderAll(); }
  if (id === 'set-color') { C().accent = value; touchCfg(); applyTheme(); const img = $('iconPreview'); if (img) img.src = drawIcon(value, 144); }
});
document.addEventListener('change', ev => {
  if (ev.target.id === 'set-freq') { C().schedule.freq = ev.target.value; if (!C().schedule.anchor) C().schedule.anchor = today(); touchCfg(); rerender(); renderAll(); }
  if (ev.target.id === 'importFile' && ev.target.files[0]) importData(ev.target.files[0]);
});

let swiped = false, sw = null;
document.addEventListener('pointerdown', e => {
  const row = e.target.closest('.swipe .row');
  document.querySelectorAll('.swipe .row.open').forEach(r => { if (r !== row) { r.classList.remove('open'); r.style.transform = ''; } });
  swiped = false;
  if (row) sw = { row, x: e.clientX, y: e.clientY, dx: 0, base: row.classList.contains('open') ? -88 : 0, on: false };
});
document.addEventListener('pointermove', e => {
  if (!sw) return;
  const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
  if (!sw.on) {
    if (Math.abs(dy) > 10) { sw = null; return; }
    if (Math.abs(dx) < 10) return;
    sw.on = true;
    sw.row.style.transition = 'none';
  }
  sw.dx = dx;
  swiped = true;
  sw.row.style.transform = `translateX(${Math.max(-120, Math.min(0, sw.base + dx))}px)`;
});
const swipeEnd = () => {
  if (!sw) return;
  const { row, base, dx, on } = sw;
  sw = null;
  row.style.transition = '';
  if (!on) return;
  const open = base + dx < -44;
  row.classList.toggle('open', open);
  row.style.transform = open ? 'translateX(-88px)' : '';
  setTimeout(() => { swiped = false; }, 60);
};
document.addEventListener('pointerup', swipeEnd);
document.addEventListener('pointercancel', swipeEnd);

function openFromUrl() {
  const m = location.hash.match(/add=(\w+)/);
  if (m) {
    history.replaceState(null, '', location.pathname);
    if (m[1] === 'given') openEntry('given');
    else if (C().cats.some(c => c.id === m[1])) openEntry('income', { kind: m[1] });
  }
  const icon = new URLSearchParams(location.search).get('icon');
  if (/^[0-9a-f]{6}$/i.test(icon || '')) {
    document.querySelector('link[rel=apple-touch-icon]').href = drawIcon(`#${icon}`, 180);
    document.documentElement.style.setProperty('--accent', `#${icon}`);
    toast(t('set.iconBanner'), null, true);
  }
}
addEventListener('hashchange', openFromUrl);
addEventListener('resize', () => lens.resize());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (C().hideOnOpen !== false) { ui.masked = true; paintEye(); } return; }
  renderAll();
  sync();
  loadRates();
});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

touchLight();
applyTheme();
renderDock();
ui.tab = '';
setTab('home', true);
openFromUrl();
if (!C().setup) openWelcome();
sync();
loadRates();
if (location.hostname === 'localhost') window.__maaser = { S, ui, ACTIONS, K: () => K, totals: () => totals(L(), ctx()), stack, closeSheet, setTab };

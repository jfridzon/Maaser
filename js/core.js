// Pure logic: no DOM, no network. Everything here is covered by test/core.test.mjs.

export const BUILTIN_KINDS = ['sueldo', 'regalo', 'zelle', 'otro'];
export const SCHEDULES = ['none', 'weekly', 'biweekly', 'semimonthly', 'monthly'];

export function defaultConfig(lang = 'en') {
  return {
    setup: false, lang, base: 'USD', rate: 10, goal: 0,
    schedule: { freq: 'none', anchor: '' },
    accent: '#14B8A6', hand: 'left', hideOnOpen: true,
    hebrewDate: false, fridayNote: false, notify: false,
    cats: BUILTIN_KINDS.map(id => ({ id })), sites: [], updatedAt: 0,
  };
}

export const cents = v => Math.round(Number(v) * 100);

// Accepts what people actually copy: "$1,234.56", "1.234,56 Bs", "Bs. 12,5", "1200".
export function parseAmount(text) {
  const s = String(text == null ? '' : text).replace(/[^\d.,]/g, '');
  if (!/\d/.test(s)) return 0;
  const dot = s.lastIndexOf('.'), comma = s.lastIndexOf(',');
  let whole = s, frac = '';
  if (dot >= 0 && comma >= 0) {
    const at = Math.max(dot, comma);
    whole = s.slice(0, at); frac = s.slice(at + 1);
  } else if (dot >= 0 || comma >= 0) {
    const sep = dot >= 0 ? '.' : ',', parts = s.split(sep);
    const thousands = parts.length > 2 || (parts[1].length === 3 && parts[0].length <= 3 && parts[0] !== '0');
    if (!thousands) { whole = parts[0]; frac = parts[1]; }
  }
  const n = Number(`${whole.replace(/[.,]/g, '') || '0'}.${frac.replace(/[.,]/g, '') || '0'}`);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

// rates: units of each currency per 1 USD.
export function convert(amount, from, to, rates) {
  if (from === to) return amount;
  if (!rates || !rates[from] || !rates[to]) return null;
  return amount / rates[from] * rates[to];
}

// Events are immutable. Deleting writes a "void" event, so several devices never conflict.
export function live(events) {
  const voided = new Set(events.filter(e => e.type === 'void').map(e => e.target));
  return events.filter(e => e.type !== 'void' && !voided.has(e.id));
}
export const ledger = events => live(events).filter(e => e.type !== 'recur');
export const recurring = events => live(events).filter(e => e.type === 'recur');
export const dayOf = e => e.date || new Date(e.ts).toISOString().slice(0, 10);

// Value of an event in the main currency. Uses the conversion frozen at entry time when it can.
export function baseValue(e, ctx) {
  const from = e.base || e.cur || 'USD';
  const amount = e.baseAmount != null ? e.baseAmount : e.amount;
  if (from === ctx.base) return cents(amount);
  const v = convert(amount, from, ctx.base, ctx.rates);
  return cents(v == null ? amount : v);
}
export const rateOf = (e, ctx) => (e.rate == null ? ctx.rate : e.rate);
export const dueOf = (e, ctx) => (e.kept ? baseValue(e, ctx) : Math.round(baseValue(e, ctx) * rateOf(e, ctx) / 100));

export function totals(list, ctx) {
  const t = { income: 0, due: 0, given: 0, tax: 0, deductible: 0, pays: 0, salary: 0, kinds: {} };
  for (const e of list) {
    const v = baseValue(e, ctx);
    if (e.type === 'income') {
      const gross = e.kept ? Math.round(v * 100 / rateOf(e, ctx)) : v;
      t.income += gross;
      t.due += dueOf(e, ctx);
      t.kinds[e.kind] = (t.kinds[e.kind] || 0) + gross;
      if (e.kind === 'sueldo') { t.pays++; t.salary += gross; }
    }
    if (e.type === 'start') t.due += v;
    if (e.type === 'tax') { t.due -= Math.round(v * rateOf(e, ctx) / 100); t.tax += v; }
    if (e.type === 'given') { t.given += v; if (e.deductible) t.deductible += v; }
  }
  t.owed = t.due - t.given;
  return t;
}

const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const utc = s => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const addDays = (s, n) => iso(new Date(utc(s).getTime() + n * 864e5));
const daysBetween = (a, b) => Math.round((utc(b) - utc(a)) / 864e5);
const lastOfMonth = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

// Every payday in the month holding `day`.
function monthPays(schedule, y, m) {
  if (schedule.freq === 'semimonthly') return [iso(new Date(Date.UTC(y, m, 15))), iso(new Date(Date.UTC(y, m, lastOfMonth(y, m))))];
  const want = schedule.anchor ? utc(schedule.anchor).getUTCDate() : 1;
  return [iso(new Date(Date.UTC(y, m, Math.min(want, lastOfMonth(y, m)))))];
}

// Last payday on or before today, next payday on or after today.
export function payInfo(schedule, today) {
  if (!schedule || schedule.freq === 'none') return null;
  let last, next;
  if (schedule.freq === 'weekly' || schedule.freq === 'biweekly') {
    if (!schedule.anchor) return null;
    const step = schedule.freq === 'weekly' ? 7 : 14;
    const k = Math.floor(daysBetween(schedule.anchor, today) / step);
    last = addDays(schedule.anchor, k * step);
    next = last === today ? last : addDays(last, step);
  } else {
    const d = utc(today), y = d.getUTCFullYear(), m = d.getUTCMonth();
    const around = [...monthPays(schedule, y, m - 1), ...monthPays(schedule, y, m), ...monthPays(schedule, y, m + 1)];
    last = around.filter(p => p <= today).pop();
    next = around.find(p => p >= today);
  }
  const span = Math.max(1, daysBetween(last, next === last ? addDays(last, 1) : next));
  return { last, next, days: daysBetween(today, next), span };
}

export function paysLeftThisYear(schedule, today) {
  const year = today.slice(0, 4);
  let info = payInfo(schedule, today), n = 0;
  while (info && info.next.slice(0, 4) === year && n < 60) {
    n++;
    info = payInfo(schedule, addDays(info.next, 1));
  }
  return n;
}

// Shortcuts send the label they showed ("Regalo"); map it to a category id.
export function normalizeKind(kind, cats, labels) {
  if (!kind) return 'otro';
  const k = String(kind).trim().toLowerCase();
  const hit = cats.find(c => c.id === kind || (c.name || '').toLowerCase() === k);
  if (hit) return hit.id;
  for (const [id, names] of Object.entries(labels)) if (names.some(n => n.toLowerCase() === k)) return id;
  return 'otro';
}

export function siteHost(url) {
  try { return new URL(/^https?:/i.test(url) ? url : `https://${url}`).hostname; } catch (e) { return ''; }
}
export const normalizeUrl = url => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

// Text color that stays readable on a given accent.
export function onColor(hex) {
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 165 ? '#06211E' : '#FFFFFF';
}

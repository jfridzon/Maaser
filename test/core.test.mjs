import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  parseAmount, convert, live, totals, baseValue, dueOf, payInfo, paysLeftThisYear,
  normalizeKind, siteHost, normalizeUrl, onColor, cents,
} from '../js/core.js';
import { STRINGS } from '../js/i18n.js';

const ctx = { base: 'USD', rate: 10, rates: { USD: 1, EUR: 0.9, 'VES:bcv': 900, 'VES:bin': 1000 } };

test('parseAmount reads the formats people paste', () => {
  const cases = { '$1,234.56': 1234.56, '1.234,56 Bs': 1234.56, 'Bs. 12,5': 12.5, 1200: 1200, '1,234': 1234, '1.234': 1234,
    '0.50': 0.5, '12.5': 12.5, '1.234.567': 1234567, '1,234,567.8': 1234567.8, '': 0, abc: 0, '€ 99,99': 99.99 };
  for (const [input, want] of Object.entries(cases)) assert.equal(parseAmount(input), want, input);
});

test('convert goes through USD and reports missing rates', () => {
  assert.equal(convert(100, 'USD', 'USD', {}), 100);
  assert.equal(convert(9, 'EUR', 'USD', ctx.rates), 10);
  assert.equal(convert(1, 'USD', 'VES:bin', ctx.rates), 1000);
  assert.equal(convert(1, 'USD', 'XXX', ctx.rates), null);
});

test('void events cancel their target', () => {
  const ev = [{ id: 'a', type: 'income' }, { id: 'b', type: 'income' }, { id: 'c', type: 'void', target: 'a' }];
  assert.deepEqual(live(ev).map(e => e.id), ['b']);
});

test('totals: income, gifts, kept money, taxes and start balance', () => {
  const list = [
    { type: 'income', kind: 'sueldo', amount: 500, rate: 10 },
    { type: 'income', kind: 'sueldo', amount: 48, rate: 10, kept: true },
    { type: 'given', amount: 30, deductible: true },
    { type: 'start', amount: 20 },
    { type: 'tax', amount: 100, rate: 10 },
  ];
  const t = totals(list, ctx);
  assert.equal(t.income, 98000);
  assert.equal(t.due, 5000 + 4800 + 2000 - 1000);
  assert.equal(t.given, 3000);
  assert.equal(t.deductible, 3000);
  assert.equal(t.owed, 7800);
  assert.equal(t.pays, 2);
});

test('events keep the value frozen at entry and old events default to USD', () => {
  assert.equal(baseValue({ amount: 900, cur: 'VES:bcv', base: 'USD', baseAmount: 1 }, ctx), 100);
  assert.equal(baseValue({ amount: 12 }, ctx), 1200);
  assert.equal(baseValue({ amount: 10 }, { ...ctx, base: 'EUR' }), 900);
  assert.equal(dueOf({ type: 'income', amount: 73.35, rate: 10 }, ctx), 734);
});

test('pay schedules', () => {
  const bi = { freq: 'biweekly', anchor: '2026-01-02' };
  assert.deepEqual(payInfo(bi, '2026-01-02'), { last: '2026-01-02', next: '2026-01-02', days: 0, span: 1 });
  assert.deepEqual(payInfo(bi, '2026-01-05'), { last: '2026-01-02', next: '2026-01-16', days: 11, span: 14 });
  assert.equal(payInfo({ freq: 'weekly', anchor: '2026-01-02' }, '2026-01-08').next, '2026-01-09');
  assert.equal(payInfo({ freq: 'monthly', anchor: '2026-01-31' }, '2026-02-10').next, '2026-02-28');
  assert.deepEqual(['last', 'next'].map(k => payInfo({ freq: 'semimonthly' }, '2026-02-20')[k]), ['2026-02-15', '2026-02-28']);
  assert.equal(payInfo({ freq: 'semimonthly' }, '2026-12-31').next, '2026-12-31');
  assert.equal(payInfo({ freq: 'none' }, '2026-01-01'), null);
  assert.equal(paysLeftThisYear({ freq: 'monthly', anchor: '2026-01-15' }, '2026-10-20'), 2);
});

test('normalizeKind maps shortcut labels and custom names', () => {
  const cats = [{ id: 'sueldo' }, { id: 'c1', name: 'Freelance' }];
  const labels = { sueldo: ['Salary', 'Sueldo'] };
  assert.equal(normalizeKind('Sueldo', cats, labels), 'sueldo');
  assert.equal(normalizeKind('freelance', cats, labels), 'c1');
  assert.equal(normalizeKind('sueldo', cats, labels), 'sueldo');
  assert.equal(normalizeKind('Unknown', cats, labels), 'otro');
});

test('small helpers', () => {
  assert.equal(siteHost('example.org/give'), 'example.org');
  assert.equal(normalizeUrl('example.org'), 'https://example.org');
  assert.equal(onColor('#FFFFFF'), '#06211E');
  assert.equal(onColor('#000000'), '#FFFFFF');
  assert.equal(cents(0.1 + 0.2), 30);
});

test('every string used in the app exists in every language', () => {
  const used = new Set();
  for (const f of readdirSync(new URL('../js/', import.meta.url))) {
    const src = readFileSync(new URL(`../js/${f}`, import.meta.url), 'utf8');
    for (const m of src.matchAll(/\bt\('([\w.]+)'/g)) used.add(m[1]);
  }
  assert.ok(used.size > 50);
  for (const [lang, dict] of Object.entries(STRINGS)) {
    const missing = [...used].filter(k => !(k in dict));
    assert.deepEqual(missing, [], lang);
  }
  assert.deepEqual(Object.keys(STRINGS.en).sort(), Object.keys(STRINGS.es).sort());
});

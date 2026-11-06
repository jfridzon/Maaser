// Live exchange rates, stored as units of each currency per 1 USD.
// Venezuela has several real rates at once, so the bolivar appears as three separate "currencies":
//   VES:bcv  official rate published daily by the central bank
//   VES:par  parallel market average
//   VES:bin  USDT on Binance P2P
export const VES = ['VES:bcv', 'VES:par', 'VES:bin'];
export const COMMON = ['USD', 'EUR', 'ILS', ...VES, 'GBP', 'CAD', 'MXN', 'ARS', 'COP', 'BRL'];

const json = async url => {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
};

export async function fetchRates(previous = {}) {
  const [world, ve, bin] = await Promise.allSettled([
    json('https://open.er-api.com/v6/latest/USD'),
    json('https://ve.dolarapi.com/v1/dolares'),
    json('https://criptoya.com/api/binancep2p/USDT/VES/1'),
  ]);
  const map = { ...previous };
  if (world.status === 'fulfilled') {
    Object.assign(map, world.value.rates);
    if (world.value.rates.VES && !map['VES:bcv']) map['VES:bcv'] = world.value.rates.VES;
    delete map.VES;
  }
  if (ve.status === 'fulfilled') {
    for (const row of ve.value) {
      if (row.fuente === 'oficial' && row.promedio) map['VES:bcv'] = row.promedio;
      if (row.fuente === 'paralelo' && row.promedio) map['VES:par'] = row.promedio;
    }
  }
  if (bin.status === 'fulfilled' && bin.value.ask) map['VES:bin'] = (bin.value.ask + (bin.value.bid || bin.value.ask)) / 2;
  map.USD = 1;
  return map;
}

export const isVes = code => code.startsWith('VES');
export const isoOf = code => code.split(':')[0];

export function currencyName(code, lang, t) {
  if (code === 'VES:bcv') return t('cur.bcv');
  if (code === 'VES:par') return t('cur.par');
  if (code === 'VES:bin') return t('cur.bin');
  try { return new Intl.DisplayNames([lang], { type: 'currency' }).of(code); } catch (e) { return code; }
}
export const shortCode = code => (isVes(code) ? `Bs ${{ 'VES:bcv': 'BCV', 'VES:par': 'Par', 'VES:bin': 'Bin' }[code]}` : code);

export function formatMoney(c, code, lang) {
  const locale = lang === 'es' ? 'es-US' : 'en-US', iso = isoOf(code);
  try {
    const s = new Intl.NumberFormat(locale, { style: 'currency', currency: iso, currencyDisplay: 'narrowSymbol' }).format(c / 100);
    return iso === 'VES' ? s.replace('VES', 'Bs') : s;
  } catch (e) {
    return `${(c / 100).toFixed(2)} ${iso}`;
  }
}

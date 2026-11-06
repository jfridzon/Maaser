// Runs daily in your private data repo. Reminds on payday, and again two days later if no pay was logged.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import webpush from 'web-push';
import { payInfo } from './core.js';

const read = p => JSON.parse(readFileSync(p, 'utf8'));
const local = new Date();
const today = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
const addDays = (s, n) => new Date(Date.parse(`${s}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

const cfg = existsSync('settings.json') ? read('settings.json') : {};
const text = {
  en: { pay: 'Today is payday. Log your income when it arrives.', late: 'Your last payday is not logged yet.', test: 'Notifications are working.' },
  es: { pay: 'Hoy es día de pago. Registra tu ingreso cuando entre.', late: 'Tu último pago todavía no está registrado.', test: 'Las notificaciones funcionan.' },
}[cfg.lang === 'es' ? 'es' : 'en'];

function message() {
  if (process.env.TEST === 'true') return text.test;
  if (!cfg.notify) return null;
  const info = payInfo(cfg.schedule, today);
  if (!info) return null;
  if (info.days === 0) return text.pay;
  if (addDays(info.last, 2) !== today) return null;
  const events = existsSync('events') ? readdirSync('events').map(f => read(`events/${f}`)) : [];
  const logged = events.some(e => e.type === 'income' && (e.date || '') >= info.last);
  return logged ? null : text.late;
}

const body = message();
if (!body) { console.log('Nothing to send today.'); process.exit(0); }
const publicKey = process.env.VAPID_PUBLIC_KEY || (existsSync('push/vapid-public.txt') ? readFileSync('push/vapid-public.txt', 'utf8').trim() : '');
webpush.setVapidDetails(process.env.VAPID_CONTACT || 'mailto:maaser@example.org', publicKey, process.env.VAPID_PRIVATE_KEY);
const res = await webpush.sendNotification(read('push/subscription.json'), JSON.stringify({ title: 'Maaser', body }));
console.log('Sent', res.statusCode);

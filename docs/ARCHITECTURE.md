# Architecture

## Goals

Run free forever, keep financial data off anyone else's server, and stay simple enough to read in one sitting. That rules out a backend, an account system and a build step.

## Overview

```text
iPhone                                     Your private GitHub repo
┌───────────────────────────┐              ┌──────────────────────┐
│ Maaser web app            │   sync       │ events/*.json        │
│  localStorage: ledger,    │ ───────────▶ │ settings.json        │
│  settings, cached rates   │ ◀─────────── │ push/subscription    │
└───────────────────────────┘              └──────────▲───────────┘
┌───────────────────────────┐   writes one file        │
│ Shortcuts widget buttons  │ ─────────────────────────┘
└───────────────────────────┘
```

GitHub Pages serves only static code. No user data ever reaches it.

## Data model

The ledger is event-sourced. Each entry is an immutable JSON file named by a unique id:

```json
{ "id": "1793...-income-ab12c", "type": "income", "kind": "sueldo", "amount": 1014,
  "cur": "VES:bin", "base": "USD", "baseAmount": 1, "rate": 10, "date": "2026-01-15" }
```

| Type | Meaning |
| --- | --- |
| `income` | Adds `rate` percent of its value to what is owed. With `kept`, the amount was already set aside and counts in full. |
| `given` | Subtracts from what is owed. |
| `start` | Starting balance. |
| `tax` | Year-end adjustment: lowers what is owed by `rate` percent of the amount. |
| `recur` | A monthly donation template. Not part of the balance. |
| `void` | Cancels the event in `target`. Deleting and editing both use this. |

**Why append-only:** the app and the Shortcuts write independently, sometimes offline. Since files are never modified, two writers cannot conflict, and sync reduces to "fetch the files I lack, push the files you lack". Each write also becomes a Git commit, which gives a full history for free.

Settings are one mutable file, `settings.json`, where the newest `updatedAt` wins. The token and repository name stay on the device and are never synced.

## Currencies

Rates are stored as units per 1 USD and cached for offline use.

An entry freezes its value in the main currency when it is saved (`base`, `baseAmount`), so a later rate change does not rewrite history. If the main currency changes, older entries convert at the current rate.

Venezuela has several rates in daily use, so the bolívar is modeled as three currencies:

| Code | Rate | Source |
| --- | --- | --- |
| `VES:bcv` | Official rate published by the central bank | DolarApi |
| `VES:par` | Parallel market average | DolarApi |
| `VES:bin` | USDT on Binance P2P, midpoint of buy and sell | CriptoYa |

All three providers allow browser requests, so rates need no proxy. Binance's own P2P endpoint does not, which is why CriptoYa is used.

## Liquid Glass on the web

Apple's Liquid Glass comes from system frameworks (`glassEffect`, `GlassEffectContainer`) that are only available to native apps. On the web, the refraction technique relies on `backdrop-filter: url(#svg-filter)`, which only Chromium renders. Safari ignores it, and Safari is the only engine on iPhone that matters here.

So Maaser imitates the behavior rather than the optics:

- **Material:** `backdrop-filter` blur and saturation, plus a specular edge.
- **Spring motion:** easing curves sampled into CSS `linear()`, so controls overshoot and settle.
- **Tab bar lens:** a spring simulation in `js/liquid.js`. It stretches with speed, lifts when pressed and follows the finger.
- **Touch response:** glass grows under the finger and lights up where it is touched, as `.interactive()` glass does.
- **Morphing sheets:** sheets scale out of the control that opened them.
- **Restraint:** as Apple advises, glass is limited to controls, while content stays solid.

## Full-screen layout

The app uses `viewport-fit=cover` and the `black-translucent` status bar, so it runs edge to edge. That status bar always has white text, so a tinted wash sits behind it to keep it readable in light mode.

## Service worker

Network first, with the cache as an offline fallback, so updates reach users on the next launch without a version prompt. It also receives push notifications.

## Testing

`test/core.test.mjs` covers amount parsing, conversion, the ledger, pay schedules and category mapping. It also scans the source to confirm every translated string exists in every language. The logic that matters lives in `js/core.js`, free of the DOM, so tests need no browser.

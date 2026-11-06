# Guide for AI assistants

Read this before helping someone install or change Maaser.

## Helping a user set it up

Ask what they want first, since only the first step is required.

| Step | Guide | What you can do | What only the user can do |
| --- | --- | --- | --- |
| Install the app | [docs/INSTALL.md](docs/INSTALL.md) | Give them the link and steps | Add it to their Home Screen |
| Backup | [docs/INSTALL.md](docs/INSTALL.md#backup-and-sync) | Explain each field | Create the repository and the token, and paste it |
| Widget buttons | [docs/WIDGETS.md](docs/WIDGETS.md) | Run the build on a Mac | Add the Shortcuts and the widget on the phone |
| Notifications | [docs/NOTIFICATIONS.md](docs/NOTIFICATIONS.md) | Generate keys, copy the job files | Add secrets, enable the switch on the phone |
| Own copy | [docs/INSTALL.md](docs/INSTALL.md#host-your-own-copy) | Edit `js/config.js` | Fork and enable Pages |

Things to get right:

- Never commit a token, a private key, a `.shortcut` file or real financial data. Never put a token in a URL.
- A token should only have Contents read and write on the data repository.
- Warn the user that deleting the Home Screen icon erases local data unless a backup is connected.
- Do not advise on how much someone owes. That is a question for their rabbi.

## Changing the code

- No frameworks, no build step and no runtime dependencies.
- Put logic in `js/core.js`, with no DOM access, and add a test in `test/core.test.mjs`.
- Every user-facing string goes through `t()` and must exist in every language in `js/i18n.js`. The tests enforce this.
- Events are immutable. To change or remove one, write a `void` event.
- Add new files to the cache list in `sw.js`.
- Keep screens calm: if a feature adds clutter, put it behind a sheet or in Settings.
- Run `npm test` before finishing.
- Test at 320 and 390 pixels wide, in light and dark mode, in English and Spanish.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the parts fit together.

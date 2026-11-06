# Notifications

Maaser can remind you on payday, and again two days later if the pay is still not logged.

A web app cannot schedule notifications by itself, so a small daily job in your private data repository sends them for free with GitHub Actions. Notifications on iPhone need iOS 16.4 or later, with the app installed to the Home Screen.

Maaser has no access to your bank, so it cannot tell when money arrives. For a real deposit alert, turn on deposit alerts in your bank's app.

## Setup

You need your own hosted copy, because the push key belongs to the deployment. See [Host your own copy](INSTALL.md#host-your-own-copy). You also need [backup](INSTALL.md#backup-and-sync) connected and a pay schedule set.

1. Generate a key pair:

   ```bash
   node tools/notify/keys.mjs
   ```

2. Put the public key in `js/config.js` as `VAPID_PUBLIC_KEY` and publish your copy.

3. Copy the job into your data repository:

   ```bash
   mkdir -p ../maaser-data/.github/workflows ../maaser-data/push
   cp tools/notify/notify.yml ../maaser-data/.github/workflows/
   cp tools/notify/send.mjs js/core.js ../maaser-data/push/
   ```

4. In the data repository on GitHub, open **Settings > Secrets and variables > Actions**:
   - Secret `VAPID_PRIVATE_KEY`: the private key.
   - Variable `VAPID_PUBLIC_KEY`: the public key.
   - Variable `VAPID_CONTACT`: a `mailto:` address, which push services may use to reach you.

5. In `notify.yml`, set `TZ` to your time zone and adjust the `cron` time. Commit and push.

6. In the app, open **Settings > Notifications** and turn on **Payday reminders**.

7. Test it: in the data repository, open **Actions > Payday reminders > Run workflow**.

## Good to know

- GitHub can delay scheduled jobs, sometimes by an hour or more.
- GitHub disables scheduled jobs after 60 days without repository activity, though logging entries counts as activity.
- If you reinstall the app, turn the switch off and on again to register the new install.

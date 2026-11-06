# Install

## On iPhone

1. Open <https://jfridzon.github.io/Maaser/> in **Safari**.
2. Tap **Share**, then **Add to Home Screen**. Keep **Open as Web App** on.
3. Open Maaser from the Home Screen. Choose your language, main currency and percentage.

Home Screen apps keep their own storage, separate from Safari. Data you enter in a Safari tab does not appear in the installed app, so always use the installed one.

Deleting the Home Screen icon deletes the data on that phone. Set up a backup first, or export a backup file from **Settings > Backup and sync**.

## On Android or desktop

Open the same link in Chrome or Edge and choose **Install app**. Widget buttons are iOS only.

## Backup and sync

Optional. Maaser copies your data to a private GitHub repository that only you can read.

1. [Create a private repository](https://github.com/new?name=maaser-data&visibility=private) named `maaser-data`. Leave it empty.
2. [Create a fine-grained token](https://github.com/settings/personal-access-tokens/new?name=Maaser&description=Maaser+backup&contents=write).
   - **Repository access:** Only select repositories, then choose `maaser-data`.
   - **Permissions:** Contents, Read and write.
3. Copy the token. In Maaser, open **Settings > Backup and sync** and tap **Paste and connect**.

**Status** shows the time of the last copy when it worked. To restore on a new phone, install the app and connect the same token.

If you would rather not use GitHub, use **Export backup file** and **Import backup file** on the same screen.

## Host your own copy

The app is a static site, so forking is enough.

1. Fork this repository.
2. In your fork, open **Settings > Pages**, set the source to the `main` branch and the `/ (root)` folder, and save.
3. Open `https://<your-username>.github.io/Maaser/`.

To customize a deployment, edit [`js/config.js`](../js/config.js). Any static host works, as long as it serves over HTTPS.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| The app shows an old version | Close it fully and open it again. Updates load in the background. |
| Token rejected | The token expired or was mistyped. Create a new one. |
| Token lacks permission | Set **Contents** to **Read and write**, and select your data repository. |
| Repository not found | Check the name in **Settings > Backup and sync**. It should be `owner/maaser-data`. |
| No rate for a currency | Rates load when you are online, and the last ones are kept for offline use. |

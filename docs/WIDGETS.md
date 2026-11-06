# Home Screen widget buttons

Web apps cannot provide their own widgets, so Maaser uses the free iOS Shortcuts app. Two Shortcuts log an entry straight into your backup repository, and the Shortcuts widget turns them into Home Screen buttons. The app picks the entries up the next time it opens.

**You need:** [backup](INSTALL.md#backup-and-sync) set up first, and iCloud Drive turned on.

## Option A: build them on a Mac

Shortcuts must be signed, which needs a Mac signed in to iCloud.

1. Clone this repository and run:

   ```bash
   MAASER_REPO=your-username/maaser-data MAASER_LANG=en node tools/shortcuts/build.mjs
   ```

   Use `MAASER_LANG=es` for Spanish. Both files are written to iCloud Drive, in the Shortcuts folder.

2. Save your token as a text file in that same folder, without a line break at the end:

   ```bash
   printf %s 'YOUR_TOKEN' > ~/Library/Mobile\ Documents/iCloud~is~workflow~my~workflows/Documents/maaser-token.txt
   ```

3. On your iPhone, open **Files > iCloud Drive > Shortcuts**, tap each `.shortcut` file and choose **Add Shortcut**.

The token file sits in your private iCloud Drive and is readable by your Shortcuts. It only grants access to your data repository.

## Option B: build them by hand on iPhone

In the Shortcuts app, create a shortcut with these actions. For a "give" version, ask for the amount and the name, and use `"type":"given","to":"<name>"` in step 5.

1. **Text:** paste your token.
2. **Choose from Menu** or **Choose from List:** Salary, Gift, Transfer, Other.
3. **Ask for Input** (Number): how much came in.
4. **Format Date** on Current Date, twice: custom format `yyyy-MM-dd`, then `yyyyMMddHHmmss`.
5. **Text:** `{"type":"income","kind":"<choice>","amount":"<number>","date":"<yyyy-MM-dd>"}`
6. **Base64 Encode** the text, with line breaks set to None.
7. **Get Contents of URL:**
   - URL: `https://api.github.com/repos/<owner>/maaser-data/contents/events/s<yyyyMMddHHmmss>-income.json`
   - Method: `PUT`
   - Headers: `Authorization: Bearer <token>`, `Accept: application/vnd.github+json`
   - Request Body: JSON, with `message` set to `shortcut` and `content` set to the Base64 result

## Add the widget

1. Touch and hold an empty spot on the Home Screen, then tap **Edit > Add Widget**.
2. Choose **Shortcuts**, pick a size and tap **Add Widget**.
3. Tap the widget and pick the shortcut or folder to show.

The first run asks for permission to read the token file and to reach `api.github.com`. Choose **Always Allow**.

## A see-through look

Apps cannot make a widget transparent. iOS 26 and later can do it for the whole Home Screen: touch and hold it, tap **Edit > Customize**, then **Clear**.

## Open the app at a specific screen

These links open the entry sheet directly, which is useful in your own Shortcuts:

- `https://<host>/#add=sueldo` for salary. Other values: `regalo`, `zelle`, `otro`.
- `https://<host>/#add=given` for a donation.

iOS may open them in Safari instead of the installed app.

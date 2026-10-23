# Google Photos Remover

A tiny Chrome extension for bulk-deleting Google Photos. It clicks through
Google Photos' own interface in safe batches and shows live progress — no
account access, no server, no tracking.

![Version](https://img.shields.io/badge/version-0.2.0-1a73e8)
![Manifest](https://img.shields.io/badge/manifest-v3-34a853)
![Permissions](https://img.shields.io/badge/permissions-none-5f6368)

## Install

The extension is not published on the Chrome Web Store yet. Load it locally:

1. Download or clone this repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select the repository folder.

## Use

1. Click the extension icon and choose **Remove all photos**.
2. Pick the Google account to clean up in the account chooser. This only
   selects which library to clean — it does **not** sign you out.
3. Keep the Google Photos tab open — a small panel shows the current batch,
   the selected count and how many items are already in Trash.
4. Press **Stop** in that panel at any time. Nothing is deleted without a
   confirmation inside Google Photos.
5. When the run finishes, open **Trash** and empty it to free up space
   permanently.

Archived items are hidden from the main library. To clean those up too, open
`https://photos.google.com/archive?delete_all` once; the same progress panel
appears and handles the archive view.

> Photos are only moved to Google Photos' Trash. Emptying the trash stays a
> deliberate, manual step so a mistake is always recoverable.

## How it works

```
popup ──opens──► accounts.google.com/AccountChooser
                        │ continue=photos.google.com/?delete_all
                        ▼
              photos.google.com ──injects──► content script
                                                   │
                        ┌──────────────────────────┴───────────────────────┐
                        │ 1. scroll the library, select up to 500 tiles    │
                        │ 2. press Delete → confirm "Move to trash"        │
                        │ 3. wait until the selection is really cleared    │
                        │ 4. repeat                        ▼               │
                        │              shadow-DOM panel: Stop / Open Trash │
                        └──────────────────────────────────────────────────┘
```

- **Batches of 500.** Google Photos caps selection size and slows down with
  huge selections, so each batch selects at most 500 photos.
- **Verified counts.** A batch is only added to the "In Trash" total after the
  checked tiles actually disappear, so failed or cancelled dialogs are never
  reported as deletions.
- **Safe dialogs.** Only the default/confirm action is pressed; buttons whose
  label looks like Cancel, Close or Dismiss are never clicked.
- **Event-driven waits.** A `MutationObserver` plus a light fallback poll
  replaces tight polling loops, so the page stays responsive.
- **Instant stop.** Every wait and loop is cancellable through an
  `AbortController`; Stop responds immediately, even mid-batch.
- **No residual trigger.** The `?delete_all` parameter is removed from the URL
  when the run completes or is stopped, so refreshing the tab does not start
  it again by accident.

## Privacy

- Runs entirely in your browser; the extension makes **no network requests**.
- Requests **no permissions** at all — no `storage`, no `identity`, no `tabs`.
  The only host access is the content script on `photos.google.com` (Chrome
  shows this as a per-site access notice when you install).
- Stores only a "last start" timestamp in the popup's own `localStorage`.
- Does not read, upload or transmit your photos or account details.

## Project layout

```
manifest.json               Manifest V3, no permissions, no background worker
src/
  content/delete-photos.js  Selection/deletion loop + progress panel
  popup/popup.html          Toolbar popup markup
  popup/popup.css           Popup styles (light + dark)
  popup/popup-script.js     Popup logic and live status
  assets/icons/*.png        16/32/48/128 px icons
scripts/check.js            Package + syntax validation
```

## Development

```bash
npm run check     # validates manifest, referenced files and JS syntax
```

After editing files, press the reload button for the extension on
`chrome://extensions` and refresh the Google Photos tab.

Google Photos does not offer a public bulk-delete API, so the content script
drives the web UI. If Google changes its markup, update the selector lists at
the top of `src/content/delete-photos.js` (`CHECKBOX_SELECTORS`,
`DELETE_BUTTON_SELECTORS`, `DIALOG_*`).

When releasing, bump the version in **both** `manifest.json` and
`package.json`; `npm run check` fails if they differ.

## License

[MIT](LICENSE) © Sajedur Rahman Roni

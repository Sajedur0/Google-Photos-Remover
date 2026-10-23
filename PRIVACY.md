# Privacy Policy — Google Photos Remover

**Effective date:** October 23, 2026
**Applies to:** the Google Photos Remover browser extension ("the extension")
**Maintainer:** Sajedur Rahman Roni ("we", "us")

Your privacy is important to us. This policy explains exactly what the
extension does, what information (if any) it handles, and what it never does.
It is written to be short and honest — there is no hidden data collection to
describe.

## TL;DR

- **We collect nothing.** No personal data, no analytics, no tracking, no ads.
- **The extension makes no network requests** — not to us, not to anyone.
- Everything happens locally in your browser, on your device only.
- The extension has **no accounts, no servers, and no third-party code**.

## 1. Information we collect

**None.** The developer collects, receives, or has access to:

- no personal information (name, email, identifiers, …)
- no photos, videos, albums, or any content from your Google Photos library
- no browsing history or activity outside of what you explicitly trigger
- no location, device, or diagnostic data
- no cookies or tracking technologies

Because no data ever leaves your browser and nothing is transmitted to us,
there is no database of users and nothing about you for us to store, sell, or
share.

## 2. What the extension actually does

Google Photos Remover helps you bulk-move your own Google Photos library to
Google Photos **Trash**:

1. When you click **Remove all photos**, the extension opens Google Photos in
   a new tab (via Google's own account chooser if you are signed in to
   multiple accounts).
2. A small script runs on `photos.google.com` and clicks Google Photos' own
   interface for you: it selects photos in batches of up to 500 and presses
   Google's own **Move to trash** action and confirmation.
3. A progress panel on the page shows the current batch and lets you **Stop**
   at any time.

The extension automates clicks in *your* browser session on *your* behalf —
exactly as if you clicked them yourself. It never bypasses Google's
authentication and never accesses Google's backend APIs directly.

## 3. Your photos and Google account

- The extension **never reads, copies, downloads, uploads, or stores** your
  photos or videos. It only clicks the same on-screen buttons you would click.
- It **never sees or handles your Google credentials**. Sign-in is performed
  entirely by Google's own account pages; we have no access to them.
- Photos you delete are moved to **Google Photos Trash**, where they follow
  [Google's own retention and recovery rules](https://support.google.com/photos/answer/6128858).
  Emptying the trash is a deliberate, manual step that the extension never
  performs automatically.

## 4. Data stored on your device

The extension stores a single piece of information on your own device: a
"last run" timestamp in the popup's local `localStorage`, shown as "Last run"
in the popup. This value:

- never leaves your browser
- is not synced to any account or server
- disappears when you clear site data or uninstall the extension

## 5. Permissions and host access

The extension requests **no special permissions** (no `storage`, `identity`,
`tabs`, `history`, or network permissions). Because it must click Google
Photos' interface, it declares a content script on `https://photos.google.com/*`
— Chrome shows this during install as a site-access notice for
`photos.google.com`. That access is used only to run the batch-removal loop
when you trigger it, and only on that site.

## 6. Third parties and remote code

- **No third-party services, analytics SDKs, advertising, or external APIs.**
- **No remote code:** all code is contained in the extension package you
  installed; nothing is downloaded or evaluated at runtime.
- The only external websites involved are the Google pages you navigate to
  yourself (Google Photos and Google's account chooser). Those are governed by
  [Google's Privacy Policy](https://policies.google.com/privacy).

## 7. Children's privacy

The extension is not directed to children under 13, and we knowingly collect
no personal information from anyone — including children. Since no data is
collected at all, there is nothing to delete; if you have concerns, use the
contact channel below.

## 8. Data retention and deletion

We retain **zero user data**, so no retention period applies and no deletion
requests are necessary. Anything the extension stores locally (§4) is removed
by uninstalling it or clearing the site's data. For data held by Google
Photos itself (including its Trash), contact Google.

## 9. Security

Because the architecture collects nothing and transmits nothing, there is no
user data in our possession that could be breached. The extension runs with
least privilege (§5) and keeps all processing on your device.

## 10. Changes to this policy

If this policy changes, we will update this file and the **Effective date**
above. Material changes will be noted in the repository's commit history. We
encourage you to review this page periodically.

## 11. Contact

Questions about this policy or the extension?

- Open an issue: [github.com/Sajedur0/Google-Photos-Remover/issues](https://github.com/Sajedur0/Google-Photos-Remover/issues)
- Maintainer: [Sajedur0](https://github.com/Sajedur0) — Sajedur Rahman Roni

## 12. Consent

By installing or using the extension, you agree to this policy. If you do not
agree, please uninstall the extension.

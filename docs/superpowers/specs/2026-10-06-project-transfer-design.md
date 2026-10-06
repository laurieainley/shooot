# Project Transfer Between Devices & iOS File Picker — Design (Sub-project L)

**Date:** 2026-10-06
**Source:** user: quick way to move an edit from phone to PC (and PC → phone via QR); LRV files greyed out in the iPad file picker.

## 1. iOS / iPadOS file picker shows LRVs

- Cause: `accept=".mp4,.MP4,.lrv,.LRV"` is mapped by iOS to uniform types; `.lrv` has none, so LRV files are disabled.
- Fix: `fileInputAccept(env)` (pure) returns `''` (no `accept` attribute) on iOS/iPadOS (UA contains iPhone/iPad, or `MacIntel` with `maxTouchPoints > 1`), else the current extension list (Android keeps extension-only so USB storage still shows). Apply to every file input (add files, empty-state drop/picker, attach full files, replace file). The app's own `isAcceptedVideo` check already rejects non-video picks with a clear message.
- iPad hint: on iOS, when the picker returns, if any picked file is > 2 GB show "iPadOS copies files before the app can open them — large GoPro MP4s can take a few minutes. Tip: edit with the .LRV previews and attach MP4s only to render." Also show a spinner "Waiting for iPadOS to hand over the files…" from picker open until `change` fires (detect via `focus`/`visibilitychange` after `click()`), cleared on change or cancel.

## 2. Project transfer link (+ QR)

- What transfers: the project only (events, teams/rosters, kick-off etc., clip/replay/graphics settings, goal areas, matchday heading, file names/keys) — never video. Files are relinked on the other device by name/GoPro key (existing relink: an LRV on the phone matches the GX MP4 on the PC).
- Encoding: project JSON (existing export format) → `CompressionStream('deflate-raw')` → base64url → URL fragment `https://<origin>/#p=<data>` (fragment never reaches the server). Pure `encodeProject`/`decodeProject` with a version prefix; fallback to uncompressed if `CompressionStream` is unavailable.
- **⋯ → Send project to another device**: sheet with
  - QR code of the link (for PC → phone: scan with the phone camera),
  - **Share…** (`navigator.share({ url })` — phone → PC via AirDrop, Messages, WhatsApp/email to self, or Chrome "Send to your devices"),
  - **Copy link**,
  - the link's size; if the QR would be too dense (> ~2,500 chars), show the QR with a note that Share/Copy are more reliable.
- Opening a link with `#p=`: if the current project has events, ask "Replace current project with the received one?" (Replace / Keep current); then load it, clear the fragment from the address bar (`history.replaceState`), and show the Relink banner for its files.
- QR rendering: small dependency (e.g. `qrcode` npm, SVG output), lazy-loaded with the sheet.

## Testing

- Unit: `fileInputAccept` per environment; `encodeProject`/`decodeProject` round trip (incl. unicode names, large rosters), version prefix, corrupt input rejected; size estimate.
- Component: send sheet (QR present, Share/Copy buttons, size note); receiving flow (confirm when events exist, load, fragment cleared, relink banner); iOS hint message logic.
- Browser: Chromium desktop → copy link → open in a fresh context (phone viewport) → project appears and relink banner shows; WebKit with iPad UA: file inputs have no `accept`; screenshots l-*.png.

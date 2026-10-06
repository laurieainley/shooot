# Project transfer + iOS picker (sub-project L) — plan

Spec: docs/superpowers/specs/2026-10-06-project-transfer-design.md

1. utils/fileAccept: `isIOS(env)`, `fileInputAccept(env)`, `acceptAttr()`; all media inputs use `accept={acceptAttr()}`.
2. utils/pickerHint: iPad large-file hint text (> 2 GB, iOS only). Store: `pickerWait`, `pickerNotice`; `OpeningStatus` shows the spinner "Waiting for iPadOS to hand over the files…" and the hint. `pickMedia(input)` helper marks wait on click; change/cancel clears.
3. utils/projectTransfer: `buildTransferPayload`, `encodeProject`/`decodeProject` (version prefix, deflate-raw + base64url, uncompressed fallback), `transferUrl`, `fragmentPayload`, `qrDensity`.
4. components/receiveProject: `applyTransferPayload` (store) + `ReceiveProject` (reads `#p=`, confirm if events exist, load, clear fragment; relink banner appears from existing events-without-files logic).
5. components/SendProjectSheet (lazy, `qrcode` SVG): QR, Share…, Copy link, size note; ⋯ menu item, `send` panel.
6. Browser verification (Playwright), build size delta, lint/tsc/tests.

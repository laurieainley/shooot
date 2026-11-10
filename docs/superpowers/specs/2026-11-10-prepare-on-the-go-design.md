# Prepare on the go — prepare on a phone/iPad, finish on the Mac — design

Date: 2026-11-10 · Builds on `2026-11-05-background-prepare-design.md` (live). Decided with the user in conversation; my own
calls are marked **(agent call)**.

## Intent

The user's evening: football → a few hours in the pub (phone, maybe iPad, a power bank, a microSD USB adapter that plugs
into the phone, the iPad and the Mac) → 20–30 min on a train, tagging on the phone → home, finish on the Mac, export the
full match and highlights at **4K** and upload to YouTube. Today the long wait is the 4K re-encode on the Mac at the end
(≈ 0.85× the match length for the full match alone). Background prepare already encodes 4K pieces ahead of the export, but
only on the device that has the footage and only for that device. Goal: do the encoding in the pub on the phone or iPad, and
carry the prepared pieces to the Mac on the card so the Mac's Render only encodes what changed since.

## Decisions (user)

- 4K is the export to optimise (Original is too big to upload; 1080p loses the far goal). No YouTube API upload.
- Both an iPad and a **Pixel 9 Pro** must work as the pub device. The editor stays open with the screen on; a power bank is fine.
- Finish on the **Mac**. Pieces travel on the microSD card. The cross-device part is a **try**: if the Mac cannot join
  another device's pieces into a file that plays cleanly in QuickTime, it falls back to encoding them itself and we report
  that; nothing ships that makes a broken file.
- Fully on-device; no server.

## Non-goals

- Network transfer between devices (Wi-Fi, WebRTC), cloud rendering, YouTube upload.
- Rendering while the screen is locked or the tab is in the background (iOS/Android stop it; we keep the screen on instead).
- Original or 1080p handoff (4K and 1080p re-encodes share the code, so 1080p may work for free, but it is not a goal).

## Part 1 — preparing in the pub

1. **Screen stays on while preparing.** The preparer holds a screen wake lock (`renderWakeLock.ts`, as renders and detection
   do) while a pass runs on a touch device; released when it pauses, finishes or the page is hidden; re-taken on return.
2. **4K is the prepared quality on a new device** **(agent call):** `fullMatch.quality` already survives `newMatch()`. On a
   device where it is still Original and full MP4s (not only LRVs) of 4K footage are loaded, the prepare pill/Export shows a
   one-tap "Prepare 4K" that sets full match (and highlights, when its setting is auto) to 4K. No silent change of settings.
3. **Highlights on a phone:** honour an explicit 4K choice (already the case); the prompt in 2 covers it.
4. **Status that reads in the pub:** the prepare pill text "Full match 62% prepared · keep the screen on" on touch devices
   while preparing; "Full match prepared" when done. Existing pill, new copy only (brand voice, sentence case).
5. **Reload on iOS:** when the page reloads with a project whose files need picking again and the unit cache holds prepared
   pieces for it, a clear banner: "Pick the match files again to keep preparing — N% is already done." (Pieces are kept.)

## Part 2 — carrying pieces to the Mac

### Device-independent piece identity

Today a piece's key hashes `unitFacts` (encoder hardware + config, scale path) and the footage identity
`name + size + lastModified`. Across devices both differ (another encoder; `lastModified` changes when iOS copies a file or a
card is read through another OS). Add a second, **portable key** per piece, stored in the piece's meta:
- footage identity = name + size (+ a content fingerprint: SHA-256 of the first and last 1 MiB of the file) **(agent call)**;
- everything in today's key except the device facts (encoder hw/config, scale path), but keeping output size, fps, key
  interval, quality, bitrate, audio facts and `RENDER_VERSION`.
The local key is unchanged (local reuse behaves exactly as today).

### The prepared-parts file (`.shooot-parts`)

- **"Save prepared parts"** (Export panel, and the prepare pill's menu once anything is prepared): one file named
  `<match> · prepared parts.shooot-parts` holding a small header (format version, `RENDER_VERSION`, device label, the
  project JSON as a transfer, and an index of pieces: portable key, kind, bytes, the encoder's codec string + parameter-set
  description) followed by each piece's stored bytes. Built **without a second copy on disk** (a `Blob` composed of the
  cache's OPFS `File`s plus small headers) **(agent call)**, saved with `showSaveFilePicker` where available (Chrome on Android,
  Mac), else a download (Safari: Save to Files → the card).
- **Loading on the Mac:** the file is accepted where match files are added (Add files / drop) and from the Files sheet. It
  loads the project (same rules as importing a project file; asks before replacing a different match), then copies the
  pieces into the unit cache as imported entries (admitted like prepared units, i.e. allowed past the normal cap when they fit)
  and reports "Loaded N prepared parts from <device>". Progress shown; cancellable.
- **Use at render:** when a unit's local key misses, look up its portable key among imported pieces; use it only if it is
  compatible with this render (same output size, fps, key interval, audio format, H.264 profile, level within the
  render's sample entry) — else encode it locally. Diagnostics note: "Reused N parts prepared on <device>, M encoded here".

### Joining pieces from two encoders (the risk)

Every output piece starts on a key frame with its own encoder. Today the engine has one H.264 sample entry for the file and
throws if a later encoder's parameter sets differ (`the encoder changed its profile or level…`). Pieces from another device
will differ. The approach to try **(agent call — the spike decides)**: put each piece's SPS/PPS in-band on its key frames and
choose a sample entry that covers all pieces (profile, level, size), as the HEVC splice path does for QuickTime
(AGENTS.md §5); if AVFoundation does not accept changing parameter sets under one `avc1` entry, try `avc3`; if neither decodes
cleanly in QuickTime (`scripts/avcheck.swift`, no gap > 0.1 s, picture right after each join), the handoff is not shipped and
imported pieces are ignored with a diagnostics note.

### Spike result (2026-11-10, branch `spike/handoff`, `spikes/handoff.ts`)

Approach **A works**: VideoToolbox (High 5.1, CABAC, 2 refs, VUI colour unspecified) and OpenH264 (High 5.1, CAVLC, 1 ref,
BT.709) units alternating in one 4K MP4, in both orders → ffmpeg silent, avcheck clean (gap 0.033 s), AVFoundation frames
right at every join, Chrome plays to the end. Rules learned:
- The `avc1` entry must be the unit SPS that **covers** all others (`pickSampleEntry` + `raiseEntry`): an entry with fewer
  ref frames (dpb 1) than a later unit → QuickTime stops at that unit (-12137) while Chrome/ffmpeg play fine. Only avcheck
  catches it.
- `avc3` does not decode in AVFoundation (-12906). Naive (no in-band sets) silently drops units in QuickTime.
- Colour signalling differs between encoders (shift visible outside QuickTime): set the colour space explicitly (BT.709
  limited) on the encoder / entry.
- Untested: a different **profile** (MediaCodec may emit Main/Baseline: `pickSampleEntry` returns -1 today), B-frames,
  non-zero SPS/PPS ids. The build tests High entry over in-band Main units first; if QuickTime refuses, units with another
  profile are not reused (diagnostics note).

## Testing

- Utils: portable key ignores device facts and `lastModified`, changes with each real input; compatibility check; bundle
  header round-trip; import admission; wake-lock acquire/release rules; prompt/pill/banner conditions.
- **Spike first:** on the Mac, pieces encoded by Chrome's software H.264 encoder (`hardwareAcceleration: 'prefer-software'`)
  joined with hardware (VideoToolbox) pieces into one 4K file: ffmpeg silent, avcheck clean, frames at joins looked at.
  Different encoder = stand-in for another device. Generated 4K HEVC 1 s GOP + AAC, ≤ 30 s, deleted after.
- Real round trip in Playwright: prepare in one browser context with software encoding, save the parts file, load it in a
  fresh context (hardware), render, check the output as above and that the reused count is right.
- Not testable here: a real iPad/Pixel in a pub (heat, wake lock, Save to Files to the card). Listed for the user.

## Left to the builder

File layout of the bundle beyond the header fields named, component split, exact pill/banner placement within the existing
components, how imported entries are marked in the cache manifest.

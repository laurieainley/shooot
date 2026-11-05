# Background prepare: encode exports while you edit

**Problem.** A 4K/1080p export encodes everything at the end of the edit. The unit cache (src/render/unitCache.ts) only helps the *second* export, and its 2-minute units start at each cut's start, so with a goal every 2–3 minutes nearly every unit is spoiled by a caption or score bug.

**Goal.** By the time the user presses Render, almost everything is already encoded; the export re-encodes only what editing changed. Measure it.

## 1. One background preparer, two kinds

A single low-priority worker keeps the unit cache filled for the *current* export plans:

- **Full match** first (the whole footage; only seconds under graphics change). Starts as soon as files are linked: kick-off / final whistle are not needed (see blocks below).
- **Highlights** next: each goal's clip, as the plan currently stands.

It works by asking: for the current plan (`fullMatchExport` / highlights plan in src/utils/exportPlans.ts at the quality the export panel has selected for that kind), which unit keys are missing from the cache? Encode the missing ones, one unit at a time, and write them to the cache exactly as an export would. After any project edit, wait about 20 s of no edits, then re-plan (units already done whose keys still match are kept; stale units are simply never hit and get evicted later).

- Quality: the one selected in the export panel for that kind. "Original" (stream copy) needs nothing → nothing to prepare for that kind.
- The real export always wins: pressing Render pauses the preparer, waits for/abandons the unit in flight (a half-written unit must never be a cache hit — the .json-last rule already ensures this), and the export reuses everything finished. Resume after.
- While the player is playing or scrubbing: 1 unit at a time at most and yield generously; idle: up to PARALLEL_UNITS. User pause button stops it entirely until resumed (persist paused per project).
- Keep the screen awake while it runs (reuse the render wake-lock code); keep working while the tab is hidden, as renders already do.

## 2. Short, source-aligned blocks (full match)

Today `stableSegments` splits each cut from its own first frame into 120 s pieces, and the keys hash the cut's `startSec`, so moving kick-off or inserting a replay changes every key, and one caption spoils 2 minutes.

Change for reuse-enabled renders: split on a fixed grid of the **source file's time** (blocks of ~10 s; tune 10–20 s by measuring per-unit overhead), so a block's key depends only on its source span, the output settings and the overlays drawn inside it — not on where the cut starts. A cut's first/last block is the partial block from the cut edge to the grid line (these edges change when kick-off/whistle/replays change; that's fine, they're short). Check:

- Key contents must then depend on the block's source span, not the cut (`cutPart` currently includes the cut's whole start/end — fix so only what decides the block's frames is hashed). A wrong reuse is far worse than a miss: anything that changes a frame or audio sample must be in the key (speed, crop/zoom, audio settings, fade, etc.).
- Overlays: a block's key includes only overlays that draw within it. `cutBound` captions (fromCutStart/toCutEnd) currently spoil every part of their cut — confirm whether full-match captions use them and, if so, key only the blocks they actually draw in.
- Score bug 'goals' mode: windows are after goals only; verify a window only spoils the blocks it covers.
- Highlights: clips are short; a goal's clip should be its own units so editing one goal leaves the others' units as they are (already true with stable segments — keep it).
- More joins: verify A/V sync and AAC continuity at block joins (no clicks, no drift over a 110-min match) and that per-unit encoder setup doesn't make the total much slower than today. Add tests at the plan level.

## 3. Save to file must reuse too

`targetFile` renders currently skip `reuse` (src/components/renderRequest.ts). Reading cached units is fine when streaming to a file — only *journaling* needs browser storage. Allow reuse with targetFile (writing newly encoded units into the cache can stay as for normal renders when there's room). Otherwise the big 4K full match can't benefit.

## 4. Disk space: don't start, show a warning

Before starting a kind, estimate the bytes its prepared units will take (output bitrate × seconds, as `estimateBytes`/outputSize do) and compare with `navigator.storage.estimate()` (quota − usage) plus what the cache could reclaim (`evictForRoom` logic). Raise the cache cap as needed for prepared units (today 6 GB / 25% of quota), but keep the margin the render itself needs for its output when it downloads via browser storage.

If it doesn't fit: don't start. The pill shows a warning sign; hover (tap on touch) shows e.g.

> Not enough space to prepare the full match at 4K. Needs 14.2 GB, 6.1 GB available — free about 8.1 GB on this device to enable it. (Or choose 1080p, which needs 4.6 GB.)

Re-check when quality changes, on focus, and every few minutes.

## 5. UI: the pill

Small pill in the editor header, next to existing status:

- `Preparing full match · 34% · ⏸` (percentage of that kind's units ready), then `Preparing highlights · 60% · ⏸`
- `Paused · ▶`
- `Ready ✓` — hover: "Full match 4K and highlights 4K are ready; the export will only redo what you change."
- `⚠ Not enough space` (hover text above)
- Hidden when nothing to prepare (Original quality, no files).

The Export panel's existing "N of M parts can be reused" hint and time estimate should reflect prepared units (useReusableParts already reads the cache).

## 6. Benchmark log

Every export (and every preparer session) appends one record to a persistent log (IndexedDB or an OPFS `export-log.jsonl`), and the ⋯ menu gets **"Download export timing log"** (JSONL or CSV file). Per export record:

- time, project name, kind, quality, output seconds, device class, Save to file or download
- wall seconds of the export (Render pressed → file ready), and of the encode itself
- units reused / total; seconds re-encoded vs seconds reused
- **estimated time without preparing**: the measured encode rate of this export's re-encoded units scaled to all units (and the plain renderTime estimate for a full re-encode, as a second figure)
- background prepare: total wall seconds it ran, units it encoded, seconds paused, seconds throttled during playback
- the cache hit details from the existing diagnostics note

Also a real "without" baseline: an export option (⋯ menu / Labs toggle) "Export without prepared parts", which runs with the unit cache off (`exp.unitCache = false` exists), logged with a flag, so the user can compare directly.

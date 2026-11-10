# Prepared parts handoff (Part 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pieces a phone/iPad prepared for a 4K export travel to the Mac in one `.shooot-parts` file on the microSD card, and the Mac's Render reuses them, producing a file that plays cleanly in QuickTime.

**Architecture:** (1) the journaled re-encode accepts units from different H.264 encoders (per-unit parameter sets in-band, covering `avc1` entry picked at finalize); (2) each cached unit also gets a device-independent *portable key*, looked up when the local key misses; (3) a bundle format writes/reads cache units + project; (4) UI to save and load it.

**Tech Stack:** TS strict, Mediabunny, WebCodecs, OPFS, Vitest, Playwright, `scripts/avcheck.swift`.

**Spec:** `docs/superpowers/specs/2026-11-10-prepare-on-the-go-design.md` (Part 2 + "Spike result"). Spike code: branch `spike/handoff`, `spikes/handoff.ts` (read it: it is the working recipe).

## Global Constraints

- Local-only behaviour unchanged when no other-encoder unit is involved: same output bytes for a single-encoder render (test).
- Never ship a file AVFoundation can't decode: any unit whose SPS isn't covered by the chosen entry (`pickSampleEntry` -1, differing NAL length size) is encoded locally instead, with a diagnostics note.
- Mixed encoders only on the journaled path (`ExportPlan.resumable`); the direct path keeps today's single-encoder rule.
- Portable key = today's key inputs minus device facts (encoder hw/config, scale path) with footage identity `name + size + sha256(first 1 MiB + last 1 MiB)`; keeps output size, fps, key interval, quality, bitrate, audio facts, `RENDER_VERSION`.
- Bundle: `.shooot-parts`, header `{ format: 1, renderVersion, device, createdAt, project (transfer JSON), units: [{ portable, kind, bytes, offset, codec, description(b64) }] }`; built as a `Blob` of the cache's OPFS `File`s (no second copy on disk).
- Words: "prepared parts". Lime allow-list; tokens; 44 px; 14 px touch text; contrast ≥ 4.5:1.
- Implementers: own worktree under `.claude/worktrees/`, own port (never 5174), `docs/superpowers/agents/common-rules.md`, never stage `.superpowers/`, no bare `git stash`, don't edit AGENTS.md/CLAUDE.md/DECISIONS.md, don't merge.

## Review Focus

1. Imported (software) units come **first** and the Mac's hardware units later → entry must be the covering (hardware, dpb 2) SPS, not the first unit's. (Task 1 test + real render.)
2. A unit from a different profile (Main under a High entry) → decodes in QuickTime, or is re-encoded locally; never a silent dropped unit. (Task 1 real render.)
3. Same footage, file read on another OS → `lastModified` differs → portable key still matches. (Task 2 test.)
4. Bundle from an older `RENDER_VERSION` → refused with a clear message, project still loadable. (Task 3 test.)
5. Loading a bundle for a different match than the open one → asks before replacing (same rule as project import). (Task 4 test.)

---

### Task 1: Joins across encoders in the 4K engine (opus)

**Files:** Modify `src/render/transcodeEngine.ts` (`drain` ~423, `restoreUnit` ~661, finalize ~952), `src/render/muxUnits.ts`, journal unit records (per-unit `video` description), `src/render/nal.ts` only if a helper is needed; add `RenderOptions.experiments.encoderFor?: (u: number) => 'hardware' | 'software'` (test/bench only, off by default) to make mixed renders reproducible. Explicit colour space BT.709 limited on the encoder config.

**Produces:** a journaled render whose units may carry different descriptions; final entry = `raiseEntry(pickSampleEntry(all))`; each unit's key frames get `withInbandParams(own params)`; `restoreUnit` accepts a cached unit whose description differs if covered.

- [ ] **Step 1: Failing tests:** entry choice with software unit first; refusal path (different NAL length / uncovered) → local encode; in-band insertion per unit; single-encoder render output unchanged (bytes or sample-entry + packet hash).
- [ ] **Step 2–4:** FAIL → implement → PASS + full suite, tsc, eslint (11).
- [ ] **Step 5: Real renders** (generated 4K HEVC 1 s GOP + AAC ≤ 20 s, Playwright Chrome): mixed hw/sw full match 4K (both orders), and a Main-profile software unit (`avc1.4d0033`) under a High entry: ffmpeg silent, avcheck clean, frames at joins looked at, Chrome plays to end. Copy 4 frames to `~/Claude Files/handoff/t1-*.png`. If Main-under-High fails in AVFoundation, implement it as "uncovered → encode locally" and say so.
- [ ] **Step 6:** commit `feat(render): join units from different H.264 encoders`.

### Task 2: Portable keys and imported units in the cache

**Files:** `src/render/unitCache.ts` (portable key built alongside `buildReuseKeys`, stored in `UnitMeta.portable`; `importUnit(portable, records, meta)`; lookup `findPortable(portable)`; admission like prepared units), `src/render/transcodeEngine.ts` (on local miss, try portable), `src/components/renderRequest.ts` (footage fingerprint, computed once per source, cached by name+size+lastModified).

**Produces:** `footageFingerprint(file: File): Promise<string>`; `portableKey(...)`; engine diagnostics `Reused N parts prepared on <device>, M encoded here`; `RenderProgress.reused` counts them.

- [ ] **Step 1: Failing tests:** portable key ignores encoder facts and `lastModified`, changes with each real input (overlays, quality, bitrate, footage bytes, RENDER_VERSION); imported unit found on local miss; eviction never removes imported units the current plan uses.
- [ ] **Step 2–4** as above. **Step 5:** commit `feat(cache): portable keys for prepared parts from another device`.

### Task 3: The `.shooot-parts` bundle

**Files:** Create `src/prepare/bundle.ts` (+ test): `buildBundle(projectId): Promise<Blob>` (header + units as a composed Blob), `readBundleHeader(file: File)`, `importBundle(file, onProgress, signal)` (streams each unit into the cache via `importUnit`; refuses other `format`/`renderVersion` for parts, still returns the project).

- [ ] **Step 1: Failing tests:** header round-trip; offsets right; RENDER_VERSION mismatch → parts refused, project returned; cancel mid-import leaves no half unit; no second copy (Blob parts are the OPFS Files — assert by construction).
- [ ] **Step 2–4.** **Step 5:** commit `feat(prepare): prepared parts file`.

### Task 4: Save and load in the UI + round trip

**Files:** Export panel ("Save prepared parts" when the preparer has prepared parts for the open project; size shown; `showSaveFilePicker` else download), `addFiles.ts`/`AddFilesButton`/drop (accept `.shooot-parts`; on iOS `accept` stays omitted), progress + result toast "Loaded N prepared parts from <device>", project replace confirm (reuse `importProject.ts`).

- [ ] **Step 1: Failing tests** for the button's visibility, the file routing, the confirm, the toast.
- [ ] **Step 2–4.**
- [ ] **Step 5: Round trip in Playwright:** context A (touch, Android UA, encoder forced software via the Task 1 switch) loads generated 4K footage, tags a goal, prepares, saves the parts file; context B (desktop, hardware) loads the same footage + the file, edits one more caption, renders full match 4K: diagnostics show reused > 0; ffmpeg silent; avcheck clean; frames at joins looked at. Screenshots 390×844 + 1280×800 dark/light of the button, the load progress, the toast → `~/Claude Files/handoff/t4-*.png`.
- [ ] **Step 6:** commit `feat(prepare): save prepared parts and load them on another device`.

### Task 5: Docs (main session)

- [ ] AGENTS.md: §5 mixed-encoder rule (spike text), "Unit cache" portable keys, "Prepared parts file"; DECISIONS.md entry. Commit `docs: prepared parts handoff`.

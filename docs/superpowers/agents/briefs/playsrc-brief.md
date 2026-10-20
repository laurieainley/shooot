# Brief: Playback LRV / MP4 switch (feat/playback-source)
Worktree: /Users/foundersfactory/code/shooot/.claude/worktrees/playsrc. Dev port 5205. Read docs/superpowers/agents/common-rules.md and follow it (~45 min).
Report: docs/superpowers/agents/briefs/playsrc-report.md (commit it). Screenshots (throwaway): /private/tmp/claude-501/-Users-foundersfactory-code-shooot/0a52fa9f-70d8-4586-bfc1-9526af30e377/scratchpad/playsrc-shots/.
Another agent is changing touch-view gestures/fullscreen (Player.tsx gesture handling, fullscreen.ts, pictureGestures, TagControls lock button) in parallel —
keep your edits to those files minimal and localised (menu entries only) to avoid conflicts.

User approved (2026-10-20): "Add the lrv MP4 switch". Today, when a GoPro MP4 and its LRV proxy are both loaded (`utils/processFiles.ts` pairs them),
playback uses the LRV whenever it's playable (`VideoSourceFile.kind = 'proxy'`, `file`/`url` = LRV, `fullFile` = MP4); when the MP4 is chosen the LRV is
dropped. Exports always use the MP4. Read AGENTS.md §4 Timeline/Import/Projects, §6, types.ts, processFiles.ts, state.ts (files, addFiles, relink),
detectJobs.ts (it snapshots `files.map(f => f.file)` and aborts if they change), fileBadges.ts, filesSummary.ts, the Files sheet, the ⋯ menus (desktop
top bar menu and the touch-view ⋯ menu), matchAutosave/relink paths.

Build:
1. Keep both files for a pair: add `proxyFile?: File` (+ whatever URL caching is needed) so a pair can play either; `fullFile` stays the MP4 for exports.
   Not persisted (File objects); no persist bump. Export plans, ball check, goal-set-up stills keep using the MP4 exactly as now.
2. **Preference** `'lrv' | 'mp4'`, per device in localStorage `shooot-playback` (outside `vhm-state`; wrap in try/catch). Default: LRV on touch
   layouts (phone/tablet), MP4 with a mouse (desktop). Applies to every paired file; unpaired files play as they are.
3. **Switching** swaps the playing source of each paired file (`file`/`url`/`kind`), keeps the current file and time (same duration), keeps events and
   file keys identical (paired files share the GoPro key), revokes URLs it no longer needs. Disabled (with a reason) while a render or Find goals is
   running (detectJobs compares File identity). Undo history unaffected.
4. **MP4 can't play** (probe says not playable, or the player errors on it): fall back to the LRV for that file and show a short toast
   ("This device can't play the MP4 — playing the LRV."). Never leave the player broken.
5. **UI**: a "Playback" choice LRV · MP4 (segmented, ≥44 px on touch) in the touch-view ⋯ menu and the desktop ⋯ menu, and a row in the Files sheet
   with a one-line hint ("LRV plays smoothly and saves battery; MP4 is sharper. Exports always use the MP4."). Only shown when at least one file has
   both. File badges/summary reflect what's playing.
6. "Preview in player" follows the playing source automatically — verify.
TDD: pure helpers (default by layout, applying a preference to a file list, fallback), state switch keeps time/keys/events, disabled while busy,
UI shows only with pairs. Generate a GoPro-like pair in your scratchpad (GX010042.MP4 1080p + GL010042.LRV 480p of the same 20 s content, ≤ 30 s;
delete after) and screenshot: touch 844×390 ⋯ menu with Playback, 390×844 Files sheet row, desktop 1280×800 menu; play each source and show the
resolution changes (e.g. `video.videoWidth` in the report). Propose AGENTS.md/DECISIONS.md text. Do not merge/push. Stop your dev server.

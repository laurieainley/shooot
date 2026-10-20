# Brief: touch view — landscape fills the screen, picture gestures simplified (fix/tag-view-landscape)
Worktree: /Users/foundersfactory/code/shooot/.claude/worktrees/tvfs. Dev port 5204. Read docs/superpowers/agents/common-rules.md and follow it (~40 min).
Report: docs/superpowers/agents/briefs/tvfs-report.md (commit it). Screenshots (throwaway): /private/tmp/claude-501/-Users-foundersfactory-code-shooot/0a52fa9f-70d8-4586-bfc1-9526af30e377/scratchpad/tvfs-shots/.
Read AGENTS.md §7 "Touch view", "Find goals on touch", "Touch fullscreen", "Picture gestures"; src/components/fullscreen.ts, fullscreenUi.ts, Player.tsx,
TagControls.tsx, pictureGestures.ts, utils/tagView.ts.

User (Android phone, after Phase 2): "Switching to landscape should auto full screen. Sometimes end up in non full screen mode which then means scrubber
bar is overlapping buttons on left. Remove play on tap as we now have play pause explicit button. Double tap shouldn't end full screen and I think given
the explicit buttons remove double tap to rewind and jump forward on sides of player."

Do (touch view only, i.e. `useTagViewMode() !== 'off'`; desktop/mouse unchanged — prove with 1280×800):
1. **Turning a phone sideways fills the screen automatically.** Browsers need a user gesture for the Fullscreen API, so: when the layout becomes a
   landscape phone with a video loaded, switch the player to the CSS full-viewport mode at once (the existing `immersive` state / `.player-container--immersive`),
   and on the next pointerdown anywhere request real fullscreen (`fullscreen.ts` helpers; ignore a refusal and stay immersive). Rotating back to portrait
   leaves both (exit real fullscreen, clear immersive) unless the user had entered fullscreen explicitly in portrait (keep it simple; document what you chose).
   Android Back / the exit control still leave it. Don't fight the user: if they explicitly exit fullscreen while landscape, stay out until the next rotation.
2. **No overlap in any landscape state**: the overlay timeline must never overlap the left/right clusters (in or out of fullscreen/immersive, 844×390 and
   915×412, also 740×360). Fix the positioning so the clusters sit above the timeline's touch area.
3. **A tap on the picture only shows/hides the controls** (no play/pause) in the touch view. Remove the playback Lock button and its triple-tap glow in
   the touch view (it existed only to stop tap-to-play); keep whatever desktop has.
4. **No double-tap actions in the touch view:** double tap must not exit/enter fullscreen (video.js's own dblclick → fullscreen toggle must be off there)
   and the left/right double-tap ±seek zones are removed in the touch view. Pinch zoom / one-finger pan when zoomed / wheel stay.
5. Update copy/aria that mentions tap to play, double-tap or the lock (touch view). Update AGENTS.md text proposals in your report (Touch fullscreen, Touch view,
   Picture gestures).
TDD: helpers/state for auto-immersive on landscape + exit rules; tap → controls only; no dblclick fullscreen; no seek zones in touch view; desktop
unchanged (tap still plays, double-click still fullscreen if that's current desktop behaviour). Screenshots touch + Android Chrome UA: 844×390, 915×412,
740×360 (immersive and real fullscreen), 390×844, 834×1194; 1280×800 desktop; dark. Simulate rotation in Playwright with `page.setViewportSize`.
Do not merge/push. Stop your dev server.

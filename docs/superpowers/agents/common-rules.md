# Common rules for this batch
- Work ONLY in your worktree (given in your brief). Do not merge or push. Do not edit AGENTS.md, CLAUDE.md, DECISIONS.md — put proposed text in your report.
- Read AGENTS.md (§4, §7 incl. Editor layout, §8). Use the `shooot-brand` skill before UI/copy work.
- Lime = primary action or goal only (lime guard test stays green, don't widen it); colours via `--sh-*` tokens; ≥44px touch targets; ≥14px text on touch (restate in the `pointer: coarse` block at the end of App.css if a base rule overrides); contrast `node scripts/check-contrast.mjs`; reduced motion.
- TDD: red test first for behaviour/logic; update tests whose labels change; never delete coverage or weaken a test.
- Checks (exit codes) before finishing: `npm run test:run`, `npx tsc -b --noEmit`, `npm run build` (if it fails only on `public/default-video.mp4` that's a local symlink — say so), `npx eslint . --ignore-pattern '.claude/**' --ignore-pattern 'spikes/**'` (baseline 11 problems; add none).
- Browser: `npx vite --port <your port> --strictPort` in your worktree, in the background writing to a log (never 5174). Playwright + Chrome (`channel: 'chrome'`, `ignoreHTTPSErrors: true`; touch contexts `hasTouch` + `isMobile`; for Android behaviour set an Android Chrome userAgent). Put scripts in your own folder under the scratchpad and symlink <scratchpad>/pw2/node_modules into it (ESM ignores NODE_PATH). Seed `vhm-state` with `addInitScript` (check `version:` and the shape in `src/state.ts`). Test media: generate your own with ffmpeg in your scratchpad folder (≤ 30 s, 720p; a GoPro-like pair = `GX010042.MP4` 1080p + `GL010042.LRV` 480p of the same content if you need proxy pairing; goal-like shapes help). Never search the user's home/Downloads/camera folders. Delete media > 5 MB when done.
- Screenshots: LOOK at every one. Dark + light.
- Time budget about 30–40 minutes. Stop at a clean green commit; leftovers go in the report. Stop the dev server and any background command before finishing. Never dispatch subagents.
- Commit trailers:
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_013AvURaxZsZUomPaVjxSBhV
- Report: full report to the file named in your brief (files, red→green, checks + exit codes, screenshots looked at and what you saw, AGENTS/DECISIONS text, what needs a real device). Return only status, commits, one-line tests, concerns.

Scratchpad (throwaway output only: screenshots, logs, test media): the path given in your brief. Rules and briefs live in docs/superpowers/agents/.

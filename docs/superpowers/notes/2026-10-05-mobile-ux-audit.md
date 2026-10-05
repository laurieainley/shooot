# Mobile UX audit — 2026-10-05 (branch `feat/mobile-polish`)

**Method.** Headless system Chrome (`channel: 'chrome'`) via Playwright, `hasTouch` + `isMobile` on phones, dev server on :5184.
Viewports: 390×844 and 412×915 portrait, 844×390 and 915×412 landscape, 1440×900 desktop. Media: two 90 s HEVC
(hvc1) 1080p 30000/1001 keyint-30 files `GX010001.MP4` / `GX020001.MP4` with AAC tone, plus matching H.264 768×432
`GL0x0001.LRV` proxies. Harness: `scratchpad/ux/` (`audit.cjs` full walk, `lib.cjs` generic checks, plus focused
scripts `fs2.cjs` fullscreen, `swipe.cjs` scroll trap, `kb.cjs` keyboard, `bar.cjs` top bar, `sheet.cjs`, `ms.cjs`).

**Generic checks on every key state** (`lib.cjs › audit`): no horizontal page scroll; no page scroll where the layout
promises none (landscape, desktop); no interactive element partly off-screen; touch targets ≥ 44 px; visible text
≥ 14 px on touch. Screenshots: `scratchpad/design/ux-<viewport>-<nn>-<step>.png` (20 per phone viewport).

**Flows walked on each viewport:** empty state → load LRVs (loading indicator) → switch files → Files sheet → Match
setup (names, rosters, kick-off "use current time", matchday, initials, logo) → tap play/pause, double-tap seek, zoom
to 4×, touch scrub (one seek on release) → mark all 8 event types with team / person / note via ＋ (G + keys on
desktop) → Cancel, duplicate guard → score badge, running scores, strip dots → edit afterwards (sheet on touch, N/E
on desktop), replay toggle, undo / redo, delete + undo → fullscreen + ＋ → Export: Preview in player (clip 1, replay
at 0.5×, Exit) → Preview reel (LRV, graphics on) + download → ⋯ menu: New match confirm/Keep, Advanced settings,
Paste list, Export project → New match → Import project. Full-quality render (attach GX MP4s, graphics off) on
desktop and 390×844.

**Final result:** 0 failures on all five viewports (see "Counts" below).

## Findings

| # | Issue (viewport) | Fix | Evidence |
|---|---|---|---|
| 1 | 915×412 landscape got the desktop bay (file pills, key hints, no ＋, picker as a desktop popover with Done/Cancel cut off) | Layout chosen by `(orientation: landscape) and (max-height: 500px)` before width: `useLayout()` → `shell--landscape` | `ux-l915-b-picker.png` (before), `ux-l915-10-log.png` |
| 2 | 844×390 stacked like portrait: page scrolled (716 px), log below the fold, ＋ over the picture | Side-by-side bay: video + strip left, event log in its own scrolling rail, 44 px top bar, ＋ in the rail, one-line reel summary | `ux-l844-02-loaded.png`, `ux-l844-10-log.png` |
| 3 | Landscape picker covered the video | Picker is a side sheet exactly over the rail (video stays visible); Done/Cancel pinned | `ux-l844-08-picker.png` |
| 4 | Touch users could not change a note/person/type after marking | Tap a row → edit sheet (type, team, person + roster chips, note, ±1 s, replay, Delete, Watch, Done); shared pure helpers with the picker | `ux-p390-11-edit-sheet.png`, `ux-l915-11-edit-sheet.png` |
| 5 | Two add buttons on touch (＋ and "+ Event") — user feedback | "+ Event" only with a fine pointer | `ux-p390-10-log.png` |
| 6 | Row × was redundant on touch and pushed landscape rows 7 px off-screen | Delete lives in the edit sheet (undo-able); landscape rail `clamp(260px, 36vw, 340px)` (video is height-limited there, so no picture lost) | `bar.cjs` widths 575–851 → 541–844 |
| 7 | Fullscreen button "doesn't work" on Android — user feedback. Control bar is hidden before the first play, and while playing the idle bar has `pointer-events: none`, so the first tap only wakes the controls | Always-visible fullscreen button over the picture on touch (control bar's hidden), `requestFullscreen({ navigationUI: 'hide' })` synchronously in the tap; Exit next to the speed buttons | `fs2.cjs`: hittable via `elementFromPoint` before play and while idle at 390/412/844/915; enter, exit, re-enter after rotation |
| 8 | No fallback when fullscreen is refused / unavailable (iPhone) | Immersive CSS mode (fixed full viewport, Esc/Exit leaves); unit-tested fallback logic (reject, throw, no API) | `ux-l844-immersive.png`, `fullscreen.test.ts` |
| 9 | Header takes picture space — user feedback | Landscape: ⌃ folds the bar away (remembered), small tab on the picture's top edge brings it back; portrait: bar slides away scrolling down, returns on scroll up | `ux-l844-bar-collapsed.png`, `bar.cjs` (video 535×301 → 613×345) |
| 10 | Zoom capped at 2× — user feedback | Pinch continuous to 4× (rests where released), Z cycles 1 → 1.5 → 2 → 3 → 4 | `ux-*-06-zoomed.png`, zoom tests |
| 11 | Scroll trap: a swipe starting on the video did not scroll the page — user feedback | `touch-action: pan-y` on the portrait video when not zoomed / fullscreen (control bar keeps `none`); landscape has no page scroll by design | `swipe.cjs`: control (old CSS) stays at scrollY 80, fix scrolls to 0; double-tap still seeks +5 s |
| 12 | On-screen keyboard covered the picker's text step and sheets' inputs / Done | `visualViewport` → `--kb` on `<html>`; sheets and picker sit above it; focused field scrolls clear of sticky head/actions (`scroll-padding`); sheet title hidden while the keyboard is up | `kb.cjs` (emulated 336/360/200/210 px keyboards, field and Done hit-tested); control run with `--kb: 0` fails all 4 |
| 13 | Lower thirds small on a phone (label 26 px tall at 768×432) | 1.4× (`LOWER_THIRD_SCALE`), base bar inside 5 % title-safe; tests for 768×432 legibility and long-name squeeze | `ux-lowerthird-lrv-15.5.png`, `ux-lowerthird-hevc-note.png` (rendered reels, ffmpeg decode clean) |
| 14 | Text under 14 px all over touch screens (11–13 px buttons, tags, summaries, Export hints, strip names) and 40 px buttons | One coarse-pointer rule set: 14 px minimum, 44 px buttons and fields (16 px inputs) | generic audit, all phone viewports |
| 15 | Match setup: 30 px fields, 32 px kit swatches; Files rows 40 px; Advanced settings 30 px fields, 13 px checkbox, 13 px legends | 44 px fields; swatches 44 px targets drawn as 32 px dots in one row; toggle row for the offset checkbox | `ux-p390-match-setup-top.png`, `ux-p390-18-settings.png` |
| 16 | Swatch fix first rendered as filled 44 px discs with a ring (inline `background` shorthand reset `background-clip`) | `background-clip: padding-box !important` | `ux-p390-match-setup-top.png` |
| 17 | "Preview" strip label overlapped the first file name in portrait | Wider label column, 14 px accent label, no wrap | `ux-p390-14-preview.png` |
| 18 | Landscape: floating preview bar squeezed ← / → to 31–37 px | Preview bar buttons never shrink | `ux-l844-14-preview.png` |
| 19 | Landscape log truncated labels ("Penalty missed · Sa…") | Labels wrap to two lines as in portrait | `ux-l844-10-log.png` (rerun) |
| 20 | Landscape sheets capped at 560 px wide → lots of scrolling at 390 px tall | Up to 780 px wide on short screens | `ux-l844-04-match-setup.png` |
| 21 | Console `ERR_FILE_NOT_FOUND` on every file load | Probe aborts its `<video>` fetch (`load()`) before revoking the blob URL | audit "no console errors" on all viewports |
| 22 | Accidental double G / double tap made duplicate events silently (ideas.md) | Picker warns "Goal already marked 2 s earlier · Cancel if this was a double tap" | `ux-*-09-duplicate.png` |

## Counts (final runs, after all fixes and the merge of main 899dca2)

| Viewport | Checks | Failed |
|---|---|---|
| 390×844 portrait (incl. attach GX + full render, graphics off) | 97 | 0 |
| 412×915 portrait | 92 | 0 |
| 844×390 landscape | 106 | 0 |
| 915×412 landscape | 106 | 0 |
| 1440×900 desktop (incl. full render, graphics off: 2 s) | 70 | 0 |

Focused scripts: `fs2.cjs` 56/56, `kb.cjs` 8/8 (control with the fix disabled: 0/4), `swipe.cjs` 2/2 (control
stays stuck), `bar.cjs` 26/26. Unit/component tests 476 → 549 (68 → 74 files); tsc clean; lint 19 = baseline.
One preview-reel render timed out (300 s) while two audit browsers rendered at the same time; it passed alone.

## Not changed / notes

- Scrub bubble shows file time while the strip label shows match clock (when a kick-off is set) — both correct for
  their context, but could be unified.
- Landscape ⋯ menu scrolls inside (8 items in 390 px); fine but could be denser.
- `Share` appears where `navigator.canShare({ files })` is true (it is in headless Chrome); untested on device.
- `interactive-widget=resizes-content` deliberately not used: the page layout would reflow when the keyboard opens.

## Needs a real device

- Android Chrome: fullscreen button (enter, exit, rotate, re-enter), orientation lock, nav bar hidden.
- Keyboard: picker text step and edit-sheet note above the real keyboard in portrait and landscape.
- Portrait swipe-to-scroll starting on the video; pinch zoom from 1× (with `pan-y`, a pinch that starts as a vertical
  drag may be taken by the page).
- Landscape: folded top bar tab reachable under the status bar / notch; ＋ position for thumbs.
- iPhone: immersive mode instead of fullscreen.
- Lower thirds on a real reel on the phone and on YouTube.

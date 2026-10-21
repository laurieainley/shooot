# Report: Export sticky tabs + Share on YouTube steps (feat/export-share)

## Changes
- `src/components/ShareSteps.tsx` (new): ordered list, three steps (Upload the video / Paste the description / Add a thumbnail), used by both Export tabs.
- `YouTubeUpload.tsx`: "Upload to YouTube ↗" with an inline official YouTube play-button SVG (#FF0000 + white triangle, no request); same href/target/rel; old hint dropped.
- `DescriptionCopy.tsx`: buttons + "Times are estimates until you render." / "copied" status split into `.share-step__actions` and `.share-step__note`. Behaviour unchanged.
- `ExportPanel.tsx`: uses `ShareSteps`; disclosure summary now "upload, description and thumbnail" order.
- `App.css`: `.export-tabs` sticky at `top: 45px` (below the drawer title bar, which is itself sticky at 0; the whole `.floating` is the scroller) with `--sh-raised` background; `.share-step*` styles; touch/narrow wraps buttons under the label, indented.
- Tests (`ExportPanel.test.tsx`): link name updated; new tests for the three steps on both tabs (labels, YouTube icon, old hint gone) and the sticky tablist CSS rule.

## Checks
- test:run: 241 files / 2744 tests passed (exit 0, run before the last CSS tweak; ExportPanel/DescriptionCopy/limeUsage re-run green after).
- tsc exit 0; build exit 0; eslint 11 problems (baseline, none added); check-contrast exit 0.
- Lime guard / colour allow-lists: no change needed (the red is an inline SVG attribute, not CSS).

## Screenshots looked at
Playwright against a generated 12 s clip, dark + light, both tabs: 1440x900, 1280x800, 390x844 touch, 834x1194 touch. Step layout correct: step 1 and 3 buttons right-aligned on one row on desktop; step 2's two buttons sit under their label (420px drawer is too narrow for both); touch layouts wrap under the label, indented. Scrolled desktop view confirmed the tabs stay pinned directly under the title bar. Not screenshotted: the thumbnail maker in its open state (full-width rule `.share-step__actions--maker:has(.thumb-maker)` untested visually), and the buttons enabled with events (copy feedback unchanged in code, covered by tests).

## Concerns
- `top: 45px` is hard-coded to the title bar height (45px measured on desktop and touch); if that bar changes, update it.
- Thumbnail maker open state layout unchecked visually.

## Proposed AGENTS.md text (Editor layout, Export)
Replace the Share on YouTube bullet's first sentence with: "**Share on YouTube** (both Export tabs): three numbered steps (`ShareSteps`): 1 Upload the video (quiet "Upload to YouTube ↗" link with the inline YouTube play icon, youtube.com/upload in a new tab; no API, nothing sent until the user uploads there), 2 Paste the description (Copy description / Copy goalscorers; "Times are estimates until you render."), 3 Add a thumbnail (Make a thumbnail)." And in the Export bullet: "the Highlights / Full match tablist is sticky under the drawer title bar (`.export-tabs`, top 45px)."

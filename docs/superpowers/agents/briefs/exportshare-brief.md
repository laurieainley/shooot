# Brief: Export panel — sticky tabs + Share on YouTube as three steps (feat/export-share)
Worktree: /Users/foundersfactory/code/shooot/.claude/worktrees/exportshare. Dev port 5210. Read docs/superpowers/agents/common-rules.md and follow it.
Report: docs/superpowers/agents/briefs/exportshare-report.md (commit it). Scratch: /private/tmp/claude-501/-Users-foundersfactory-code-shooot/0a52fa9f-70d8-4586-bfc1-9526af30e377/scratchpad/exportshare/.
Another agent is changing src/graphics/** (cards) — don't touch graphics.

## User request (2026-10-21)
> "In export highlights/full match needs to stay tethered to top so you can see where you are when scrolling down."
> "The 4 buttons under Share to YouTube just look messy… Upload to YT use YT logo?"
Agreed design (approved by the user):
```
Share on YouTube
 1  Upload the video        [▶ Upload to YouTube ↗]
 2  Paste the description   [Copy description] [Copy goalscorers]
    Times are estimates until you render.
 3  Add a thumbnail         [Make a thumbnail]
```

## Build
1. **Sticky tabs:** in the Export drawer (`ExportPanel.tsx`, `FloatingPanel variant="drawer"`) the Highlights / Full match tablist stays pinned at the top of the scrolling area while the content scrolls (`position: sticky` on the tablist with the drawer's background behind it, a hairline/shadow only once scrolled if cheap). Works on desktop drawer, the phone full-screen drawer and the 480px tablet drawer. The panel title bar stays as it is.
2. **Share on YouTube** (both tabs; `DescriptionCopy`, `ThumbnailMaker`, `YouTubeUpload`): an ordered list of three steps — small step number, plain label, buttons right-aligned on desktop widths (wrap under the label on narrow/phone). Keep existing behaviour of every button (copy feedback, thumbnail maker opening, the link opens youtube.com/upload in a new tab with rel noopener). Upload button: "Upload to YouTube ↗" with the official YouTube play-button icon as an inline SVG (red rounded rectangle #FF0000 + white triangle — the icon itself, unmodified; no wordmark, no network request). Keep the hint "Times are estimates until you render." under step 2; drop "Upload the MP4 there, then paste the description." (the steps say it). Full-match tab labels: whatever DescriptionCopy shows there today, same pattern.
   - Lime stays only for primary actions: these are quiet buttons (`btn-quiet`). The YouTube red is the YouTube logo, not a Shooot colour — add it to the lime/colour guard allow-lists only if a test complains, and say so.
   - ≥44px targets on touch, text sizes from the type tokens.
3. Tests: update/extend component tests (ExportPanel / DescriptionCopy / YouTubeUpload) for the step labels, link href/target/rel, and that the tablist has the sticky class/style if testable.

## Verify
Checks per common-rules. Screenshots (look at them): 1440×900 and 1280×800 desktop (scrolled to the Share section with tabs visible), 390×844 touch, 834×1194 touch, dark + light, both tabs. Do not merge or push. Propose AGENTS.md text (Editor layout → Export / Share on YouTube) in the report.

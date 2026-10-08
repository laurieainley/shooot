## Brand

All UI, copy and rendered video graphics follow `brand/shooot/BRAND.md` (skill: `shooot-brand`).
- Use the CSS variables in `brand/shooot/tokens.css` (`--sh-*`), never hard-coded hex values.
- Red (`--sh-rec`) is only for the REC dot (live/now/record); goals are lime.
- Lime is never text on light backgrounds (use `--sh-lime-text`).
- Player names and numbers use the shirt font (Big Shoulders); everything else is Archivo; clocks are JetBrains Mono.
- Keep the product name in one config constant and the logo in `brand/shooot/assets/`, so a rename is a one-line change.

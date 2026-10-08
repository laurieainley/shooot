# Shooot brand kit v1

Drop this folder into the repo (suggested path: `brand/shooot/`).

| File | What it is |
|---|---|
| `BRAND.md` | The brand guide: voice, logo, icon, colour, type, components and motion rules. **Claude Code should read this before any UI work.** |
| `tokens.css` | CSS variables (dark default, light via `[data-theme="light"]` or the OS setting) plus small helper classes. |
| `tokens.json` | The same tokens as data, for scripts and the video renderer. |
| `tailwind.preset.js` | Tailwind preset that maps to the CSS variables. |
| `motion.css` | Net bulge, logo shout and scorer pulse animations (reduced-motion safe). |
| `preview.html` | Open in a browser to see everything working. |
| `assets/` | Outlined SVG wordmarks, S. app icons, favicons and PNG exports. |

## Wire it up

1. Import `tokens.css` and `motion.css` once, globally (or add the Tailwind preset).
2. Copy `assets/favicon.svg`, `favicon.ico` and `apple-touch-icon.png` to the public root and add the `<link>` tags from BRAND.md.
3. Add this to the repo's `CLAUDE.md`:

```md
## Brand
All UI, copy and rendered video graphics follow `brand/shooot/BRAND.md`.
Use the CSS variables in `brand/shooot/tokens.css` (`--sh-*`) — never hard-code hex values.
Red (`--sh-rec`) is only for the REC dot (live/now/record); goals are lime.
Lime is never text on light backgrounds (use `--sh-lime-text`).
Player names/numbers use the shirt font; everything else is Archivo.
```

Fonts load from Google Fonts (Archivo, Big Shoulders Display, JetBrains Mono). Self-host them if the renderer runs offline.

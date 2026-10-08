# Shooot landing page + waitlist

Static, no build step. Deploy the folder as-is (Vercel, Netlify, Cloudflare Pages).

- `index.html` — landing page
- `join.html` — waitlist sign-up (name + email). `join.html?role=organiser` switches copy for league organisers.
- `tokens.css`, `motion.css`, `assets/` — copied from `brand/shooot/` (keep in sync, or point the links there).

## Wiring the form (currently design-only)
Set `data-endpoint` on `<form id="waitlist">` in `join.html` to a URL that accepts
`POST application/json {name, email, role}` and returns 2xx. With no endpoint, the form
validates and shows the success screen without sending anything.

Before going live: add a privacy notice link next to the form (UK GDPR) and replace
`shooot.[domain]` placeholders/OG image as needed.

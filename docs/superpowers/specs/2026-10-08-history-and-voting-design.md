# Match History, Cross-Game Reels & Goal-of-the-Season Voting — Design draft (Sub-project W)

**Date:** 2026-10-08 · **Status:** draft, open questions marked ❓
**Source:** user — log and store games' records (cheap small DB on Vercel); past games next to the events log; later, highlights across games (a player's highlights, goal of the season); a share link where people vote once without full login.

## Shape of the system

```
Browser app (today)                     Vercel (new)                         Object storage (new, optional)
  edit events locally  ──save──▶  /api/* serverless functions  ──▶  Postgres (Neon via Vercel Marketplace)
  render reels locally ──upload clip──────────────────────────────▶  clips/  (R2 or Vercel Blob)
  vote page (public)   ◀──────── /v/:pollId ─────────────────────── poll + clip URLs
```

- **Video never has to go to the server for history itself.** A game record is metadata (teams, rosters, events, kick-off, settings, file keys): a few KB.
- **Cross-game reels and voting need video someone can reach later**, because the original files sit on an SD card or a laptop. That's the one real cost/complexity decision (❓1).

## Data model (Postgres)

- `squad` (id, name, created_at, edit_secret_hash) — the group whose games these are (e.g. "Thursday 5s"). One for now; multi-squad ready.
- `season` (id, squad_id, name, starts_on, ends_on).
- `player` (id, squad_id, name, aliases[]) — de-duplicated across games (roster names map to players; "Sam L" = "Sam Lowe").
- `game` (id, squad_id, season_id, played_on, title/matchday, team1, team2 (name, kit colour, initials), score1, score2, kickoff/half/final markers, settings JSON, source_files JSON (name, size, duration, key), created_at, updated_at).
- `event` (id, game_id, type, team, player_id, assist_player_id, match_minute, match_time_sec, note, replay settings, crop) — mirrors MatchEvent.
- `clip` (id, event_id, url, duration_sec, width, height, bytes, created_at) — only if clips are stored (❓1).
- `poll` (id, squad_id, title, closes_at, mode, created_by) + `poll_option` (poll_id, clip_id / event_id) + `vote` (poll_id, voter_key, option_id, created_at, UNIQUE(poll_id, voter_key)).

## App changes

- **Events column gets a "Games" tab** next to "Events": list of past games (date, teams, score, goals), search/filter by season/player. Opening one loads it into the editor (read-only until "Edit", then saves back). The current game autosaves to history once it has a Kick off or any event (debounced), and still works offline (local first, sync when online).
- **Season/player views:** goals per player, assists, own goals — derived from events (cheap, and the "match stats" the brand positioning promises).
- **Highlights packages across games** ("Build a reel"): pick by filter — player, event type, season, date range — or hand-pick events; order; render as one reel with the current theme (captions show the game/date). Needs the clips (❓1).
- **Goal of the season:** from a package, "Start a vote" → poll with a share link `shooot…/v/<id>`; page shows each clip (autoplay muted, tap for sound) and a Vote button; results after voting or at close; organiser sees live counts and can close.

## Access & identity (no full login)

- **Editing history:** the squad has a secret edit link (capability URL) stored on the organiser's devices; anyone with it can add/edit games. Optional later: a passkey for the organiser.
- **Voting once — recommended: the roster is the electorate.** The squad's players are already known. The vote link asks "Who are you?" (roster names), then a one-tap vote; each name can vote once per poll, the device remembers it, and a name already used shows "Already voted — not you? Tell the organiser" (organiser can reset). Trust-based, zero cost, zero sign-up, works perfectly for a friend group of 10–30 who all know each other.
  - Optional hardening, still no login: per-player personal vote links (the organiser taps "Send links" and shares each player's unique link in DMs/WhatsApp) — one vote per link, unforgeable, still no codes.
- **For public polls (beyond the squad):** email magic link (Resend free tier ~3k emails/month) — one vote per verified email; or "Sign in with Google" one-tap. SMS codes are the strongest per-person signal but cost ~4–8p per text and need a provider (Twilio/Vonage) and abuse protection — only if public polls get gamed.
- Rate-limit by IP + device token on every vote endpoint; votes are stored with a hashed voter key, never raw emails/phones in poll results.

## Costs (to confirm against current pricing before setup)

- Postgres (Neon free tier via Vercel Marketplace): fine for years of five-a-side metadata.
- Vercel Functions on Hobby: fine at this scale (note Hobby is for non-commercial use).
- Clips (❓1): 1080p clip ≈ 10–20 MB each (with replay); a season of ~20 games × ~15 events ≈ 3–6 GB. Cloudflare R2: free tier 10 GB storage, no egress fees → effectively free for a season or two; Vercel Blob also works but bills transfer, which matters once a vote link is watched a lot.
- Email (if used): free tier. SMS (if used): pay per text.

## Overlay themes (decided, in progress)
Graphics are a theme registry (`src/graphics/themes/`): "Shooot" (brand pack, default) and "Classic" (the current look), chosen in Export → Graphics and stored with the project. Season reels use the chosen theme too.

## Phasing
1. W1 History: DB + API + squad edit link + Games tab + autosave/load + per-player stats (no video).
2. W2 Clips: optional "Save clips to history" on render (upload each event's clip, 1080p) + cross-game reel builder.
3. W3 Voting: polls, vote page, roster-claim voting (+ personal links), results.
4. Later: email magic link / Google for public polls, padel/tennis.

## Open questions
- ❓1 Where do clips live for cross-game reels and voting? (a) upload 1080p clips per event to R2 when rendering; (b) metadata only, re-attach original files when building a season reel (no vote page possible without hosting); (c) YouTube unlisted per reel and vote on YouTube links.
- ❓2 Voting identity: roster claim (+ optional personal links) vs email magic link vs SMS.
- ❓3 Who edits history: secret squad link vs organiser-only (passkey).
- ❓4 4K sources: clips stored at 1080p means a re-encode in the browser per clip (slow on older Macs); alternative: store the LRV/proxy-quality clip (no re-encode, lower quality) or re-encode on a faster machine.

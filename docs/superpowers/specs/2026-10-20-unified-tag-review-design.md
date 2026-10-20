# Unified tag & review (video first on touch) — design

Date: 2026-10-20 · Status: approved (user: "Just build it", 2026-10-20) · Prototype: `docs/superpowers/prototypes/review-tag-prototype.html`
(published privately at https://claude.ai/artifact/6Bm3A4aGa9jksRsP6QaG9y)

## Why

Testing on an Android phone (2026-10-20) showed the phone experience works against the job: in landscape fullscreen the Find goals
review covered half the picture and half of the ＋; tagging and reviewing are two different interfaces (the ＋ / Tag event box, and the
Find goals card with its own mini timeline, Mark moment, lanes and Previous/Next) for what is really one job — look at a moment, say
what happened. The user asked for one interface, video first, built around where thumbs are on a landscape phone.

## Decisions (user, 2026-10-20)

1. **Principle: on phones and tablets the video gets the space.** In landscape the picture is full screen; controls float over it
   and fade while playing; interface items are minimal, narrow and short; overlays rather than fixed panels. Zoom stays important.
2. **One Tag button** replaces both the ＋ (Tag event) and Mark moment.
3. **Find goals is suggestions on the main timeline**: found moments are rings on the one timeline; jump to the previous / next one,
   tag it or discard it there. No separate review card on touch.
4. **Tag pauses** and asks the questions straight away (option A). A "quick tag" that keeps playing may come later.
5. **Thumb zones on a landscape phone:** left thumb moves around, right thumb acts. The most used buttons are lowest (easiest
   reach): bottom row ⟲5 · Play · ⟳5, then frame ‹ ›, then ◀ found / found ▶ on top.
6. **Names stay put.** Person choices are a compact two-column grid anchored at the bottom of the column (next to the thumb), A–Z,
   and never move between questions: on Assist the scorer stays in place, greyed out; a name added with "+ New name" goes at the
   end for this match (A–Z again next time), so nothing reorders while tagging.

7. **A phone held sideways is this layout** (no top bar, no rail; events list, Match setup, Export, Files, Matches in ⋯), in
   and out of fullscreen. Portrait keeps today's page with the new player band. (Accepted proposal.)
8. **No replay loop:** jumping to a found moment starts 6 s before it; ⟲5 replays. (Accepted proposal.)

## The layout (landscape phone; tablet landscape the same with larger targets)

```
┌──────────────────────────────────────────────────────────────┐
│ WH 1-0 CO 12:34                          ★ 6 found · AI   ⋯ │  top: scorebug left; status + menu right (fade)
│                                                              │
│  ◀found        found▶                                ┌─────┐ │
│  ‹ frame        frame ›                              │ TAG │ │  right thumb: Tag (lime, 76 px)
│  ⟲5     ▶/❚❚     ⟳5          ★ Top pick · 3 of 7     └─────┘ │  left thumb, most used lowest
│                                                [✕ Not a goal]│  only on a found moment
│ ──○─────●────○──────●──────○──────────────────────────────── │  the one timeline (thin, scrub anywhere)
└──────────────────────────────────────────────────────────────┘
```

- **Picture:** full bleed (contained 16:9; letterbox bars hold the controls on long phones). Tap shows / hides controls; controls
  fade 3 s after the last touch while playing; never while paused or tagging. Pinch zoom 1–4×, one-finger pan when zoomed, a zoom
  chip ("2.0× · reset") top right while zoomed. The playback lock and double-tap seek keep working.
- **Left cluster** (48 px buttons, 8 px gaps, bottom-left above the timeline): bottom row ⟲5 · Play (solid, light) · ⟳5; middle
  frame ‹ ›; top ◀ found · found ▶ (disabled when there is none that way). Frame steps also nudge the moment while tagging.
- **Right cluster:** Tag (lime, 76 px round) at the right edge, lower half; "✕ Not a goal" under it only while the playhead is on
  a found moment.
- **Timeline:** the existing match strip, restyled as a thin overlay along the bottom (44 px touch height): events (goal icons
  lime, others chalk), Kick off / Half time / Final whistle flags, found-moment rings (lime = top pick), red playhead, time bubble
  while scrubbing that names the symbol under the finger (as today).
- **Top right:** a Find goals chip (start / progress / "6 found · 3 top picks"), the zoom chip, and ⋯ (Events list, Match setup,
  Export, Files, Matches, exit fullscreen). Scorebug top left as today.
- **Found moment chip** (read-only, bottom centre): "★ Top pick · 3 of 7 · 12:34" while the playhead is within the moment's window.

## Tagging (one hand)

1. **Tag** pauses and stamps the playhead time. The frame buttons nudge it; the time shows as the first breadcrumb.
2. A **column slides in from the right edge** (`min(36vw, 320px)` landscape; a bottom sheet ≤ 62% in portrait), translucent dark,
   choices anchored to its bottom. One question at a time:
   - **What happened?** two-column grid: Goal · Pen goal · Own goal · Save · Foul · Highlight · More… (penalty conceded / missed,
     Kick off, Half time, Final whistle).
   - **Team:** two big buttons in kit colours (question wording per type: "Who scored?", "Whose player put it in?" for own goals,
     "Whose keeper?").
   - **Scorer / Goalkeeper:** the roster grid (decision 6) + a last row "+ New name" field (the only keyboard) and Skip.
   - **Assist** (goals): same grid, scorer greyed, last row "+ New name" and None.
   - Foul / Highlight / markers finish after the team (or straight away for markers).
3. **Breadcrumbs** at the top of the column ("12:34.6 · Goal · Whites · DJ"): tap one to change that answer.
4. Done: the column slides away; toast top-left under the scorebug: "Goal · Whites · DJ · 12:34" with Undo and Add note (opens the
   edit sheet with the note focused, as today). ✕ on the column cancels.
5. Tagging inside a pending found moment's window confirms it (today's rule, `SuggestionReview`: a tag inside the loop confirms).

## Find goals on the timeline

- **Start:** the Find goals chip opens the existing start form (Kick off / Final whistle range, Advanced detection with Labs) as a
  short sheet. While it runs: chip shows progress, a thin progress line on the timeline; found moments appear as rings.
- **Review = watching:** ◀ found / found ▶ jump to 6 s before the moment and play. Jump order is match order through pending
  moments (top picks are lime; no separate lanes). On a moment: the chip, Tag, and ✕ Not a goal.
- **Not a goal:** rejects the suggestion (undoable toast) and jumps to the next pending moment.
- **Done:** chip reads "All found moments checked" plus the existing summary line ("You kept 4 of 6"), the known-final-score gap
  line stays where it is today (chip / summary).
- **Removed on touch:** `SuggestionCard` (mini timeline, Mark moment, lanes, Previous/Next), the Review (N) fullscreen button,
  the rail "Review moments" button (replaced by the chip and the rings).

## Portrait phone

Video at the top, full width; under it the timeline, the left cluster and Tag in one band; the column becomes a bottom sheet with the
same bottom-anchored choices. A one-off tip: "Turn sideways for a bigger picture" (exists). Controls never fade in portrait (they
are not over the picture).

## Where it applies

- **Phase 1–2: touch layouts** — phone portrait/landscape and tablets, in fullscreen and in the immersive landscape-phone view.
  **Decided (7):** on a phone held sideways the editor *is* this layout (no top bar, no rail; the events list and the rest
  live in ⋯), since that is where tagging happens; portrait keeps today's page with the new player band.
- **Desktop:** unchanged in phases 1–2 (keyboard flow, side panel review). Phase 3 (separate decision): found moments on the main
  strip with jump / discard keys for desktop too, retiring the review card everywhere.

## Phases

1. **Overlay player + Tag column (touch):** the left/right clusters, thin timeline overlay, fade rules, the Tag column replacing
   the compact `EventPicker` and the ＋ (`Fab`) on touch; stable person grid (shared `PersonStep` gains the grid + stable order).
2. **Find goals on the timeline (touch):** chip, rings already exist on the strip (make them the main thing), jump ◀ ▶, Not a
   goal, found chip, confirm-by-tag; remove the review card / Review button / rail button on touch.
3. **Desktop alignment** (only after the user tries 1–2 on a phone).

## Out of scope / unchanged

Persisted state (events, suggestions, decisions) — no persist bump. Detection itself (audio pass, ball check). Export. Goal set-up.
Keyboard shortcuts on desktop.

## Risks

- video.js owns the control bar and fullscreen sizing; the overlay clusters replace its touch control bar (keep its
  progress-bar disabled as today; reuse `pictureGestures` for pinch/pan).
- Losing the review card's loop window (−5…+5 s replay) — mitigated by jump-to-−6 s and ⟲5; a "replay this moment" long-press on ⟲5
  can come later.
- Lime guard: Tag is a primary action (allowed); top-pick rings and goal icons are "goal" (allowed).

## Testing

- Pure helpers with unit tests: next / previous pending found moment from a time; "on a found moment" window; stable person order
  (A–Z, appended new names, scorer disabled on assist); the question flow per event type.
- Component tests: Tag pauses and stamps the time; breadcrumbs go back; tag inside a moment confirms it; Not a goal rejects and
  jumps; ＋ and the review card absent on touch; fade timer rules.
- Screenshots (touch, Android Chrome UA): 844×390, 915×412, 390×844, 412×915, 1194×834, 834×1194, dark + light; desktop 1280×800
  unchanged.
- Real device: the user on an Android phone, sideways, with GoPro footage — thumb reach, fade timing, zoom + pan with controls over
  the picture.

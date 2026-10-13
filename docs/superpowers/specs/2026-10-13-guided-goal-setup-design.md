# Guided goal set-up — design

Date: 2026-10-13 · Status: approved in conversation ("Item 3 - yes")

## Why

Setting goal areas today is one dense section (`GoalAreasSetup`): both zoom boxes on a small still, plus "Mark …"
buttons that open the point editor inside the sheet. The user: marking posts is "pretty impossible on mobile"; the flow
should guide step by step — mark the goals first, point by point, then each replay zoom area one at a time, with a
preview of what replays will show; boxes shouldn't appear until their step; and the wording must say clearly which
goal is whose ("Whites' attacking or Whites' own goal" was unclear).

## Decisions (from the user)

- A **full-screen set-up layer** (not a modal) on every device; controls move with the screen shape.
- On touch, points are placed by **moving the picture under a fixed crosshair** and tapping **Set point**; desktop
  keeps click-to-place.
- Order: choose the picture → mark goal 1 → mark goal 2 → replay zoom 1 → replay zoom 2 → summary.
- In the zoom steps **the preview is the editor**: a frame-aspect picture of exactly what replays show.
- Wording names each goal one way only: by the team that **defends** it at kick-off. "Attacking" is not used.
- Folded in from the terminology review: placing posts is "Set goal posts" (the review card keeps "Mark moment").

## 1. Entry points

- New match → Goals step: a short intro and a **Set up goals** button (primary) that opens the layer; after it closes
  the step shows the summary (§5) in compact form. Skippable as today.
- Match setup: the Goal areas section shows the compact summary with **Set up goals** (none yet) or **Edit** per goal.
- "Mark the goals in Match setup first" (Find goals Advanced detection) → "Set the goal posts first", opening the layer.
- Persisted data unchanged: `goalMarks` and `goalAreas` as today (no version bump). `setGoalMarks` already derives a
  zoom box from new marks when none exists.

## 2. The layer

`GoalSetup` (new component, `src/components/goalSetup/`), rendered in a portal over the app, `role="dialog"`
`aria-modal="true"`, labelled "Goal set-up", own step state.

| Screen | Layout |
|---|---|
| Phone portrait | Top: step title + one-line instruction + step dots (1–4). Middle: picture (as large as fits). Bottom: primary button (thumb reach), Back / Skip as quiet buttons. Dismissible hint "Turn sideways for a bigger picture" (remembered per device, try/catch localStorage). |
| Phone landscape | Picture at full height on the left; a narrow column on the right with title, instruction, dots and buttons. |
| Tablet | Portrait/landscape as above with more room. |
| Desktop | Large picture, side column at ≥ 1024 px; keyboard throughout. |

- Esc / × / Android Back (history entry pushed on open, popped on close) close the layer; work done so far is kept
  (each goal is saved when its step completes). Closing mid-goal keeps nothing for that goal.
- Safe areas respected (`env(safe-area-inset-*)`); page pinch-zoom blocked only inside the layer (`touch-action: none`
  on the picture); rotating keeps the current step and points.
- Picture: the full-resolution still (`useStillAt`, 3840 wide) from the moment chosen in step 0; until it is ready the
  quick frame is used.
- Targets ≥ 44 px; text ≥ 14 px on touch; tokens only; lime only on the primary button; `prefers-reduced-motion`
  respected (no animated jumps).

## 3. Steps

**0 · Choose the picture.** "Find a moment where both goals are clear." Scrubber (existing, ±5 s steps) over the first
video; Next.

**1 · Set goal posts — Whites' goal** (team 1's name; "Team 1" when unnamed). Instruction line: "The goal Whites defend
at kick-off". Four required points in order: bottom of the left post, bottom of the right post, top of the left post,
top of the right post. A small goal diagram (SVG) highlights the current corner. Then an optional "Add the back corners
of the net" (two more points) or Next.
- **Touch:** the picture starts zoomed (×3 on phones, ×2 on tablets) at the frame centre for the first point; a fixed
  crosshair sits in the middle of the picture area; one-finger drag pans the picture (pinch optional to zoom, buttons
  `+` / `−` too); **Set point** places the point under the crosshair. After each point the view jumps to where the next
  point probably is: right post ≈ same height, mirrored across the frame centre or 1 goal-width along; tops ≈ above the
  bottoms by the typical post height (use the existing proportions in `goalMarks.ts`). Placed points show as dots with
  their lines; **Undo** removes the last one.
- **Desktop / fine pointer:** click places the current point (today's behaviour), drag a dot to adjust, wheel zoom,
  arrows nudge the selected point (existing `GoalMarksEditor` logic), Backspace = Undo.
- **Skip this goal** (quiet): leaves marks empty for it; a note in the summary: "Advanced detection needs goal posts".
- No zoom boxes are shown in steps 0–2.

**2 · Set goal posts — Colours' goal.** Same; starts from the same picture; the first point's view starts mirrored from
goal 1 when goal 1 was marked (goals usually face each other across the frame).

**3 · Replay zoom — goals scored into Whites' goal.** Instruction: "Replays of goals at this end show this view." The
picture area IS the replay view: the still cropped to the current box at the frame's aspect (CSS background or canvas
of the full-res still — what you see is what the render crops). One-finger drag pans the view, pinch zooms, **Closer**
/ **Wider** buttons step the zoom, **Reset** returns to the box from the posts. A small corner map (the whole frame,
the box outlined) shows where the view sits; tapping the map moves the box there. Starts from the saved box, else
`goalRectFromMarks`, else `defaultGoalAreas()`'s box for that team. The existing soft-zoom warning applies ("A very
small box zooms in a lot: replays will look soft on 1080p footage."). Next saves the box.

**4 · Replay zoom — goals scored into Colours' goal.** Same.

**5 · Summary** (also the compact view in New match / Match setup): two cards, one per goal: "Whites' goal" with the
replay preview thumbnail, a tick for posts set (or "No goal posts — Advanced detection needs them"), and **Edit posts**
/ **Edit zoom** (each reopens the layer at that step only, then returns to the summary). Below: "Swap which goal is
whose" and "Remove goal set-up" (quiet). Done closes.

## 4. Wording

- "Whites' goal" = the goal Whites defend at kick-off, everywhere (summary, steps, replay-framing choices in the event
  sheet, which today use `teamGoalLabel`). Check `teamGoalLabel` and change its output if it says anything else.
- Never "attacking goal"; the zoom step says "goals scored into Whites' goal".
- "Set goal posts", not "mark the goal".

## 5. Components and reuse

- `goalSetup/GoalSetup.tsx` (layer, steps, layout), `goalSetup/PostPlacer.tsx` (touch crosshair placement + desktop
  click placement; extracted from `GoalMarksEditor`), `goalSetup/ZoomFramer.tsx` (preview-as-editor + corner map),
  `goalSetup/GoalDiagram.tsx`, `GoalSetupSummary.tsx`.
- Pure helpers with tests in `src/utils/goalSetup.ts`: next-point view guess, crosshair → frame coordinates for a
  given zoom/pan/viewport, zoom-step maths for Closer/Wider (box size × 0.8 / ÷ 0.8 clamped by `clampRect` /
  `MIN_BOX_W`), corner-map tap → box centre.
- `GoalMarksEditor` and `GoalAreasSetup` are replaced (delete when nothing uses them); `FrameBoxes` stays for the event
  Replay framing until that moves to the same preview-as-editor (parked idea).

## 6. Testing

- Unit: the helpers above (coordinates at several zooms/pans and aspect ratios, next-point guesses, zoom steps clamp,
  map tap).
- Component (happy-dom): step order and Back/Skip, no boxes before step 3, Set point places at the crosshair's frame
  point, Undo, desktop click path, zoom step saves the box, summary labels and Edit entry points, Esc/Back close keeps
  completed goals, wording ("Whites' goal", "defend at kick-off", no "attacking").
- Browser (Playwright, touch emulation): 390×844, 844×390, 834×1194, 1280×800, 1440×900, dark + light — each step
  screenshot; the picture ≥ 60% of the screen in both phone orientations; a scripted touch drag + Set point lands
  within 0.5% of the target; looked at.
- Not verifiable without a real phone: how the drag feels, iOS Safari's own gestures inside the layer, Android Back.
  The user tries it on the deployed preview before it's called done.

## 7. Parked

- Use the same preview-as-editor for each event's Replay framing.
- Auto-detect the goal posts from the picture.

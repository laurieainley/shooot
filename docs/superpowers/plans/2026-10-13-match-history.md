# Match history Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Matches tab beside Events in the rail lists this device's matches (autosaved to IndexedDB); tapping one
loads it, the relink banner asks for its videos.

**Architecture:** Pure record helpers (`utils/matchRecord.ts`) turn store state into a `MatchRecord` and back. An
IndexedDB store (`files/matchStore.ts`) keeps records and per-match file handles; a tiny vanilla store
(`components/openMatch.ts`) holds the open match id + its file list. `useMatchAutosave` writes the open match;
`components/matchSwitch.ts` opens / starts / deletes matches. UI: `RailTabs` + `MatchList` in the rail.

**Tech Stack:** React 19, TypeScript strict, Zustand 5 (+ `zustand/vanilla`), idb-keyval 6 (`createStore`), Vitest +
RTL + happy-dom.

**Spec:** `docs/superpowers/specs/2026-10-13-match-history-design.md`

## Global Constraints

- No change to the persisted `vhm-state` shape and **no persist version bump** (v27 is reserved by other sessions).
- The open match id lives in localStorage key `shooot-open-match`.
- IndexedDB: `createStore('shooot-matches', 'matches')` for records; handles in the default idb-keyval store under
  `match-handles:<id>`; the legacy key `file-handles` is adopted by the first record, then deleted.
- Record holds no video and no device settings (`labs`, `labsSeen`, `knownPlayers`, `highlightsQuality`,
  `barCollapsed`); undo/redo reset on switch.
- Autosave debounce 1000 ms; flush immediately on `visibilitychange` (hidden) and `pagehide`.
- A record is worth saving when the state has any file or any event.
- Copy: "Events", "Matches", "+ New match", "Open", "Delete", "Couldn't open this match",
  "Couldn't save this match on this device", empty state "No matches yet. Load some footage and get tagging.",
  confirms "Exporting — switching stops it." / "Finding goals — switching stops it." with "Stop and switch" / "Cancel",
  delete toast "Match deleted" with Undo, relink hint "Pick <name>, <name>".
- UI rules (AGENTS.md §7): `--sh-*` tokens only, no lime outside the lime allow-list (the tabs and list are not lime),
  touch targets ≥ 44 px and text ≥ 14 px on touch, Archivo UI, JetBrains Mono for scores, sentence case, UK English.
- Utils are pure (no store imports in `src/utils/`). Explicit return types on exported functions; no `any`.
- Tests next to code, `describe` per unit, `it('should …')`; DOM tests start with `// @vitest-environment happy-dom`.

## Review Focus

1. Two tabs open in the same browser: each autosaves its own open match id; the second tab must not overwrite the first
   tab's record with a different match. Expected: records are keyed by id, so each tab writes only its own id (test in
   Task 3: two autosavers with different ids write two records).
2. Opening a match while the current one has never been saved (no id yet, has events). Expected: it is saved first,
   then the other loads (test in Task 4).
3. Deleting the open match. Expected: a fresh new match starts; Undo puts the record back but doesn't reopen it (Task 4).
4. A record written by a future/older build with missing fields. Expected: `applyMatchData` falls back to defaults like
   `applyTransferPayload` does; the list shows it (Task 1: apply with `{}` data does not throw).
5. A match with files but no events after reload. Expected: the relink banner still shows and names the files (Task 5).

---

### Task 1: Pure match record helpers

**Files:**
- Create: `src/utils/matchRecord.ts`, `src/utils/matchRecord.test.ts`

**Interfaces:**
- Consumes: `buildTransferPayload`, `TransferPayload` (`utils/projectTransfer.ts`), `finalScore` (`utils/score.ts`),
  `fileKey` (`utils/fileKey.ts`), types from `types.ts`, `ClipOptions` (where the store declares it).
- Produces:
```ts
export interface FileMeta { name: string; size: number; durationSec?: number; key: string; recordedAtMs?: number }
export interface MatchData extends TransferPayload {
    suggestions: Suggestion[]; suggestionRun: SuggestionRun | null; clipOptions: ClipOptions
}
export interface MatchSummary {
    title: string; teams: [string, string] | null; score: [number, number] | null
    dateMs: number; fileCount: number; eventCount: number
}
export interface MatchRecord { id: string; createdAt: number; updatedAt: number; data: MatchData; files: FileMeta[]; summary: MatchSummary }
export type RecordSource = MatchData & { files: { name: string; file?: { size: number }; durationSec?: number; recordedAtMs?: number }[] }
export function newMatchId(now: number, rand: () => number): string            // `m-${now}-${4 base36 chars}`
export function isWorthSaving(s: { files: unknown[]; events: unknown[] }): boolean
export function fileMetas(files: RecordSource['files']): FileMeta[]             // key via fileKeys() so name clashes get name+size keys
export function recordTitle(data: Pick<MatchData, 'matchdayLabel' | 'teams'>): string
export function matchDate(files: FileMeta[], createdAt: number): number         // earliest recordedAtMs, else createdAt
export function summarise(data: MatchData, files: FileMeta[], createdAt: number): MatchSummary
export function buildRecord(src: RecordSource, id: string, now: number, prev?: MatchRecord | null): MatchRecord
export function sameRecordData(a: MatchRecord, b: MatchRecord): boolean        // data + files equal (JSON compare) — skips no-op writes
```
- `buildRecord` keeps `prev.createdAt` and `prev.files` when `src.files` is empty (a reopened match whose videos aren't
  linked yet must not lose its file list); `updatedAt = now`.
- `recordTitle`: trimmed `matchdayLabel` if non-empty; else `"<team1> v <team2>"` when both names are non-empty; else
  `"Untitled match"`.
- `summarise`: `score` from `finalScore(events, teams)` mapped to `[team1, team2]`, `null` when there are no teams;
  `eventCount` excludes markers (kick_off, half_time, final_whistle).

- [ ] **Step 1: Write failing tests** covering: `newMatchId` format; `isWorthSaving` (files only → true, events only →
  true, neither → false); `recordTitle` three branches; `matchDate` earliest recording vs fallback; `summarise` score and
  marker-free count; `buildRecord` new (createdAt = now) and with `prev` (keeps createdAt, keeps prev.files when src has
  none); `sameRecordData` ignores `updatedAt`; `fileMetas` gives distinct keys for two files with the same name.
- [ ] **Step 2:** `npx vitest run src/utils/matchRecord.test.ts` → FAIL (module not found).
- [ ] **Step 3:** Implement. `MatchData` is built as `{ ...buildTransferPayload(src), suggestions, suggestionRun, clipOptions }`.
- [ ] **Step 4:** Tests pass; `npx tsc -b --noEmit` clean.
- [ ] **Step 5:** Commit `feat(history): pure match record helpers`.

### Task 2: IndexedDB match store, open-match state, per-match handles

**Files:**
- Create: `src/files/matchStore.ts`, `src/files/matchStore.test.ts`, `src/components/openMatch.ts`, `src/components/openMatch.test.ts`
- Modify: `src/files/handleStore.ts` (+ its test)

**Interfaces:**
- Produces (`files/matchStore.ts`):
```ts
export type MatchListItem = { id: string; summary: MatchSummary; updatedAt: number; broken?: false } | { id: string; broken: true }
export async function listMatches(): Promise<MatchListItem[]>   // newest updatedAt first; unreadable/invalid values → { id, broken: true }
export async function getMatch(id: string): Promise<MatchRecord | null>   // null when missing or invalid
export async function putMatch(r: MatchRecord): Promise<void>   // throws on storage errors (caller reports)
export async function deleteMatch(id: string): Promise<void>    // also deletes match-handles:<id>
```
  A value is valid when it is an object with string `id`, numeric `updatedAt`, object `data`, array `files`, object `summary`.
- Produces (`components/openMatch.ts`, `zustand/vanilla`):
```ts
export interface OpenMatchState { id: string | null; files: FileMeta[]; saveError: boolean }
export const openMatchStore: StoreApi<OpenMatchState>
export function useOpenMatch<T>(sel: (s: OpenMatchState) => T): T
export function setOpenMatch(id: string | null, files?: FileMeta[]): void   // also writes/removes localStorage 'shooot-open-match'
export function readOpenMatchId(): string | null                            // from localStorage (try/catch → null)
```
  Initial state: `{ id: readOpenMatchId(), files: [], saveError: false }`.
- Modify `handleStore.ts`: `loadHandles()`, `rememberHandles(hs)`, `clearHandles()` use key `match-handles:<openMatchStore.getState().id>`
  (falling back to the legacy `file-handles` key when id is null). Add
  `export async function adoptLegacyHandles(id: string): Promise<void>` (moves `file-handles` → `match-handles:<id>`, deletes legacy).

- [ ] **Step 1: Failing tests.** Mock idb-keyval with an in-memory Map per store:
```ts
vi.mock('idb-keyval', () => {
    const stores = new Map<string, Map<string, unknown>>()
    const def = 'default'
    const pick = (s?: unknown) => { const k = (s as string | undefined) ?? def; if (!stores.has(k)) stores.set(k, new Map()); return stores.get(k)! }
    return {
        createStore: (db: string, name: string) => `${db}/${name}`,
        get: async (k: string, s?: unknown) => pick(s).get(k),
        set: async (k: string, v: unknown, s?: unknown) => { pick(s).set(k, v) },
        del: async (k: string, s?: unknown) => { pick(s).delete(k) },
        entries: async (s?: unknown) => [...pick(s).entries()],
        __reset: () => stores.clear(),
    }
})
```
  Tests: put two records → list newest first; a junk value (`'oops'`) lists as broken; `getMatch` of junk → null;
  `deleteMatch` removes record and `match-handles:<id>`; `setOpenMatch` round-trips through localStorage;
  handles remembered under one open id are not returned under another; `adoptLegacyHandles` moves and deletes.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Pass; existing `handleStore` / `RelinkBanner` tests still pass.
- [ ] **Step 5:** Commit `feat(history): IndexedDB match store and per-match file handles`.

### Task 3: Autosave and upgrade

**Files:**
- Create: `src/components/useMatchAutosave.ts`, `src/components/matchAutosave.ts` (non-React core), `src/components/matchAutosave.test.ts`
- Modify: `src/components/AppShell.tsx` (call `useMatchAutosave()` once)

**Interfaces:**
- Produces:
```ts
// matchAutosave.ts
export interface Autosaver { schedule(): void; flush(): Promise<void>; stop(): void }
export function createAutosaver(deps?: { now?: () => number; rand?: () => number; delayMs?: number }): Autosaver
export function recordSource(s: AppState): RecordSource     // the slice buildRecord needs
export async function adoptCurrentMatch(): Promise<void>   // upgrade: no open id + worth saving → first record (+ adoptLegacyHandles)
export function flushAutosave(): Promise<void>              // flushes the app-wide autosaver (no-op before it starts)
// useMatchAutosave.ts
export function useMatchAutosave(): void  // starts the app-wide autosaver, subscribes to useAppState, listens to visibilitychange/pagehide
```
- `flush()`: if `!isWorthSaving(state)` → return. Id = `openMatchStore.id` or a new id (then `setOpenMatch(id, files)`).
  `prev = await getMatch(id)`; `rec = buildRecord(recordSource(state), id, now, prev)`; skip when
  `prev && sameRecordData(prev, rec)`; `putMatch(rec)`; set `files: rec.files, saveError: false`; on throw set
  `saveError: true` (never rethrow).
- The subscription schedules only when one of these changed (reference compare): events, teams, files, the clip/replay
  numbers, graphics, fullMatch, clipOptions, matchdayLabel, knownFinalScore, goalAreas, goalMarks, suggestions, suggestionRun.

- [ ] **Step 1: Failing tests** (fake timers, idb mock from Task 2, real `useAppState` with `setState`): change events →
  nothing written before 1000 ms, one record after; two changes within 1000 ms → one write; empty state → no record;
  `flush()` assigns an id and writes `shooot-open-match`; putMatch throwing → `saveError` true, no throw; unchanged data
  → no second write (spy on put); `adoptCurrentMatch` with events and no id → one record, legacy handles moved; with an
  id already → nothing; Review Focus 1: two autosavers with different open ids write two records.
- [ ] **Step 2:** FAIL. **Step 3:** Implement; in `AppShell` call `useMatchAutosave()` (which calls `adoptCurrentMatch()` once on mount).
- [ ] **Step 4:** Pass. **Step 5:** Commit `feat(history): autosave the open match`.

### Task 4: Switching, new match, delete

**Files:**
- Create: `src/components/matchSwitch.ts`, `src/components/matchSwitch.test.ts`
- Modify: `src/components/OverflowMenu.tsx` (+ test), `src/state.ts` (add `loadMatch` action only — no persisted shape change)

**Interfaces:**
- Produces:
```ts
export type SwitchBlocker = 'render' | 'detect' | null
export function switchBlocker(): SwitchBlocker   // renderJobs().getState().job?.phase === 'running' → 'render'; getDetectJob() running/ballPhase running → 'detect'
export function stopBlocker(): void              // cancel render (renderJobs().getState().cancel()) and cancelDetection()
export async function openMatch(id: string): Promise<boolean>   // false if the record can't be read (caller shows the broken row message)
export async function startNewMatch(): Promise<void>
export async function removeMatch(id: string): Promise<void>    // toast "Match deleted" with Undo (putMatch(prev) again)
```
- `state.ts` add `loadMatch: (data: MatchData) => void`: revoke file URLs, then set
  `files: [], cumulativeOffsets: [], currentTimeInFileSec: 0, currentFileIndex: 0, isPreviewMode: false, previewSegments: [], previewSteps: [], currentPreviewSegment: 0, picker: null, panel: null, undoStack: [], redoStack: [], discardStack: [], reviewIndex: 0`,
  then apply the data with the same fallbacks as `applyTransferPayload` (normaliseAreas, normaliseGoalMarks,
  parseKnownScore, migrateEvent; numbers fall back to current values), and `suggestions`, `suggestionRun`, `clipOptions`
  (fallback to current). Do not go through `setEvents` (that pushes undo). Teams also go through `rememberPlayers`.
- `openMatch(id)`: `await flushAutosave()`; `rec = await getMatch(id)`; null → false; `cancelDetection()`;
  `loadMatch(rec.data)`; `setOpenMatch(id, rec.files)`; `railTab` → 'events' (Task 5 owns the tab store; here call
  `setRailTab('events')` from `components/railTab.ts`, created in this task as a vanilla store `{ tab: 'events' | 'matches' }`
  with `setRailTab` / `useRailTab`). Returns true.
- `startNewMatch()`: `await flushAutosave()`; `cancelDetection()`; `useAppState.getState().newMatch()`; then reset
  undo/redo to `[]`; `setOpenMatch(null)`; `openPanel('newmatch')`; `setRailTab('events')`.
- `removeMatch(id)`: `prev = await getMatch(id)`; `deleteMatch(id)`; if `id` is the open id → `startNewMatch()` without
  flushing (skip flush: the match is being deleted); toast Undo → `putMatch(prev)` (does not reopen).
- `OverflowMenu`: "New match…" runs `startNewMatch()` directly (remove the confirm view and the Clear match button,
  remove the `clearHandles` import). Callers check `switchBlocker()` first (see Task 5); the menu does the same with the
  same confirm text inside the menu (`menu-confirm` pattern already there).

- [ ] **Step 1: Failing tests:** `openMatch` replaces events/teams/settings, clears files and undo, sets open id and
  rail tab events; unknown id → false and state untouched; Review Focus 2: unsaved current match with events (no id) is
  saved before the other loads (listMatches has 2); `startNewMatch` keeps teams, empties events, open id null, previous
  record still listed; Review Focus 3: `removeMatch(openId)` → new match started, Undo restores the record and open id
  stays null; `switchBlocker` reports render/detect; Review Focus 4: `loadMatch({} as MatchData)` doesn't throw and
  keeps current numeric settings; OverflowMenu "New match…" starts a new match without a confirm.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** Pass + `npx tsc -b --noEmit`.
- [ ] **Step 5:** Commit `feat(history): open, start and delete matches`.

### Task 5: Rail tabs, Matches list, relink naming

**Files:**
- Create: `src/components/RailTabs.tsx`, `src/components/MatchList.tsx`, `src/components/MatchList.test.tsx`, `src/components/RailTabs.test.tsx`
- Modify: `src/components/AppShell.tsx` (rail), `src/components/RelinkBanner.tsx` (+ test), `src/App.css`

**Interfaces:**
- Consumes: `useRailTab`, `setRailTab` (Task 4), `listMatches` (Task 2), `openMatch`, `startNewMatch`, `removeMatch`,
  `switchBlocker`, `stopBlocker` (Task 4), `useOpenMatch` (Task 2), `recordTitle`-based `summary` (Task 1).
- Rail markup: `<aside className="rail">` → `<RailTabs />` then `{tab === 'events' ? <EventLog /> : <MatchList />}`;
  the Fab only on the Events tab. Default tab on mount: 'events' if files or events exist, else 'matches' (set once in
  `RailTabs` effect). The `L` shortcut / "focus event log" path sets the tab to events first.
- `RailTabs`: `role="tablist"`, two `role="tab"` buttons with `aria-selected`, `aria-controls`; arrow keys move between
  them; class `rail-tabs` styled as a segmented control (`--sh-*` surface/line tokens; selected = raised surface + text,
  not lime); min-height 44 px on `(pointer: coarse)`.
- `MatchList` (`role="tabpanel"`): reloads `listMatches()` on mount and whenever `useOpenMatch(s => s.id)` or a
  `matchesVersion` counter (exported from `openMatch.ts`: `bumpMatches()` / `useMatchesVersion()`, bumped after every
  put/delete) changes. Header row: `+ New match` (quiet button). Rows (`<li>`, a button filling the row + a ⋯ menu
  button `aria-label="More for <title>"` opening a one-item menu "Delete"): title (Archivo 600), score
  `13–9` in JetBrains Mono when `score`, second line `<date: e.g. "Thu 9 Oct"> · <n> files` (or "no videos" when 0),
  "Open" tag on `id === openId`. Broken rows: "Couldn't open this match" + Delete. `saveError` → muted line
  "Couldn't save this match on this device" at the top. Empty list (and no open match saved) → empty state copy.
- Choosing a row / New match: if `switchBlocker()` → inline confirm (`role="alertdialog"`) with the blocker text,
  "Stop and switch" (`stopBlocker()` then continue) / "Cancel". `openMatch` false → that row shows the broken message.
- `RelinkBanner`: `waiting` also true when `files.length === 0 && openMatch.files.length > 0`; the second line, when not
  one-click, reads `Pick <names joined by ", ">` from `openMatch.files` (truncate to the first 3 names + "and N more").
  Heading when there are no events: "This match needs its videos".

- [ ] **Step 1: Failing tests:** tabs render, switch, aria-selected, default to Matches when empty; list shows rows in
  order with title/score/"Open"; tapping a row calls openMatch and lands on Events; New match; blocker confirm appears
  and Cancel leaves state; Delete → row gone + toast; broken row; save error line; Review Focus 5: no events, open match
  with 2 files → banner shows "This match needs its videos" and "Pick a.mp4, b.mp4".
- [ ] **Step 2:** FAIL. **Step 3:** Implement + CSS. **Step 4:** Pass; full suite, tsc, `npx eslint src` (baseline, no
  new problems), build.
- [ ] **Step 5:** Screenshots (dev server on the brief's port, Playwright, touch emulation for phone/tablet) at 390×844,
  844×390, 834×1194, 1280×800, 1440×900, 1920×1080, dark and light: Events tab, Matches tab with 3 seeded records (seed
  via `page.evaluate` writing IndexedDB `shooot-matches/matches`), a reopened match with the relink banner. Look at them.
- [ ] **Step 6:** Commit `feat(history): Events | Matches tabs and match list`.

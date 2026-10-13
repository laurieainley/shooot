# Match history (Matches tab) — design

**Date:** 2026-10-13 · **Status:** approved (user, 2026-10-13) · **Supersedes:** the "Games tab" part of W1 in
`2026-10-08-history-and-voting-design.md`, as a device-only first step (no server, no sync).

## Goal

The right pane also lists previous matches. Tapping one loads it with all its settings; the current match is never
lost when switching. A match whose videos aren't open loads anyway and asks for them through the relink banner.

## Decisions (user, 2026-10-13)

1. **Autosave.** The open match saves itself while you work. There is no Save button and no save/discard prompt;
   the only prompt on switching is when a render or Find goals run would be stopped.
2. **Two tabs in the rail: Events | Matches**, equal tier, a segmented switch at the top of the rail.
3. **Storage: IndexedDB**, one record per match, on this device only. Project export and transfer links stay the way
   to move a match to another device.
4. **+ New match** (top of the Matches tab, and ⋯ → New match) starts a fresh match and keeps the old one in the list;
   the "Clear match" confirmation goes (nothing is lost any more).
5. **Row actions: Delete only** (undoable from its toast). Duplicate / Export from the list are parked.

## Data

### Match record (`utils/matchRecord.ts`, pure)

```ts
interface MatchRecord {
    id: string                 // `m-<timestamp>-<rand>`
    createdAt: number
    updatedAt: number
    data: MatchData            // TransferPayload + goalMarks, suggestions, suggestionRun, clipOptions
    files: FileMeta[]          // name, size, durationSec, key (fileKey), in timeline order
    summary: MatchSummary      // title, team names + colours, score (finalScore of events), date, fileCount, eventCount
}
```

- `buildRecord(state, prev?)`, `summarise(data, files)`, `recordTitle(summary)` ("Matchday 3", else "Hawks v Lions",
  else "Untitled match"), `matchDate(files, createdAt)` (earliest recording time from container metadata, else the
  creation date), `isWorthSaving(state)` (any file or any event).
- `MatchData` reuses `buildTransferPayload` plus the extra keys; applying a record reuses `applyTransferPayload` plus
  the extras, so project import, transfer links and history stay one code path.
- Not in a record: video, device settings (`labs`, `labsSeen`, `knownPlayers`, `highlightsQuality`, `barCollapsed`),
  undo/redo stacks (reset on switch).

### Store (`files/matchStore.ts`)

- idb-keyval `createStore('shooot-matches', 'matches')`: `listMatches()` (summaries, newest `updatedAt` first),
  `getMatch(id)`, `putMatch(record)`, `deleteMatch(id)`. A record that fails to parse is listed as
  `{ id, broken: true }`, never thrown.
- File handles per match (`match-handles:<id>`, desktop Chrome/Edge only), replacing the single `file-handles` list;
  the old list is adopted by the first record on upgrade.
- The open match's id lives in localStorage key `shooot-open-match` (outside `vhm-state`, so **no persist version
  bump**).

### Autosave (`components/useMatchAutosave.ts`)

- Subscribes to the store; when the record-relevant slice changes and `isWorthSaving`, writes the record ~1 s after the
  last change, and immediately on `visibilitychange` → hidden and `pagehide`. Creates the id on first save.
- A failed write (quota, private mode) shows a quiet line in the Matches tab ("Couldn't save this match on this
  device"), retried on the next change; tagging is never blocked.
- **Upgrade:** first run with no `shooot-open-match` and a worth-saving `vhm-state` → it becomes the first record.

## UI

### Rail tabs (`RailTabs`, in `AppShell` above `EventLog`)

- `Events | Matches` segmented control (`role=tablist`), 44 px on touch. Default: Events when the open match has files
  or events, else Matches. Tab is UI state (not persisted). Phone portrait: same switch at the top of the rail section.
- Keyboard: the existing L (event log) also switches to Events.

### Matches tab (`MatchList`)

- `+ New match` (quiet button), then rows newest first: title (Archivo 600), score in JetBrains Mono, date ·
  "4 files" (or "no videos"), "Open" tag on the current match. Tap/Enter on a row opens it; ⋯ on the row → Delete.
- Delete removes the record and shows a toast with Undo (re-puts it). Deleting the open match starts a new match.
- Empty state (brand voice): "No matches yet. Load some footage and get tagging."
- Broken record row: "Couldn't open this match" + Delete.

### Switching (`openMatch(id)`, `startNewMatch()` in `components/matchSwitch.ts`)

1. If a render or Find goals run is going: confirm "Exporting — switching stops it." / "Finding goals — switching
   stops it." (Stop and switch / Cancel).
2. Flush autosave of the current match.
3. Unload videos (revoke URLs), clear transient state (as `newMatch()` does), reset undo/redo.
4. Load the record (`applyMatchData`), set `shooot-open-match`, switch to the Events tab.
5. The relink banner appears for the record's files.

`startNewMatch()`: flush, then today's `newMatch()` (keeps teams/rosters/clip settings), new id assigned on first save,
open the New match panel.

### Missing videos (`RelinkBanner`)

- Uses the open match's handles (one click on desktop Chrome/Edge). Elsewhere it names the files to pick
  ("Pick GX010042.MP4, GX020042.MP4") from the record's `files`, and events find them by name as today.
- Partial relink: linked events work, the rest keep "file missing". Permission refused / file moved → picker with a
  plain message. Same name but different size → accepted; the Files warning dot shows as today.
- Without videos the match is browsable (events, score); Export already names the videos it needs.

## Testing

- Unit: `matchRecord` (build, summary, title, date, worth-saving, apply round-trip with `buildTransferPayload`),
  `matchStore` against fake-indexeddb or a mocked idb-keyval (list order, broken record), autosave debounce + flush,
  upgrade adoption.
- Components (happy-dom): tabs and defaults, list rows, open → state replaced and Events tab, running-job confirm,
  delete + undo, delete the open match, broken row, relink banner naming files.
- Screenshots: 390×844, 844×390, 834×1194, 1280×800, 1440×900, 1920; dark and light; touch emulation.
- Real device (user): reload then reopen on Mac Chrome (one-click relink) and a phone (picker by name).

## Out of scope

Server/sync, cross-match stats, search, duplicate/export from the list, thumbnails.

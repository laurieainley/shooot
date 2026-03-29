# SHOOOT UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the SHOOOT highlights editor with the Stadium Pink palette, full-width player layout, Tailwind CSS, and component restructuring — no functional changes.

**Architecture:** Replace all inline styles and App.css with Tailwind utility classes using custom theme tokens. Merge FilePicker+FileList into FilePills, merge AddGoalControls+AddGoalAtCurrentButton into AddGoalBar, create ClipSettings and OutputPanel components, remove ChaptersExport. Layout changes from sidebar to full-width player with panel grid below.

**Tech Stack:** Tailwind CSS v4 via `@tailwindcss/vite`, React 19, existing Zustand store (unchanged)

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `package.json` | Add tailwindcss + @tailwindcss/vite |
| Modify | `vite.config.ts` | Add tailwindcss plugin |
| Rewrite | `src/index.css` | Tailwind entry + @theme tokens |
| Rewrite | `src/App.css` | Keep only fullscreen overlay + video.js + animation CSS |
| Rewrite | `src/App.tsx` | New layout structure |
| Create | `src/components/FilePills.tsx` | Merged FilePicker + FileList |
| Create | `src/components/AddGoalBar.tsx` | Merged AddGoalControls + AddGoalAtCurrentButton |
| Create | `src/components/ClipSettings.tsx` | Highlight length + match offset + adjust checkbox |
| Create | `src/components/OutputPanel.tsx` | Preview + Render + Score summary |
| Modify | `src/components/GoalList.tsx` | Restyle with Tailwind, add collapsible BulkPaste |
| Modify | `src/components/Player.tsx` | Restyle info bar with Tailwind |
| Modify | `src/components/PreviewControls.tsx` | Restyle with Tailwind |
| Modify | `src/components/RenderHighlights.tsx` | Remove adjust-by-offset checkbox (moved to ClipSettings), restyle |
| Modify | `src/components/FullscreenControls.tsx` | Restyle modal + overlay to Stadium Pink |
| Delete | `src/components/ChaptersExport.tsx` | Redundant — score moves to OutputPanel |
| Delete | `src/components/FilePicker.tsx` | Merged into FilePills |
| Delete | `src/components/FileList.tsx` | Merged into FilePills |
| Delete | `src/components/AddGoalControls.tsx` | Merged into AddGoalBar |
| Delete | `src/components/AddGoalAtCurrentButton.tsx` | Merged into AddGoalBar |
| Delete | `src/components/HighlightLengthControls.tsx` | Merged into ClipSettings |
| Delete | `src/components/ProjectIO.tsx` | Logic inlined into App.tsx top bar |
| Delete | `src/components/BulkPaste.tsx` | Merged into GoalList |

---

### Task 1: Install Tailwind CSS and configure theme

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts:1-49`
- Rewrite: `src/index.css`

- [ ] **Step 1: Install Tailwind CSS v4**

```bash
npm install tailwindcss @tailwindcss/vite
```

- [ ] **Step 2: Add Tailwind plugin to Vite config**

In `vite.config.ts`, add the import and plugin:

```ts
import tailwindcss from '@tailwindcss/vite'
```

Add to the `plugins` array (line 16):

```ts
plugins: [tailwindcss(), react()],
```

- [ ] **Step 3: Rewrite index.css with Tailwind + theme tokens**

Replace the entire contents of `src/index.css` with:

```css
@import "tailwindcss";

@theme {
  --color-deep: #0d1b2a;
  --color-surface: #1b263b;
  --color-pink: #f72585;
  --color-yellow: #ffd60a;
  --color-light: #f1faee;
  --color-muted: #6b7f96;
  --color-border: #2b365b;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
  background-color: #0d1b2a;
  color: #f1faee;
  font-family: system-ui, -apple-system, sans-serif;
}

a {
  color: #f72585;
}

a:hover {
  color: #ffd60a;
}
```

- [ ] **Step 4: Verify dev server starts**

```bash
npm run dev
```

Expected: Server starts on https://localhost:5174 without errors. Page may look broken (expected — we haven't migrated components yet).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vite.config.ts src/index.css
git commit -m "feat: install Tailwind CSS v4 with Stadium Pink theme tokens"
```

---

### Task 2: Gut App.css — keep only overlay/animation styles

**Files:**
- Rewrite: `src/App.css`

- [ ] **Step 1: Replace App.css with only the styles that Tailwind cannot express**

Replace the entire contents of `src/App.css` with:

```css
/* === Video.js overrides === */
.player-container {
  position: relative;
  width: 100%;
}

/* === Speed indicator overlay === */
.speed-indicator {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background-color: rgba(13, 27, 42, 0.85);
  color: #f1faee;
  font-size: 28px;
  font-weight: 700;
  padding: 10px 20px;
  border-radius: 8px;
  pointer-events: none;
  z-index: 100;
  animation: speedIndicatorFade 1s ease-out forwards;
}

@keyframes speedIndicatorFade {
  0% { opacity: 1; }
  70% { opacity: 1; }
  100% { opacity: 0; }
}

/* === Fullscreen overlay === */
.fullscreen-overlay {
  pointer-events: none;
  z-index: 2147483647;
}

.fullscreen-overlay--normal {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.fullscreen-overlay--fullscreen {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
}

/* === Tap zones === */
.tap-zone {
  position: absolute;
  top: 0;
  bottom: 60px;
  width: 40%;
  pointer-events: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.tap-zone-left { left: 0; }
.tap-zone-right { right: 0; }

.tap-feedback {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  animation: tapFeedbackAnimation 0.5s ease-out;
  pointer-events: none;
}

.tap-feedback svg {
  filter: drop-shadow(0 0 8px rgba(0, 0, 0, 0.5));
}

.tap-feedback-text {
  color: white;
  font-size: 20px;
  font-weight: bold;
  text-shadow: 0 0 8px rgba(0, 0, 0, 0.7);
}

@keyframes tapFeedbackAnimation {
  0% { opacity: 0; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.1); }
  100% { opacity: 0; transform: scale(0.9); }
}

/* === Overlay controls === */
.overlay-controls {
  position: absolute;
  display: flex;
  gap: 8px;
  pointer-events: auto;
  padding: 16px;
  z-index: 10000;
}

.overlay-controls.top-left { top: 0; left: 0; }
.overlay-controls.top-right { top: 0; right: 0; }
.overlay-controls.center-top {
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
}

.control-btn {
  background-color: rgba(247, 37, 133, 0.6);
  color: white;
  border: none;
  border-radius: 4px;
  padding: 6px 8px;
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
  transition: all 0.2s;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.control-btn:active {
  transform: scale(0.95);
  background-color: rgba(247, 37, 133, 0.8);
}

.control-btn svg { flex-shrink: 0; }

.add-goal-btn {
  padding: 6px 10px;
  font-size: 12px;
}

.speed-btn {
  padding: 5px 6px;
  min-width: 22px;
  justify-content: center;
}

.speed-display {
  min-width: 30px;
  background-color: rgba(247, 37, 133, 0.6);
  font-weight: 700;
}

/* === Goal Modal === */
.goal-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10001;
  pointer-events: auto;
}

.goal-modal {
  background-color: #1b263b;
  border-radius: 12px;
  padding: 24px;
  width: 90%;
  max-width: 400px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
}

.goal-modal h3 {
  margin: 0 0 20px 0;
  color: #f1faee;
  font-size: 20px;
}

.goal-modal-field {
  margin-bottom: 16px;
}

.goal-modal-field label {
  display: block;
  margin-bottom: 6px;
  color: #6b7f96;
  font-weight: 600;
  font-size: 14px;
}

.goal-modal-field input {
  width: 100%;
  padding: 12px;
  border: 2px solid #2b365b;
  border-radius: 8px;
  font-size: 16px;
  box-sizing: border-box;
  color: #f1faee;
  background-color: #0d1b2a;
}

.goal-modal-field input:focus {
  outline: none;
  border-color: #f72585;
}

.goal-modal-actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}

.modal-btn {
  flex: 1;
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.modal-btn-cancel {
  background-color: #2b365b;
  color: #f1faee;
}

.modal-btn-cancel:hover {
  background-color: #3b466b;
}

.modal-btn-submit {
  background-color: #f72585;
  color: white;
}

.modal-btn-submit:hover {
  background-color: #d91e73;
}

.modal-btn:active {
  transform: scale(0.98);
}

/* === Mobile overlay optimizations === */
@media (max-width: 768px) {
  .control-btn { padding: 5px 7px; font-size: 9px; }
  .add-goal-btn { padding: 5px 8px; font-size: 10px; }
  .speed-btn { padding: 4px 5px; min-width: 20px; }
  .overlay-controls { padding: 8px; }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/App.css
git commit -m "refactor: gut App.css, keep only overlay/animation styles with Stadium Pink colors"
```

---

### Task 3: Create FilePills component (merge FilePicker + FileList)

**Files:**
- Create: `src/components/FilePills.tsx`
- Delete: `src/components/FilePicker.tsx`
- Delete: `src/components/FileList.tsx`

- [ ] **Step 1: Create FilePills.tsx**

```tsx
import { useRef, useState } from 'react'
import { useAppState } from '../state'
import type { VideoSourceFile } from '../types'
import { probeVideoFile } from '../utils/probe'

function formatMSS(s: number): string {
    const mm = `${Math.floor(s / 60)}`.padStart(2, '0')
    const ss = `${Math.floor(s % 60)}`.padStart(2, '0')
    return `${mm}:${ss}`
}

export function FilePills() {
    const inputRef = useRef<HTMLInputElement | null>(null)
    const files = useAppState((s) => s.files)
    const setFiles = useAppState((s) => s.setFiles)
    const removeFile = useAppState((s) => s.removeFile)
    const currentFileIndex = useAppState((s) => s.currentFileIndex)
    const setCurrentFileIndex = useAppState((s) => s.setCurrentFileIndex)
    const [message, setMessage] = useState<string | null>(null)

    const onPick = async (evt: React.ChangeEvent<HTMLInputElement>) => {
        const list = evt.target.files
        if (!list || list.length === 0) return
        const picked: VideoSourceFile[] = []
        for (const [idx, f] of Array.from(list).entries()) {
            const meta = await probeVideoFile(f)
            if (!meta.playable) {
                setMessage(meta.error || 'Unsupported file')
                continue
            }
            picked.push({
                id: `${Date.now()}-${idx}`,
                file: f,
                url: URL.createObjectURL(f),
                name: f.name,
                durationSec: meta.durationSec,
                width: meta.width,
                height: meta.height,
            })
        }
        setFiles(picked)
    }

    const move = (from: number, to: number) => {
        if (to < 0 || to >= files.length) return
        const next = files.slice()
        const [it] = next.splice(from, 1)
        next.splice(to, 0, it)
        setFiles(next)
    }

    return (
        <div className="flex flex-wrap items-center gap-2">
            {files.map((f, i) => (
                <div
                    key={f.id}
                    onClick={() => setCurrentFileIndex(i)}
                    className={`flex items-center gap-2 rounded px-3 py-1.5 text-sm font-semibold cursor-pointer border transition-colors ${
                        i === currentFileIndex
                            ? 'bg-surface border-pink text-light'
                            : 'bg-surface border-border text-muted hover:border-pink/50'
                    }`}
                >
                    <span className={i === currentFileIndex ? 'text-light' : 'text-muted'}>
                        {f.name}
                    </span>
                    {f.durationSec != null && (
                        <span className="text-xs text-muted">{formatMSS(f.durationSec)}</span>
                    )}
                    {files.length > 1 && (
                        <>
                            <button
                                onClick={(e) => { e.stopPropagation(); move(i, i - 1) }}
                                disabled={i === 0}
                                className="text-xs text-muted hover:text-light disabled:opacity-30 bg-transparent border-none p-0 cursor-pointer"
                            >↑</button>
                            <button
                                onClick={(e) => { e.stopPropagation(); move(i, i + 1) }}
                                disabled={i === files.length - 1}
                                className="text-xs text-muted hover:text-light disabled:opacity-30 bg-transparent border-none p-0 cursor-pointer"
                            >↓</button>
                        </>
                    )}
                    <button
                        onClick={(e) => { e.stopPropagation(); removeFile(i) }}
                        className="text-xs text-pink/50 hover:text-pink bg-transparent border-none p-0 cursor-pointer"
                    >×</button>
                </div>
            ))}
            <button
                onClick={() => inputRef.current?.click()}
                className="flex items-center gap-1 rounded px-3 py-1.5 text-sm border border-dashed border-yellow/30 bg-yellow/5 text-yellow/60 hover:border-yellow/60 hover:text-yellow cursor-pointer transition-colors"
            >
                + Add file
            </button>
            <input
                ref={inputRef}
                type="file"
                multiple
                onChange={onPick}
                className="hidden"
            />
            {message && <p className="text-sm text-pink">{message}</p>}
        </div>
    )
}
```

- [ ] **Step 2: Delete old files**

```bash
rm src/components/FilePicker.tsx src/components/FileList.tsx
```

- [ ] **Step 3: Commit**

```bash
git add src/components/FilePills.tsx
git add -u src/components/FilePicker.tsx src/components/FileList.tsx
git commit -m "feat: create FilePills component, merge FilePicker + FileList"
```

---

### Task 4: Create AddGoalBar component (merge AddGoalControls + AddGoalAtCurrentButton)

**Files:**
- Create: `src/components/AddGoalBar.tsx`
- Delete: `src/components/AddGoalControls.tsx`
- Delete: `src/components/AddGoalAtCurrentButton.tsx`

- [ ] **Step 1: Create AddGoalBar.tsx**

```tsx
import { useState } from 'react'
import { useAppState } from '../state'
import type { Goal } from '../types'
import { formatHMS } from '../utils/timeline'

function parseTimeToSeconds(input: string): number | null {
    const t = input.trim()
    if (!t) return null
    if (/^\d+$/.test(t)) return parseInt(t, 10)
    const m = t.match(/^(\d+):(\d{1,2})$/)
    if (!m) return null
    const mm = parseInt(m[1], 10)
    const ss = parseInt(m[2], 10)
    if (ss >= 60) return null
    return mm * 60 + ss
}

export function AddGoalBar() {
    const currentTime = useAppState((s) => s.currentTimeInFileSec)
    const currentFileIndex = useAppState((s) => s.currentFileIndex)
    const addGoal = useAppState((s) => s.addGoal)
    const files = useAppState((s) => s.files)

    const [time, setTime] = useState('')
    const [team, setTeam] = useState('')
    const [scorer, setScorer] = useState('')

    const onAdd = () => {
        const matchTimeSec = time ? parseTimeToSeconds(time) : Math.floor(currentTime)
        if (matchTimeSec == null) return
        const goal: Goal = {
            id: `${Date.now()}`,
            matchTimeSec,
            sourceFileIndex: currentFileIndex,
            team: team || undefined,
            scorer: scorer || undefined,
        }
        addGoal(goal)
        setTime('')
    }

    if (files.length === 0) return null

    return (
        <div className="flex items-center gap-2 rounded-md bg-surface px-3 py-2 flex-wrap">
            <input
                placeholder={formatHMS(currentTime)}
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-[70px] rounded bg-deep border border-border px-2 py-1.5 text-sm text-light placeholder:text-muted focus:border-pink focus:outline-none"
            />
            <input
                placeholder="Team"
                value={team}
                onChange={(e) => setTeam(e.target.value)}
                className="w-[90px] rounded bg-deep border border-border px-2 py-1.5 text-sm text-light placeholder:text-muted focus:border-pink focus:outline-none hidden md:block"
            />
            <input
                placeholder="Scorer"
                value={scorer}
                onChange={(e) => setScorer(e.target.value)}
                className="w-[90px] rounded bg-deep border border-border px-2 py-1.5 text-sm text-light placeholder:text-muted focus:border-pink focus:outline-none hidden md:block"
            />
            <button
                onClick={onAdd}
                className="rounded bg-pink px-3 py-1.5 text-sm font-bold text-white border-none cursor-pointer hover:bg-pink/80 transition-colors"
            >
                + Goal
            </button>
            <span className="ml-auto text-xs text-muted hidden md:inline">
                Press <kbd className="rounded bg-deep px-1.5 py-0.5 text-yellow font-bold text-[10px]">G</kbd> while playing
            </span>
        </div>
    )
}
```

- [ ] **Step 2: Delete old files**

```bash
rm src/components/AddGoalControls.tsx src/components/AddGoalAtCurrentButton.tsx
```

- [ ] **Step 3: Commit**

```bash
git add src/components/AddGoalBar.tsx
git add -u src/components/AddGoalControls.tsx src/components/AddGoalAtCurrentButton.tsx
git commit -m "feat: create AddGoalBar, merge AddGoalControls + AddGoalAtCurrentButton"
```

---

### Task 5: Restyle GoalList with Tailwind + inline BulkPaste

**Files:**
- Modify: `src/components/GoalList.tsx`
- Delete: `src/components/BulkPaste.tsx`

- [ ] **Step 1: Rewrite GoalList.tsx**

```tsx
import { useEffect, useState } from 'react'
import { useAppState } from '../state'
import type { Goal } from '../types'

export function GoalList() {
    const goals = useAppState((s) => s.goals)
    const remove = useAppState((s) => s.removeGoal)
    const update = useAppState((s) => s.updateGoal)
    const sortGoals = useAppState((s) => s.sortGoals)
    const seekToGoal = useAppState((s) => s.seekToGoal)
    const addGoal = useAppState((s) => s.addGoal)
    const currentFileIndex = useAppState((s) => s.currentFileIndex)
    const lengthBeforeGoalSec = useAppState((s) => s.lengthBeforeGoalSec)
    const [showBulkPaste, setShowBulkPaste] = useState(false)
    const [bulkText, setBulkText] = useState('')

    const onBulkParse = () => {
        const lines = bulkText.split(/\r?\n/)
        for (const line of lines) {
            const g = parseLine(line, currentFileIndex)
            if (g) addGoal(g)
        }
        setBulkText('')
        setShowBulkPaste(false)
    }

    return (
        <div className="rounded-md bg-surface p-3">
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-light">Goals</span>
                <span className="text-xs text-muted">{goals.length} marked</span>
            </div>

            {goals.length === 0 ? (
                <p className="text-sm text-muted">No goals yet.</p>
            ) : (
                <div className="flex flex-col gap-1.5">
                    {goals.map((g) => (
                        <div key={g.id} className="flex items-center gap-2 rounded bg-deep border-l-[3px] border-l-pink px-2.5 py-2">
                            <TimeInput
                                valueSec={g.matchTimeSec}
                                onCommit={(t) => {
                                    update(g.id, { matchTimeSec: t })
                                    setTimeout(() => sortGoals(), 0)
                                }}
                            />
                            <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] text-muted">
                                V{(g.sourceFileIndex ?? 0) + 1}
                            </span>
                            <input
                                placeholder="Team"
                                value={g.team ?? ''}
                                onChange={(e) => update(g.id, { team: e.target.value })}
                                className="w-[60px] rounded bg-transparent border-none text-xs text-light placeholder:text-muted/50 focus:outline-none p-0"
                            />
                            <input
                                placeholder="Scorer"
                                value={g.scorer ?? ''}
                                onChange={(e) => update(g.id, { scorer: e.target.value })}
                                className="w-[70px] rounded bg-transparent border-none text-xs text-muted placeholder:text-muted/50 focus:outline-none p-0"
                            />
                            <div className="ml-auto flex gap-1.5">
                                <button
                                    onClick={() => seekToGoal(g.sourceFileIndex ?? 0, Math.max(0, g.matchTimeSec - lengthBeforeGoalSec))}
                                    className="text-xs text-muted hover:text-light bg-transparent border-none p-0 cursor-pointer"
                                    title={`Watch goal (starts ${lengthBeforeGoalSec}s before)`}
                                >&#9654;</button>
                                <button
                                    onClick={() => remove(g.id)}
                                    className="text-xs text-pink/40 hover:text-pink bg-transparent border-none p-0 cursor-pointer"
                                    title="Delete goal"
                                >×</button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="mt-2.5 pt-2 border-t border-deep">
                {showBulkPaste ? (
                    <div>
                        <textarea
                            value={bulkText}
                            onChange={(e) => setBulkText(e.target.value)}
                            placeholder="MM:SS Team - Scorer"
                            className="w-full h-[80px] rounded bg-deep border border-border px-2 py-1.5 text-sm text-light placeholder:text-muted resize-y focus:border-pink focus:outline-none"
                        />
                        <div className="flex gap-2 mt-1.5">
                            <button
                                onClick={onBulkParse}
                                className="rounded bg-pink px-2 py-1 text-xs font-bold text-white border-none cursor-pointer"
                            >Add Goals</button>
                            <button
                                onClick={() => setShowBulkPaste(false)}
                                className="rounded bg-transparent px-2 py-1 text-xs text-muted border-none cursor-pointer hover:text-light"
                            >Cancel</button>
                        </div>
                    </div>
                ) : (
                    <button
                        onClick={() => setShowBulkPaste(true)}
                        className="text-xs text-muted hover:text-light bg-transparent border-none p-0 cursor-pointer"
                    >+ Bulk paste goals...</button>
                )}
            </div>
        </div>
    )
}

function formatHMS(totalSeconds: number): string {
    const s = Math.max(0, Math.floor(totalSeconds))
    const mm = `${Math.floor(s / 60)}`.padStart(2, '0')
    const ss = `${s % 60}`.padStart(2, '0')
    return `${mm}:${ss}`
}

function parseTimeToSeconds(input: string): number | null {
    const t = input.trim()
    if (!t) return null
    if (/^\d+$/.test(t)) return parseInt(t, 10)
    const m = t.match(/^(\d+):(\d{1,2})$/)
    if (!m) return null
    const mm = parseInt(m[1], 10)
    const ss = parseInt(m[2], 10)
    if (ss >= 60) return null
    return mm * 60 + ss
}

function TimeInput({ valueSec, onCommit }: { valueSec: number; onCommit: (seconds: number) => void }) {
    const [text, setText] = useState(formatHMS(valueSec))
    const [lastValid, setLastValid] = useState(formatHMS(valueSec))

    useEffect(() => {
        const next = formatHMS(valueSec)
        setText(next)
        setLastValid(next)
    }, [valueSec])

    const tryCommit = () => {
        const parsed = parseTimeToSeconds(text)
        if (parsed != null) {
            onCommit(parsed)
            const norm = formatHMS(parsed)
            setText(norm)
            setLastValid(norm)
        } else {
            setText(lastValid)
        }
    }

    return (
        <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={tryCommit}
            onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
                else if (e.key === 'Escape') { setText(lastValid); e.currentTarget.blur() }
            }}
            className="w-[50px] rounded bg-transparent border-none text-xs font-bold text-pink tabular-nums focus:outline-none p-0"
        />
    )
}

function parseLine(line: string, sourceIdx: number): Goal | null {
    const t = line.trim()
    if (!t) return null
    const ts = t.match(/^(\d+):(\d{1,2})/) || t.match(/^(\d+)/)
    if (!ts) return null
    let seconds = 0
    if (ts.length === 3) {
        const mm = parseInt(ts[1], 10)
        const ss = parseInt(ts[2], 10)
        if (isNaN(mm) || isNaN(ss)) return null
        seconds = mm * 60 + ss
    } else if (ts.length === 2) {
        seconds = parseInt(ts[1], 10)
    }
    const rest = t.slice(ts[0].length).trim()
    let team: string | undefined
    let scorer: string | undefined
    if (rest) {
        const parts = rest.split(/[-–]|\s{2,}/)
        team = parts[0]?.trim() || undefined
        scorer = parts[1]?.trim() || undefined
    }
    return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, matchTimeSec: seconds, team, scorer, sourceFileIndex: sourceIdx }
}
```

- [ ] **Step 2: Delete BulkPaste.tsx**

```bash
rm src/components/BulkPaste.tsx
```

- [ ] **Step 3: Commit**

```bash
git add src/components/GoalList.tsx
git add -u src/components/BulkPaste.tsx
git commit -m "feat: restyle GoalList with Tailwind, inline BulkPaste as collapsible section"
```

---

### Task 6: Create ClipSettings component (merge HighlightLengthControls + offset settings)

**Files:**
- Create: `src/components/ClipSettings.tsx`
- Delete: `src/components/HighlightLengthControls.tsx`

- [ ] **Step 1: Create ClipSettings.tsx**

```tsx
import { useEffect, useState } from 'react'
import { useAppState } from '../state'

function formatHMS(totalSeconds: number): string {
    const s = Math.max(0, Math.floor(totalSeconds))
    const mm = `${Math.floor(s / 60)}`.padStart(2, '0')
    const ss = `${s % 60}`.padStart(2, '0')
    return `${mm}:${ss}`
}

function parseTimeToSeconds(input: string): number | null {
    const t = input.trim()
    if (!t) return null
    if (/^\d+$/.test(t)) return parseInt(t, 10)
    const m = t.match(/^(\d+):(\d{1,2})$/)
    if (!m) return null
    const mm = parseInt(m[1], 10)
    const ss = parseInt(m[2], 10)
    if (ss >= 60) return null
    return mm * 60 + ss
}

export function ClipSettings() {
    const lengthBeforeGoalSec = useAppState((s) => s.lengthBeforeGoalSec)
    const lengthAfterGoalSec = useAppState((s) => s.lengthAfterGoalSec)
    const setLengthBeforeGoal = useAppState((s) => s.setLengthBeforeGoal)
    const setLengthAfterGoal = useAppState((s) => s.setLengthAfterGoal)
    const matchStartTimeSec = useAppState((s) => s.matchStartTimeSec)
    const setMatchStartTime = useAppState((s) => s.setMatchStartTime)
    const adjustTimestampsByOffset = useAppState((s) => s.adjustTimestampsByOffset)
    const setAdjustTimestampsByOffset = useAppState((s) => s.setAdjustTimestampsByOffset)

    return (
        <div className="rounded-md bg-surface p-3">
            <span className="text-xs font-bold uppercase tracking-wider text-light block mb-2.5">Clip Settings</span>

            <div className="flex gap-3 mb-2">
                <div>
                    <span className="text-[10px] text-muted block mb-1">Before</span>
                    <input
                        type="number"
                        min="0"
                        max="60"
                        value={lengthBeforeGoalSec}
                        onChange={(e) => setLengthBeforeGoal(parseInt(e.target.value) || 0)}
                        className="w-[50px] rounded bg-deep border border-border px-2 py-1 text-sm text-light text-center focus:border-pink focus:outline-none"
                    />
                </div>
                <div>
                    <span className="text-[10px] text-muted block mb-1">After</span>
                    <input
                        type="number"
                        min="0"
                        max="60"
                        value={lengthAfterGoalSec}
                        onChange={(e) => setLengthAfterGoal(parseInt(e.target.value) || 0)}
                        className="w-[50px] rounded bg-deep border border-border px-2 py-1 text-sm text-light text-center focus:border-pink focus:outline-none"
                    />
                </div>
            </div>

            <div className="mt-3">
                <span className="text-[10px] text-muted block mb-1">Match start offset</span>
                <TimeInput valueSec={matchStartTimeSec} onCommit={setMatchStartTime} />
            </div>

            <label className="flex items-center gap-2 mt-3 cursor-pointer">
                <input
                    type="checkbox"
                    checked={adjustTimestampsByOffset}
                    onChange={(e) => setAdjustTimestampsByOffset(e.target.checked)}
                    className="accent-pink"
                />
                <span className="text-xs text-muted">Adjust timestamps by offset</span>
            </label>
        </div>
    )
}

function TimeInput({ valueSec, onCommit }: { valueSec: number; onCommit: (seconds: number) => void }) {
    const [text, setText] = useState(formatHMS(valueSec))
    const [lastValid, setLastValid] = useState(formatHMS(valueSec))

    useEffect(() => {
        const next = formatHMS(valueSec)
        setText(next)
        setLastValid(next)
    }, [valueSec])

    const tryCommit = () => {
        const parsed = parseTimeToSeconds(text)
        if (parsed != null) {
            onCommit(parsed)
            const norm = formatHMS(parsed)
            setText(norm)
            setLastValid(norm)
        } else {
            setText(lastValid)
        }
    }

    return (
        <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={tryCommit}
            onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
                else if (e.key === 'Escape') { setText(lastValid); e.currentTarget.blur() }
            }}
            className="w-[65px] rounded bg-deep border border-border px-2 py-1 text-sm text-light focus:border-pink focus:outline-none"
        />
    )
}
```

- [ ] **Step 2: Delete old file**

```bash
rm src/components/HighlightLengthControls.tsx
```

- [ ] **Step 3: Commit**

```bash
git add src/components/ClipSettings.tsx
git add -u src/components/HighlightLengthControls.tsx
git commit -m "feat: create ClipSettings, merge highlight length + match offset + adjust checkbox"
```

---

### Task 7: Create OutputPanel (Preview + Render + Score)

**Files:**
- Create: `src/components/OutputPanel.tsx`
- Modify: `src/components/PreviewControls.tsx`
- Modify: `src/components/RenderHighlights.tsx`

- [ ] **Step 1: Restyle PreviewControls.tsx with Tailwind**

Replace the entire contents of `src/components/PreviewControls.tsx`:

```tsx
import { useAppState } from '../state'

export function PreviewControls() {
    const isPreviewMode = useAppState((s) => s.isPreviewMode)
    const previewSegments = useAppState((s) => s.previewSegments)
    const currentPreviewSegment = useAppState((s) => s.currentPreviewSegment)
    const startPreview = useAppState((s) => s.startPreview)
    const exitPreview = useAppState((s) => s.exitPreview)
    const nextPreviewSegment = useAppState((s) => s.nextPreviewSegment)
    const prevPreviewSegment = useAppState((s) => s.prevPreviewSegment)
    const goals = useAppState((s) => s.goals)

    if (isPreviewMode) {
        return (
            <div className="rounded-md border border-pink bg-pink/10 p-3">
                <div className="flex items-center gap-2 mb-2">
                    <strong className="text-sm text-pink">Preview Mode</strong>
                    <button
                        onClick={exitPreview}
                        className="rounded bg-pink/20 px-2 py-0.5 text-xs font-semibold text-pink border border-pink/30 cursor-pointer hover:bg-pink/30 transition-colors"
                    >
                        Exit
                    </button>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        onClick={prevPreviewSegment}
                        disabled={currentPreviewSegment === 0}
                        className="rounded bg-surface px-2 py-1 text-xs text-light border-none cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed hover:bg-border transition-colors"
                    >
                        ←
                    </button>
                    <span className="text-xs text-muted">
                        {currentPreviewSegment + 1} / {previewSegments.length}
                    </span>
                    <button
                        onClick={nextPreviewSegment}
                        disabled={currentPreviewSegment >= previewSegments.length - 1}
                        className="rounded bg-surface px-2 py-1 text-xs text-light border-none cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed hover:bg-border transition-colors"
                    >
                        →
                    </button>
                </div>
            </div>
        )
    }

    if (goals.length > 0) {
        return (
            <button
                onClick={startPreview}
                className="w-full rounded-md border border-pink bg-pink/10 px-3 py-2 text-sm font-bold text-pink cursor-pointer hover:bg-pink/20 transition-colors"
            >
                Preview Highlights
            </button>
        )
    }

    return null
}
```

- [ ] **Step 2: Remove adjust-by-offset checkbox from RenderHighlights.tsx**

In `src/components/RenderHighlights.tsx`, replace lines 278-302 (the return JSX) with:

```tsx
    return (
        <div>
            <button
                onClick={onRender}
                disabled={files.length === 0 || goals.length === 0}
                className="w-full rounded-md bg-yellow px-3 py-2.5 text-sm font-bold text-deep border-none cursor-pointer hover:bg-yellow/80 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
                Render MP4
            </button>
            {progress && <div className="mt-2 text-xs text-muted">{progress}</div>}
            {downUrl && (
                <div className="mt-2">
                    <a href={downUrl} download="highlights.mp4" className="text-sm font-semibold text-yellow hover:text-yellow/80">
                        Download highlights.mp4
                    </a>
                </div>
            )}
        </div>
    )
```

Also remove the `adjustTimestampsByOffset` line from the state selectors at the top (line 12) since that's now in ClipSettings. The `adjustTimestampsByOffset` value is still read inside `encodeToMP4` via `useAppState.getState()` — but it's already accessed on line 11 via the selector. Keep the selector for use in the render function, just remove the checkbox UI.

Actually, looking more carefully at the code: `adjustTimestampsByOffset` IS used inside the render function at line 111, passed to `mergeOverlappingGoalSegments`. So keep the selector — only remove the checkbox JSX from the return.

- [ ] **Step 3: Create OutputPanel.tsx**

```tsx
import { useMemo } from 'react'
import { useAppState } from '../state'
import { PreviewControls } from './PreviewControls'
import { RenderHighlights } from './RenderHighlights'

export function OutputPanel() {
    const goals = useAppState((s) => s.goals)

    const scoreCount = useMemo(() => {
        const teamCounts: Record<string, number> = {}
        goals.forEach(goal => {
            if (goal.team) {
                teamCounts[goal.team] = (teamCounts[goal.team] || 0) + 1
            }
        })
        return teamCounts
    }, [goals])

    const teams = Object.entries(scoreCount).sort(([, a], [, b]) => b - a)

    return (
        <div className="rounded-md bg-surface p-3">
            <span className="text-xs font-bold uppercase tracking-wider text-light block mb-2.5">Output</span>

            <div className="flex flex-col gap-2">
                <PreviewControls />
                <RenderHighlights />
            </div>

            {teams.length >= 2 && (
                <div className="mt-3 pt-2.5 border-t border-deep flex items-center justify-center gap-2">
                    <span className="text-sm font-bold text-light">{teams[0][0]}</span>
                    <span className="text-base font-black text-yellow">
                        {teams[0][1]} - {teams[1][1]}
                    </span>
                    <span className="text-sm font-bold text-light">{teams[1][0]}</span>
                </div>
            )}
        </div>
    )
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/OutputPanel.tsx src/components/PreviewControls.tsx src/components/RenderHighlights.tsx
git commit -m "feat: create OutputPanel, restyle Preview + Render with Tailwind"
```

---

### Task 8: Restyle Player info bar with Tailwind

**Files:**
- Modify: `src/components/Player.tsx:294-318`

- [ ] **Step 1: Replace the info bar JSX in Player.tsx**

Replace lines 302-314 (the `<div style={{ marginTop: 4 }}>` block) with:

```tsx
            <div className="mt-1 px-1 text-xs">
                {isPreviewMode ? (
                    <div className="text-muted">
                        <strong className="text-pink">Preview</strong> — Segment {currentPreviewSegment + 1}/{previewSegments.length}
                        {previewSegments.length > 0 && currentPreviewSegment < previewSegments.length && (
                            <span> — {previewSegments[currentPreviewSegment].goals.length} goal(s)</span>
                        )}
                    </div>
                ) : (
                    <div className="text-muted">
                        File {files.length ? currentFileIndex + 1 : 0}/{files.length} — <span className="text-pink font-semibold tabular-nums">{formatHMS(currentTime)}</span>
                    </div>
                )}
            </div>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Player.tsx
git commit -m "refactor: restyle Player info bar with Tailwind"
```

---

### Task 9: Rewrite App.tsx with new layout and remove deleted imports

**Files:**
- Rewrite: `src/App.tsx`
- Delete: `src/components/ChaptersExport.tsx`
- Delete: `src/components/ProjectIO.tsx`

- [ ] **Step 1: Rewrite App.tsx**

```tsx
import './App.css'
import { useRef } from 'react'
import { FilePills } from './components/FilePills'
import { Player } from './components/Player'
import { AddGoalBar } from './components/AddGoalBar'
import { GoalList } from './components/GoalList'
import { ClipSettings } from './components/ClipSettings'
import { OutputPanel } from './components/OutputPanel'
import { useAppState } from './state'

function App() {
    const goals = useAppState((s) => s.goals)
    const setGoals = useAppState((s) => s.setGoals)
    const importRef = useRef<HTMLInputElement | null>(null)

    const onExport = () => {
        const blob = new Blob([JSON.stringify({ goals }, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'project.json'
        a.click()
        URL.revokeObjectURL(url)
    }

    const onImport = async (evt: React.ChangeEvent<HTMLInputElement>) => {
        const file = evt.target.files?.[0]
        if (!file) return
        const text = await file.text()
        try {
            const data = JSON.parse(text)
            if (Array.isArray(data.goals)) {
                setGoals(data.goals)
            }
        } catch {
            alert('Failed to import JSON file.')
        }
        evt.target.value = ''
    }

    return (
        <div className="max-w-[1920px] mx-auto px-4 py-4">
            {/* Top Bar */}
            <div className="flex items-center justify-between mb-4">
                <span className="text-yellow font-black text-xl tracking-[4px]">SHOOOT</span>
                <div className="flex items-center gap-2">
                    <button
                        onClick={onExport}
                        disabled={goals.length === 0}
                        className="rounded bg-surface px-2.5 py-1.5 text-xs font-semibold text-muted border-none cursor-pointer hover:text-light transition-colors disabled:opacity-30"
                    >
                        Export
                    </button>
                    <button
                        onClick={() => importRef.current?.click()}
                        className="rounded bg-surface px-2.5 py-1.5 text-xs font-semibold text-muted border-none cursor-pointer hover:text-light transition-colors"
                    >
                        Import
                    </button>
                    <input
                        ref={importRef}
                        type="file"
                        accept=".json,application/json"
                        onChange={onImport}
                        className="hidden"
                    />
                </div>
            </div>

            {/* File Pills */}
            <div className="mb-3">
                <FilePills />
            </div>

            {/* Player */}
            <Player />

            {/* Add Goal Bar */}
            <div className="mt-1.5 mb-4">
                <AddGoalBar />
            </div>

            {/* Panel Grid */}
            <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-3">
                {/* Goals Panel — spans 2 rows on desktop */}
                <div className="md:row-span-2">
                    <GoalList />
                </div>

                {/* Clip Settings */}
                <ClipSettings />

                {/* Output */}
                <OutputPanel />
            </div>
        </div>
    )
}

export default App
```

- [ ] **Step 2: Delete ChaptersExport and ProjectIO**

```bash
rm src/components/ChaptersExport.tsx src/components/ProjectIO.tsx
```

- [ ] **Step 3: Verify the app compiles**

```bash
npm run build
```

Expected: Build succeeds. If there are import errors, check for any remaining references to deleted components.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git add -u src/components/ChaptersExport.tsx src/components/ProjectIO.tsx
git commit -m "feat: rewrite App.tsx with new layout, remove ChaptersExport + ProjectIO"
```

---

### Task 10: Verify and fix — full build + visual check

**Files:**
- Potentially modify: any file with build errors

- [ ] **Step 1: Run build**

```bash
npm run build
```

Fix any TypeScript or import errors.

- [ ] **Step 2: Run existing tests**

```bash
npm run test:run
```

Expected: All existing util tests pass (they don't depend on UI).

- [ ] **Step 3: Start dev server and visually verify**

```bash
npm run dev
```

Check:
- Page loads with dark navy background
- SHOOOT brand in yellow top-left
- File pills bar visible
- Player full-width with rounded corners
- Add Goal bar below player
- Panel grid: Goals left, Clip Settings + Output right
- Stadium Pink colors throughout (pink goals, yellow render button)
- Mobile: stack to single column at <768px

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve build and style issues from redesign"
```

---

### Task 11: Run lint and final cleanup

**Files:**
- Potentially modify: any file with lint errors

- [ ] **Step 1: Run lint**

```bash
npm run lint
```

Fix any issues (unused imports from deleted components, etc.)

- [ ] **Step 2: Verify no references to deleted components remain**

Search for imports of deleted components:

```bash
grep -r "ChaptersExport\|FilePicker\|FileList\|AddGoalControls\|AddGoalAtCurrentButton\|HighlightLengthControls\|ProjectIO\|BulkPaste" src/ --include="*.tsx" --include="*.ts"
```

Expected: No matches (or only the new files that replaced them).

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "chore: lint cleanup after UI redesign"
```

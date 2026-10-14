// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import type { KnownPlayer } from '../utils/knownPlayers'
import { useState } from 'react'
import { render, screen, fireEvent, within, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RosterTags } from './RosterTags'

let latest: string[] = []
let forgotten: string[] = []
function Harness({ initial = [] as string[], known = [] as KnownPlayer[], exclude = [] as string[] }) {
    const [names, setNames] = useState(initial)
    latest = names
    return <RosterTags label="Team 1 roster" names={names} onChange={setNames} known={known} exclude={exclude} onForget={(n) => forgotten.push(n)} />
}
const kp = (name: string, lastUsed: number): KnownPlayer => ({ name, lastUsed })

describe('RosterTags', () => {
    it('should add a tag on Enter and clear the field', async () => {
        render(<Harness />)
        const input = screen.getByLabelText('Team 1 roster')
        await userEvent.type(input, 'Jo{Enter}')
        expect(latest).toEqual(['Jo'])
        expect(input).toHaveValue('')
        expect(screen.getByRole('button', { name: 'Remove Jo' })).toBeInTheDocument()
    })

    it('should keep a typed name as a draft, not add it, when focus leaves the field', async () => {
        render(<Harness />)
        const input = screen.getByLabelText('Team 1 roster')
        await userEvent.type(input, 'Sam')
        await userEvent.tab()
        expect(latest).toEqual([])
        expect(input).toHaveValue('Sam')
    })

    it('should not add on a typed comma or on Tab', async () => {
        render(<Harness />)
        const input = screen.getByLabelText('Team 1 roster')
        await userEvent.type(input, 'Alex,')
        expect(latest).toEqual([])
        await userEvent.tab()
        expect(latest).toEqual([])
        expect(input).toHaveValue('Alex,')
    })

    it('should add several tags from a pasted list', async () => {
        render(<Harness />)
        const input = screen.getByLabelText('Team 1 roster')
        input.focus()
        await userEvent.paste('1. Jo\n2. Alex, Sam')
        expect(latest).toEqual(['Alex', 'Jo', 'Sam'])
    })

    it('should ignore a duplicate name, whatever its case', async () => {
        render(<Harness initial={['Jo']} />)
        await userEvent.type(screen.getByLabelText('Team 1 roster'), 'jo{Enter}')
        expect(latest).toEqual(['Jo'])
    })

    it('should edit a name inline: Enter saves, Escape cancels', async () => {
        render(<Harness initial={['Jo', 'Alex']} />)
        await userEvent.click(screen.getByRole('button', { name: 'Edit Jo' }))
        let edit = screen.getByRole('textbox', { name: 'Edit Jo' })
        await userEvent.clear(edit)
        await userEvent.type(edit, 'Joe{Enter}')
        expect(latest).toEqual(['Alex', 'Joe'])

        await userEvent.click(screen.getByRole('button', { name: 'Edit Alex' }))
        edit = screen.getByRole('textbox', { name: 'Edit Alex' })
        await userEvent.type(edit, 'zzz{Escape}')
        expect(latest).toEqual(['Alex', 'Joe'])
        expect(screen.getByRole('button', { name: 'Edit Alex' })).toBeInTheDocument()
    })

    it('should save an edit on blur and refuse a rename that duplicates another player', async () => {
        render(<Harness initial={['Alex', 'Jo']} />)
        await userEvent.click(screen.getByRole('button', { name: 'Edit Jo' }))
        const edit = screen.getByRole('textbox', { name: 'Edit Jo' })
        fireEvent.change(edit, { target: { value: 'alex' } })
        fireEvent.blur(edit)
        expect(latest).toEqual(['Alex', 'Jo'])
    })

    it('should show and keep names alphabetically, case-insensitively, also after an edit', async () => {
        render(<Harness initial={['sam', 'Bea']} />)
        await userEvent.type(screen.getByLabelText('Team 1 roster'), 'adam{Enter}')
        expect(latest).toEqual(['adam', 'Bea', 'sam'])
        await userEvent.click(screen.getByRole('button', { name: 'Edit adam' }))
        const edit = screen.getByRole('textbox', { name: 'Edit adam' })
        await userEvent.clear(edit)
        await userEvent.type(edit, 'Zed{Enter}')
        expect(latest).toEqual(['Bea', 'sam', 'Zed'])
    })

    it('should remove a tag with its cross', async () => {
        render(<Harness initial={['Alex', 'Jo']} />)
        await userEvent.click(screen.getByRole('button', { name: 'Remove Jo' }))
        expect(latest).toEqual(['Alex'])
    })

    it('should have no chips inside the input row and list names in a labelled list below it', () => {
        render(<Harness initial={['Jo', 'Alex']} />)
        const list = screen.getByRole('list', { name: 'Team 1 roster players' })
        expect(list.querySelectorAll('li')).toHaveLength(2)
        const input = screen.getByLabelText('Team 1 roster')
        expect(list.contains(input)).toBe(false)
        expect(input.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('should show a player count and a shirt for each player in the team colour', () => {
        render(<RosterTags label="Team 1 roster" names={['Jo', 'Alex']} onChange={() => {}} color="#c2364a" />)
        expect(screen.getByText('2 players')).toBeInTheDocument()
        const list = screen.getByRole('list', { name: 'Team 1 roster players' })
        expect(list.querySelectorAll('svg.roster-shirt')).toHaveLength(2)
        expect(list.querySelector('svg.roster-shirt path')).toHaveAttribute('fill', '#c2364a')
    })

    it('should say 1 player for a single name', () => {
        render(<RosterTags label="Team 1 roster" names={['Jo']} onChange={() => {}} />)
        expect(screen.getByText('1 player')).toBeInTheDocument()
    })

    it('should not remove a chip on Backspace in the empty field', async () => {
        render(<Harness initial={['Alex', 'Jo']} />)
        await userEvent.type(screen.getByLabelText('Team 1 roster'), '{Backspace}')
        expect(latest).toEqual(['Alex', 'Jo'])
    })

    it('should set the mobile keyboard attributes', () => {
        render(<Harness />)
        const input = screen.getByLabelText('Team 1 roster')
        expect(input).toHaveAttribute('enterkeyhint', 'enter')
        expect(input).toHaveAttribute('autocapitalize', 'words')
        expect(input).toHaveAttribute('autocomplete', 'off')
        expect(input).toHaveAttribute('autocorrect', 'off')
        expect(input).toHaveAttribute('spellcheck', 'false')
    })

    it('should keep focus in the field after Enter, for key Enter and for an IME reporting Unidentified keyCode 13', () => {
        render(<Harness />)
        const input = screen.getByLabelText('Team 1 roster')
        input.focus()
        fireEvent.change(input, { target: { value: 'Jo' } })
        expect(fireEvent.keyDown(input, { key: 'Enter', keyCode: 13 })).toBe(false) // default prevented
        expect(latest).toEqual(['Jo'])
        expect(input).toHaveValue('')
        expect(document.activeElement).toBe(input)
        fireEvent.change(input, { target: { value: 'Sam' } })
        fireEvent.keyDown(input, { key: 'Unidentified', keyCode: 13, which: 13 })
        expect(latest).toEqual(['Jo', 'Sam'])
        expect(document.activeElement).toBe(input)
    })

    it('should add on a beforeinput line break and keep focus', () => {
        render(<Harness />)
        const input = screen.getByLabelText('Team 1 roster')
        input.focus()
        fireEvent.change(input, { target: { value: 'Jo' } })
        const ev = new Event('beforeinput', { bubbles: true, cancelable: true }) as Event & { inputType: string }
        ev.inputType = 'insertLineBreak'
        act(() => { input.dispatchEvent(ev) })
        expect(ev.defaultPrevented).toBe(true)
        expect(latest).toEqual(['Jo'])
        expect(document.activeElement).toBe(input)
    })

    it('should not add a name that arrives with a comma in the value', () => {
        render(<Harness />)
        const input = screen.getByLabelText('Team 1 roster')
        fireEvent.change(input, { target: { value: 'Jo,' } })
        expect(latest).toEqual([])
        expect(input).toHaveValue('Jo,')
    })

    it('should add with the Add button, which is disabled while the field is empty, and keep focus in the field', async () => {
        render(<Harness />)
        const add = screen.getByRole('button', { name: 'Add' })
        expect(add).toBeDisabled()
        const input = screen.getByLabelText('Team 1 roster')
        await userEvent.type(input, 'Bea')
        expect(add).toBeEnabled()
        await userEvent.click(add)
        expect(latest).toEqual(['Bea'])
        expect(document.activeElement).toBe(input)
    })

    it('should use the right placeholder for an empty and a filled roster', () => {
        const { unmount } = render(<Harness />)
        expect(screen.getByLabelText('Team 1 roster')).toHaveAttribute('placeholder', 'Type a name, or paste a list')
        unmount()
        render(<Harness initial={['Jo']} />)
        expect(screen.getByLabelText('Team 1 roster')).toHaveAttribute('placeholder', 'Add a player')
    })

    describe('previous players', () => {
        const known = [kp('Sam', 5), kp('Jo', 4), kp('Mojo', 3), kp('Big John', 2)]

        it('should show recent players on focus, not those already in a team, and hide them on blur', async () => {
            render(<Harness known={known} exclude={['sam']} />)
            expect(screen.queryByRole('group', { name: 'Previous players' })).toBeNull()
            await userEvent.click(screen.getByLabelText('Team 1 roster'))
            const group = screen.getByRole('group', { name: 'Previous players' })
            expect(within(group).getAllByRole('button', { name: /^Add / }).map((b) => b.textContent)).toEqual(['Jo', 'Mojo', 'Big John'])
            await userEvent.click(document.body)
            expect(screen.queryByRole('group', { name: 'Previous players' })).toBeNull()
        })

        it('should filter by what is typed (word starts, not mid-word)', async () => {
            render(<Harness known={known} />)
            await userEvent.type(screen.getByLabelText('Team 1 roster'), 'jo')
            const group = screen.getByRole('group', { name: 'Previous players' })
            expect(within(group).getAllByRole('button', { name: /^Add / }).map((b) => b.textContent)).toEqual(['Jo', 'Big John'])
        })

        it('should add a clicked suggestion, keep focus in the field and clear the draft', async () => {
            render(<Harness known={known} />)
            const input = screen.getByLabelText('Team 1 roster')
            await userEvent.type(input, 'ja')
            await userEvent.clear(input)
            await userEvent.type(input, 'jo')
            await userEvent.click(screen.getByRole('button', { name: 'Add Jo' }))
            expect(latest).toEqual(['Jo'])
            expect(input).toHaveValue('')
            expect(document.activeElement).toBe(input)
        })

        it('should not commit half-typed text when a suggestion is pressed', () => {
            render(<Harness known={known} />)
            const input = screen.getByLabelText('Team 1 roster')
            input.focus()
            fireEvent.change(input, { target: { value: 'Bi' } })
            const btn = screen.getByRole('button', { name: 'Add Big John' })
            expect(fireEvent.mouseDown(btn)).toBe(false) // prevented: the input keeps focus
        })

        it('should add exactly what was typed on Enter, never a suggestion', async () => {
            render(<Harness known={known} />)
            await userEvent.type(screen.getByLabelText('Team 1 roster'), 'Jo{Enter}')
            expect(latest).toEqual(['Jo'])
            await userEvent.type(screen.getByLabelText('Team 1 roster'), 'Big{Enter}')
            expect(latest).toEqual(['Big', 'Jo'])
        })

        it('should forget a suggestion with its cross and keep focus in the field', async () => {
            forgotten = []
            render(<Harness known={known} />)
            const input = screen.getByLabelText('Team 1 roster')
            await userEvent.click(input)
            await userEvent.click(screen.getByRole('button', { name: 'Forget Mojo' }))
            expect(forgotten).toEqual(['Mojo'])
            expect(document.activeElement).toBe(input)
        })

        it('should move into the suggestions with ArrowDown, between them with arrows and back with Escape', async () => {
            render(<Harness known={known} />)
            const input = screen.getByLabelText('Team 1 roster')
            await userEvent.type(input, 'jo')
            await userEvent.keyboard('{ArrowDown}')
            expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add Jo' }))
            expect(latest).toEqual([]) // moving into the suggestions did not commit the draft
            await userEvent.keyboard('{ArrowRight}')
            expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add Big John' }))
            await userEvent.keyboard('{ArrowLeft}')
            expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add Jo' }))
            await userEvent.keyboard('{Escape}')
            expect(document.activeElement).toBe(input)
            expect(input).toHaveValue('jo')
            expect(screen.getByRole('group', { name: 'Previous players' })).toHaveAttribute('data-owns-escape')
        })

        it('should add a suggestion chosen with the keyboard and return to the field', async () => {
            render(<Harness known={known} />)
            const input = screen.getByLabelText('Team 1 roster')
            await userEvent.type(input, 'jo')
            await userEvent.keyboard('{ArrowDown}{Enter}')
            expect(latest).toEqual(['Jo'])
            expect(document.activeElement).toBe(input)
        })
    })
})

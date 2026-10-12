// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RosterTags } from './RosterTags'

let latest: string[] = []
function Harness({ initial = [] as string[] }) {
    const [names, setNames] = useState(initial)
    latest = names
    return <RosterTags label="Team 1 roster" names={names} onChange={setNames} />
}

describe('RosterTags', () => {
    it('should add a tag on Enter and on comma, and clear the field', async () => {
        render(<Harness />)
        const input = screen.getByLabelText('Team 1 roster')
        await userEvent.type(input, 'Jo{Enter}')
        await userEvent.type(input, 'Alex,')
        expect(latest).toEqual(['Alex', 'Jo'])
        expect(input).toHaveValue('')
        expect(screen.getByRole('button', { name: 'Remove Jo' })).toBeInTheDocument()
    })

    it('should add the typed name when focus leaves the field', async () => {
        render(<Harness />)
        await userEvent.type(screen.getByLabelText('Team 1 roster'), 'Sam')
        await userEvent.tab()
        expect(latest).toEqual(['Sam'])
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

    it('should remove the last tag on Backspace in the empty field', async () => {
        const onChange = vi.fn()
        render(<RosterTags label="r" names={['Alex', 'Jo']} onChange={onChange} />)
        await userEvent.type(screen.getByLabelText('r'), '{Backspace}')
        expect(onChange).toHaveBeenCalledWith(['Alex'])
    })
})

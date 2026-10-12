// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PersonStep } from './PersonStep'

const base = { label: 'Scorer', placeholder: 'Scorer', query: '', highlighted: 0, showHighlight: false, autoFocus: false }

describe('PersonStep with name chips (touch)', () => {
    it('should show the roster as alphabetical buttons and no text field until + New name', () => {
        render(<PersonStep {...base} chips candidates={['Sam', 'Alex', 'Jo']} onQuery={() => {}} onChoose={() => {}} />)
        const group = screen.getByRole('group', { name: 'Scorer' })
        expect([...group.querySelectorAll('button:not(.person-chip--new)')].map((b) => b.textContent)).toEqual(['Alex', 'Jo', 'Sam'])
        expect(screen.queryByRole('textbox')).toBeNull()
    })
    it('should choose a name with one tap', () => {
        const onChoose = vi.fn()
        render(<PersonStep {...base} chips candidates={['Sam', 'Alex']} onQuery={() => {}} onChoose={onChoose} />)
        fireEvent.click(screen.getByRole('button', { name: 'Sam' }))
        expect(onChoose).toHaveBeenCalledWith('Sam')
    })
    it('should show a disabled name in place and not choose it', () => {
        const onChoose = vi.fn()
        render(<PersonStep {...base} label="Assist" chips candidates={['Sam', 'Alex']} isDisabled={(n) => n === 'Sam'} onQuery={() => {}} onChoose={onChoose} />)
        const sam = screen.getByRole('button', { name: 'Sam' })
        expect(sam).toBeDisabled()
        fireEvent.click(sam)
        expect(onChoose).not.toHaveBeenCalled()
    })
    it('should open a text field only for + New name, and add the typed name', () => {
        const onChoose = vi.fn()
        const onQuery = vi.fn()
        const { rerender } = render(<PersonStep {...base} chips candidates={['Alex']} onQuery={onQuery} onChoose={onChoose} />)
        fireEvent.click(screen.getByRole('button', { name: '+ New name' }))
        const input = screen.getByRole('textbox', { name: 'Scorer' })
        fireEvent.change(input, { target: { value: ' Kit ' } })
        expect(onQuery).toHaveBeenCalledWith(' Kit ')
        rerender(<PersonStep {...base} query=" Kit " chips candidates={[]} onQuery={onQuery} onChoose={onChoose} />)
        fireEvent.click(screen.getByRole('button', { name: 'Add' }))
        expect(onChoose).toHaveBeenCalledWith('Kit')
    })
    it('should offer the skip button when the host gives one', () => {
        const onSkip = vi.fn()
        render(<PersonStep {...base} label="Assist" chips candidates={[]} skipLabel="No assist" onSkip={onSkip} onQuery={() => {}} onChoose={() => {}} />)
        fireEvent.click(screen.getByRole('button', { name: 'No assist' }))
        expect(onSkip).toHaveBeenCalled()
    })
    it('should name the step above the chips only when asked', () => {
        const { rerender, container } = render(<PersonStep {...base} label="Assist" chips candidates={['Sam']} onQuery={() => {}} onChoose={() => {}} />)
        expect(container.querySelector('.person-chips__label')).toBeNull()
        rerender(<PersonStep {...base} label="Assist" chips showLabel candidates={['Sam']} onQuery={() => {}} onChoose={() => {}} />)
        expect(container.querySelector('.person-chips__label')?.textContent).toBe('Assist')
    })
    it('should keep the typed field and name list without chips (fine pointer)', () => {
        render(<PersonStep {...base} candidates={['Sam']} onQuery={() => {}} onChoose={() => {}} />)
        expect(screen.getByRole('textbox', { name: 'Scorer' })).toBeTruthy()
        expect(screen.getByRole('option', { name: 'Sam' })).toBeTruthy()
        expect(screen.queryByRole('button', { name: '+ New name' })).toBeNull()
    })
})

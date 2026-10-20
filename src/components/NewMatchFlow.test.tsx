// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppState } from '../state'
import { NewMatchFlow } from './NewMatchFlow'
import { isFullScreenLayout } from './newMatchLayout'
import * as media from './useMediaQuery'

vi.mock('./goalSetup/GoalSetupSection', () => ({ GoalSetupSection: () => <section aria-label="Goal areas" /> }))
vi.mock('./AddFilesButton', () => ({ AddFilesButton: ({ label }: { label: string }) => <button type="button">{label}</button> }))
vi.mock('../graphics/logoStore', () => ({ loadCustomLogo: vi.fn(async () => null), saveCustomLogo: vi.fn(), clearCustomLogo: vi.fn() }))

const file = { id: 'a', name: 'half1.mp4', url: 'blob:a', file: new File([''], 'a.mp4'), durationSec: 600, kind: 'full' as const }

describe('NewMatchFlow', () => {
    beforeEach(() => {
        useAppState.setState({
            files: [], matchdayLabel: null, panel: 'newmatch',
            teams: [{ name: 'Whites', color: '#f5f5f5', roster: [] }, { name: 'Colours', color: '#c2364a', roster: [] }],
        })
    })

    it('should start on Videos with Add videos and Skip for now', () => {
        render(<NewMatchFlow onClose={() => {}} />)
        expect(screen.getByRole('dialog', { name: 'New match' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Add videos' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled()
        expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Videos'), expect.stringContaining('Match')]))
    })

    it('should show all three steps from the start, Goals explaining it needs the videos and skippable', async () => {
        render(<NewMatchFlow onClose={() => {}} />)
        const steps = within(screen.getByRole('list', { name: 'Steps' })).getAllByRole('listitem').map((li) => li.textContent)
        expect(steps).toEqual(['1Videos', '2Match', '3Goals'])
        await userEvent.click(screen.getByRole('button', { name: 'Skip for now' }))
        await userEvent.click(screen.getByRole('button', { name: 'Next' }))
        expect(screen.getByText(/needs the videos/i)).toBeInTheDocument()
        expect(screen.queryByRole('region', { name: 'Goal areas' })).not.toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    })

    it('should start each step at the top of the window, not where the last step was scrolled to', async () => {
        render(<NewMatchFlow onClose={() => {}} />)
        const sheet = screen.getByRole('dialog', { name: 'New match' })
        sheet.scrollTop = 300
        await userEvent.click(screen.getByRole('button', { name: 'Skip for now' }))
        expect(sheet.scrollTop).toBe(0)
    })

    it('should not close on a click outside or on Escape, only on the cross', async () => {
        const onClose = vi.fn()
        render(<NewMatchFlow onClose={onClose} />)
        await userEvent.click(document.querySelector('.sheet-backdrop')!)
        await userEvent.keyboard('{Escape}')
        expect(onClose).not.toHaveBeenCalled()
        await userEvent.click(screen.getByRole('button', { name: 'Close' }))
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('should reorder videos right in the Videos step, with no later-in-Files hint', async () => {
        const b = { ...file, id: 'b', name: 'half2.mp4' }
        useAppState.setState({ files: [file, b] })
        render(<NewMatchFlow onClose={() => {}} />)
        expect(screen.queryByText(/later in Files/i)).not.toBeInTheDocument()
        const grip = screen.getByRole('button', { name: 'Reorder half1.mp4' })
        grip.focus()
        await userEvent.keyboard('{ArrowDown}')
        expect(useAppState.getState().files.map((f) => f.name)).toEqual(['half2.mp4', 'half1.mp4'])
    })

    it('should skip to Match, finish through Goals with Done, and keep what was typed', async () => {
        const onClose = vi.fn()
        render(<NewMatchFlow onClose={onClose} />)
        await userEvent.click(screen.getByRole('button', { name: 'Skip for now' }))
        expect(screen.getByLabelText('Team 1 name')).toBeInTheDocument()
        await userEvent.type(screen.getByLabelText('Title'), 'Cup final')
        await userEvent.click(screen.getByRole('button', { name: 'Back' }))
        expect(screen.getByRole('button', { name: 'Add videos' })).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Skip for now' }))
        await userEvent.click(screen.getByRole('button', { name: 'Next' }))
        await userEvent.click(screen.getByRole('button', { name: 'Done' }))
        expect(onClose).toHaveBeenCalled()
        expect(useAppState.getState().matchdayLabel).toBe('Cup final')
    })

    it('should keep the Match step simple: final score yes, league logo and graphics style no', async () => {
        render(<NewMatchFlow onClose={() => {}} />)
        await userEvent.click(screen.getByRole('button', { name: 'Skip for now' }))
        expect(screen.getByText('Final score (if you know it)')).toBeInTheDocument()
        expect(screen.queryByRole('img', { name: /league logo/i })).not.toBeInTheDocument()
        expect(screen.queryByRole('radiogroup', { name: 'Graphics style' })).not.toBeInTheDocument()
    })

    it('should list loaded videos, then offer Next through Match to a Goals step ending in Done', async () => {
        useAppState.setState({ files: [file] })
        const onClose = vi.fn()
        render(<NewMatchFlow onClose={onClose} />)
        expect(screen.getByText('half1.mp4')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Skip for now' })).not.toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Next' }))
        expect(screen.getByLabelText('Team 1 name')).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Next' }))
        expect(screen.getByRole('region', { name: 'Goal areas' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Back' }))
        expect(screen.getByLabelText('Team 1 name')).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Next' }))
        await userEvent.click(screen.getByRole('button', { name: 'Done' }))
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    describe('on phones', () => {
        it('should be full screen only on phone layouts', () => {
            expect(['phone', 'landscape', 'tablet', 'desktop'].map(isFullScreenLayout)).toEqual([true, true, false, false])
        })

        it('should render the full-screen layer on a phone and the centred window otherwise', () => {
            const spy = vi.spyOn(media, 'useLayout').mockReturnValue('phone')
            const { unmount } = render(<NewMatchFlow onClose={() => {}} />)
            expect(screen.getByRole('dialog', { name: 'New match' })).toHaveClass('sheet--full')
            unmount()
            spy.mockReturnValue('tablet')
            render(<NewMatchFlow onClose={() => {}} />)
            expect(screen.getByRole('dialog', { name: 'New match' })).not.toHaveClass('sheet--full')
            spy.mockRestore()
        })

        it('should close on the Back button (a history entry) and still ignore Esc', async () => {
            const spy = vi.spyOn(media, 'useLayout').mockReturnValue('phone')
            const onClose = vi.fn()
            await new Promise((r) => setTimeout(r, 20)) // let the previous test's layer finish dropping its history entry
            render(<NewMatchFlow onClose={onClose} />)
            expect((history.state as { newMatch?: boolean } | null)?.newMatch).toBe(true)
            await userEvent.keyboard('{Escape}')
            expect(onClose).not.toHaveBeenCalled()
            history.replaceState(null, '')
            window.dispatchEvent(new PopStateEvent('popstate'))
            expect(onClose).toHaveBeenCalledTimes(1)
            spy.mockRestore()
        })
    })
})

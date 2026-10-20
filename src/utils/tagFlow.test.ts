import { describe, expect, it } from 'vitest'
import { PICKER_OPTIONS } from './eventTypes'
import { breadcrumbs, orderNames, questionFor, tagSteps } from './tagFlow'

const opt = (id: string) => PICKER_OPTIONS.find((o) => o.id === id)!

describe('questionFor', () => {
    it('should ask what happened first', () => {
        expect(questionFor('type', opt('goal'))).toBe('What happened?')
    })
    it('should word the team question per type', () => {
        expect(questionFor('team', opt('goal'))).toBe('Who scored?')
        expect(questionFor('team', opt('goal_pen'))).toBe('Who scored?')
        expect(questionFor('team', opt('own_goal'))).toBe('Whose player put it in?')
        expect(questionFor('team', opt('save'))).toBe('Whose keeper?')
        expect(questionFor('team', opt('foul'))).toBe('Which team?')
    })
    it('should name the person step by the type', () => {
        expect(questionFor('scorer', opt('goal'))).toBe('Scorer')
        expect(questionFor('scorer', opt('save'))).toBe('Goalkeeper')
        expect(questionFor('assist', opt('goal'))).toBe('Assist')
    })
})

describe('tagSteps', () => {
    it('should list the questions a type asks, in order', () => {
        expect(tagSteps(opt('goal'), true)).toEqual(['type', 'team', 'scorer', 'assist'])
        expect(tagSteps(opt('own_goal'), true)).toEqual(['type', 'team', 'scorer'])
        expect(tagSteps(opt('foul'), true)).toEqual(['type', 'team', 'scorer'])
        expect(tagSteps(opt('kick_off'), true)).toEqual(['type'])
    })
    it('should skip the team and person when no teams are set up', () => {
        expect(tagSteps(opt('goal'), false)).toEqual(['type'])
    })
})

describe('breadcrumbs', () => {
    it('should show the time first, then each answer given', () => {
        const crumbs = breadcrumbs({ clock: '12:34', option: opt('goal'), team: 'Whites', scorer: 'DJ', step: 'assist' })
        expect(crumbs.map((c) => c.label)).toEqual(['12:34', 'Goal', 'Whites', 'DJ'])
        expect(crumbs.map((c) => c.step)).toEqual([null, 'type', 'team', 'scorer'])
    })
    it('should stop at the question being asked', () => {
        expect(breadcrumbs({ clock: '1:00', option: opt('goal'), team: 'Whites', step: 'scorer' }).map((c) => c.label)).toEqual(['1:00', 'Goal', 'Whites'])
        expect(breadcrumbs({ clock: '1:00', step: 'type' }).map((c) => c.label)).toEqual(['1:00'])
    })
    it('should mark a skipped person', () => {
        const crumbs = breadcrumbs({ clock: '1:00', option: opt('goal'), team: 'Whites', step: 'assist', scorerSkipped: true })
        expect(crumbs.map((c) => c.label)).toEqual(['1:00', 'Goal', 'Whites', 'No scorer'])
    })
})

describe('orderNames', () => {
    it('should sort A-Z', () => {
        expect(orderNames(['Sam', 'al', 'DJ'])).toEqual(['al', 'DJ', 'Sam'])
    })
    it('should put names added during this tag at the end, in the order added', () => {
        expect(orderNames(['Sam', 'Al', 'Zed', 'Bob'], ['Zed', 'Bob'])).toEqual(['Al', 'Sam', 'Zed', 'Bob'])
    })
    it('should ignore an added name that is not in the roster and match case-insensitively', () => {
        expect(orderNames(['Sam', 'Al', 'zed'], ['Zed', 'Nobody'])).toEqual(['Al', 'Sam', 'zed'])
    })
})

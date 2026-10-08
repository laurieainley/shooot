import { classicTheme } from './classic'
import { shoootTheme } from './shooot'
import type { GraphicsTheme, ThemeId } from './types'

export type { GraphicsTheme, ThemeId } from './types'

export const DEFAULT_THEME_ID: ThemeId = 'shooot'
/** In picker order. */
export const THEMES: readonly GraphicsTheme[] = [shoootTheme, classicTheme]

export const isThemeId = (v: unknown): v is ThemeId => THEMES.some((t) => t.id === v)

/** The theme for an id; anything unknown (an old or foreign project) gets the default. */
export function getTheme(id: unknown): GraphicsTheme {
    return THEMES.find((t) => t.id === id) ?? shoootTheme
}

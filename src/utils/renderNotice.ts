import { isIOS, type PickerEnv } from './fileAccept'

/** Phones and tablets pause a page when you switch app or lock the screen; desktop browsers keep rendering in a background tab. */
export function suspendsInBackground(env: PickerEnv): boolean {
    return isIOS(env) || /Android|Mobile/i.test(env.userAgent)
}

/** What to tell the user while a render runs. */
export function keepOpenNotice(env: PickerEnv): string {
    return suspendsInBackground(env)
        ? 'Keep this screen open until the render finishes. Switching app pauses it; it picks up where it left off.'
        : 'You can switch tabs. Don’t close this one until the render finishes.'
}

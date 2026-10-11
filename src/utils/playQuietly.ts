/** Starts playback; a play() that a following pause() interrupts (AbortError) is ignored, other errors are logged. */
export function playQuietly(player: { play: () => unknown }): void {
    void Promise.resolve(player.play()).catch((e: unknown) => {
        if (e instanceof Error && e.name === 'AbortError') return
        console.error(e)
    })
}

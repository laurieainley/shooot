export type PlayerOptions = {
    controls: boolean
    autoplay: boolean
    preload: 'auto'
    fluid: boolean
    fill: boolean
    controlBar: {
        pictureInPictureToggle: boolean
        currentTimeDisplay: boolean
        timeDivider: boolean
        durationDisplay: boolean
        remainingTimeDisplay: boolean
    }
}

/** video.js options: elapsed `current / duration` (not remaining), no picture-in-picture button. */
export function playerOptions(previewing: boolean): PlayerOptions {
    return {
        controls: !previewing,
        autoplay: false,
        preload: 'auto',
        fluid: false,
        fill: true,
        controlBar: {
            pictureInPictureToggle: false,
            currentTimeDisplay: true,
            timeDivider: true,
            durationDisplay: true,
            remainingTimeDisplay: false,
        },
    }
}

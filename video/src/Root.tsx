import './fonts'
import { Composition } from 'remotion'
import { FPS, H, W } from './brand'
import { loadMedia, type Media } from './data/assets'
import { MotifTest } from './scenes/MotifTest'
import { TEASER_FRAMES, Teaser } from './scenes/Teaser'
import { Demo, demoDuration } from './scenes/Demo'

const empty = {} as Media

export function Root(): React.ReactElement {
    return (
        <>
            <Composition
                id="Teaser"
                component={Teaser}
                durationInFrames={TEASER_FRAMES}
                fps={FPS}
                width={W}
                height={H}
                defaultProps={{ media: empty }}
                calculateMetadata={async () => ({ props: { media: await loadMedia('b') } })}
            />
            {(['a', 'b'] as const).map((track) => (
                <Composition
                    key={track}
                    id={track === 'a' ? 'DemoA' : 'DemoB'}
                    component={Demo}
                    durationInFrames={2400}
                    fps={FPS}
                    width={W}
                    height={H}
                    defaultProps={{ media: empty }}
                    calculateMetadata={async () => {
                        const media = await loadMedia(track)
                        return { props: { media }, durationInFrames: demoDuration(media) }
                    }}
                />
            ))}
            <Composition id="MotifTest" component={MotifTest} durationInFrames={120} fps={FPS} width={W} height={H} />
        </>
    )
}

import { wheelZoomFactor } from '../utils/zoom'

/** A wheel-zoom step that knows the time since the previous wheel event (see `wheelZoomFactor`); one per listener. */
export function wheelPace(): (e: Pick<WheelEvent, 'deltaY' | 'deltaMode' | 'timeStamp'>) => number {
    let last = -Infinity
    return (e) => {
        const since = e.timeStamp - last
        last = e.timeStamp
        return wheelZoomFactor(e.deltaY, e.deltaMode, since)
    }
}

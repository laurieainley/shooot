import { Ground } from '../ui/Ground'
import { Motif } from '../motif/Motif'

export function MotifTest(): React.ReactElement {
    return (
        <Ground pitch={1}>
            <Motif placement={{ cx: 960, cy: 470, width: 1100 }} from={{ x: 300, y: 760 }} fromR={22} blink />
        </Ground>
    )
}

import { FilePills } from './FilePills'
import { Sheet } from './Sheet'

interface FilesSheetProps {
    onClose: () => void
}

/** Loaded files: switch, reorder, remove, add. */
export function FilesSheet({ onClose }: FilesSheetProps) {
    return (
        <Sheet label="Files" onClose={onClose} className="sheet--narrow">
            <FilePills />
        </Sheet>
    )
}

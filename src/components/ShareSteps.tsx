import { DescriptionCopy } from './DescriptionCopy'
import { ThumbnailMaker } from './ThumbnailMaker'
import { YouTubeUpload } from './YouTubeUpload'

interface ShareStepsProps {
    /** Which video the description and thumbnail are for. */
    kind: 'highlights' | 'fullMatch'
}

/** Share on YouTube as three plain steps: upload the video, paste the description, add a thumbnail. */
export function ShareSteps({ kind }: ShareStepsProps) {
    return (
        <ol className="share-steps">
            <li className="share-step">
                <span className="share-step__num" aria-hidden="true">1</span>
                <span className="share-step__label">Upload the video</span>
                <div className="share-step__actions"><YouTubeUpload /></div>
            </li>
            <li className="share-step">
                <span className="share-step__num" aria-hidden="true">2</span>
                <span className="share-step__label">Paste the description</span>
                <DescriptionCopy kind={kind} />
            </li>
            <li className="share-step">
                <span className="share-step__num" aria-hidden="true">3</span>
                <span className="share-step__label">Add a thumbnail</span>
                <div className="share-step__actions share-step__actions--maker"><ThumbnailMaker kind={kind} /></div>
            </li>
        </ol>
    )
}

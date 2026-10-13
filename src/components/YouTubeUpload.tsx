/** Opens YouTube's own upload page in a new tab: nothing is sent to YouTube until the user uploads there. */
export function YouTubeUpload() {
    return (
        <p className="m-0 flex flex-wrap items-center gap-2">
            <a href="https://www.youtube.com/upload" target="_blank" rel="noopener noreferrer" className="btn-quiet no-underline">
                Open YouTube upload <span aria-hidden="true">↗</span>
            </a>
            <span className="export-hint">Upload the MP4 there, then paste the description.</span>
        </p>
    )
}

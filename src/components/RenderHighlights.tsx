import { useState } from 'react'
import { useAppState } from '../state'
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { mergeOverlappingGoalSegments } from '../utils/highlights';

export function RenderHighlights() {
    const files = useAppState((s) => s.files)
    const goals = useAppState((s) => s.goals)
    const cumulativeOffsets = useAppState((s) => s.cumulativeOffsets)
    const matchStartTimeSec = useAppState((s) => s.matchStartTimeSec)
    const adjustTimestampsByOffset = useAppState((s) => s.adjustTimestampsByOffset)
    const lengthBeforeGoalSec = useAppState((s) => s.lengthBeforeGoalSec)
    const lengthAfterGoalSec = useAppState((s) => s.lengthAfterGoalSec)
    const [progress, setProgressState] = useState<string>('')
    const [downUrl, setDownUrl] = useState<string | null>(null)


    const setProgress = (message: string) => {
        console.log('[render]', message)
        setProgressState(message)
    }

    const onRender = async () => {
        try {
            setProgress('Starting render...')
            const highlightBlob = await encodeToMP4()
            const url = URL.createObjectURL(highlightBlob)
            setDownUrl(url)
            setProgress('Done')
        } catch (e) {
            console.error('Render failed:', e)
            setProgress('Render failed')
            setTimeout(() => setProgress(''), 3000)
        }
    }

    async function encodeToMP4() {
        const ffmpeg = new FFmpeg();

        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';

        setProgress('Loading encoder...')

        try {
            setProgress('Fetching FFmpeg core files...')
            const coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript')
            setProgress('Core JS loaded, fetching WASM...')
            const wasmURL = await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm')
            setProgress('WASM loaded, initializing FFmpeg...')

            await ffmpeg.load({ coreURL, wasmURL })
            setProgress('FFmpeg loaded successfully!')
        } catch (loadError: any) {
            setProgress(`FFmpeg load failed: ${loadError.message}`)
            throw loadError
        }

        ffmpeg.on('progress', ({ progress }) => {
            console.log("progress", progress);
            setProgress(`Encoding progress: ${(progress * 100).toFixed(1)}%`);
        });

        // Write input files
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            setProgress(`Loading file ${i + 1}/${files.length}: ${file.name}`);
            await ffmpeg.writeFile(`input_${i}.mp4`, await fetchFile(file.file));
        }

        // Create segments for each goal (configurable length before/after)
        // First, merge overlapping segments to avoid duplicate content
        const mergedSegments = mergeOverlappingGoalSegments(
            goals,
            cumulativeOffsets,
            matchStartTimeSec,
            adjustTimestampsByOffset,
            lengthBeforeGoalSec,
            lengthAfterGoalSec
        );

        if (mergedSegments.length < goals.length) {
            setProgress(`Merged ${goals.length} goals into ${mergedSegments.length} segments to avoid overlap`);
        }

        const segments: string[] = [];
        for (let i = 0; i < mergedSegments.length; i++) {
            const segment = mergedSegments[i];
            const srcIdx = segment.sourceFileIndex ?? 0;
            const startTime = segment.startTime;
            const totalDuration = segment.duration;

            setProgress(`Creating segment ${i + 1}/${mergedSegments.length} from video ${srcIdx + 1}`);

            // Check if we need content from the previous file
            if (startTime < 0 && srcIdx > 0) {
                // Cross-file scenario: need content from previous file
                const timeNeededFromPrevFile = Math.abs(startTime); // How many seconds we need from prev file
                const timeFromCurrentFile = lengthBeforeGoalSec - timeNeededFromPrevFile; // Remaining seconds from current file
                const timeAfterGoal = lengthAfterGoalSec; // configurable seconds after goal

                // Create segment from previous file (final N seconds)
                const prevSegName = `seg_${i}_prev.ts`;
                const prevFileDuration = files[srcIdx - 1].durationSec ?? 0;
                const prevFileStart = Math.max(0, prevFileDuration - timeNeededFromPrevFile);

                setProgress(`Creating segment ${i + 1}/${mergedSegments.length} part 1: ${timeNeededFromPrevFile}s from video ${srcIdx}`);

                await ffmpeg.exec([
                    '-ss', String(prevFileStart),
                    '-i', `input_${srcIdx - 1}.mp4`,
                    '-t', String(timeNeededFromPrevFile),
                    '-c', 'copy',
                    '-bsf:v', 'h264_mp4toannexb',
                    '-f', 'mpegts',
                    prevSegName
                ]);

                // Create segment from current file (start to goal + configurable seconds after)
                const currSegName = `seg_${i}_curr.ts`;
                const currentFileDuration = timeFromCurrentFile + timeAfterGoal;

                setProgress(`Creating segment ${i + 1}/${mergedSegments.length} part 2: ${currentFileDuration}s from video ${srcIdx + 1}`);

                await ffmpeg.exec([
                    '-ss', '0',
                    '-i', `input_${srcIdx}.mp4`,
                    '-t', String(currentFileDuration),
                    '-c', 'copy',
                    '-bsf:v', 'h264_mp4toannexb',
                    '-f', 'mpegts',
                    currSegName
                ]);

                // For cross-file segments, use re-encoding to ensure YouTube compatibility
                const finalSegName = `seg_${i}.ts`;
                const concatListForGoal = `file '${prevSegName}'\nfile '${currSegName}'\n`;
                await ffmpeg.writeFile(`concat_${i}.txt`, new TextEncoder().encode(concatListForGoal));

                setProgress(`Merging cross-file segment ${i + 1}/${mergedSegments.length} (YouTube-compatible)`);

                // Re-encode audio for cross-file segments to ensure YouTube compatibility
                await ffmpeg.exec([
                    '-f', 'concat',
                    '-safe', '0',
                    '-i', `concat_${i}.txt`,
                    '-c:v', 'copy',
                    '-c:a', 'aac',
                    '-ar', '48000',
                    '-ac', '2',
                    '-b:a', '128k',
                    '-avoid_negative_ts', 'make_zero',
                    '-fflags', '+genpts',
                    '-bsf:v', 'h264_mp4toannexb',
                    '-f', 'mpegts',
                    finalSegName
                ]);

                segments.push(finalSegName);
            } else {
                // Standard single-file scenario
                const start = Math.max(0, startTime);
                const segName = `seg_${i}.ts`;

                // Use -ss before input for more accurate seeking (slower but more precise)
                // This ensures we start closer to the requested time, though keyframe alignment may still cause slight variations
                await ffmpeg.exec([
                    '-ss', String(start),
                    '-i', `input_${srcIdx}.mp4`,
                    '-t', String(totalDuration),
                    '-c', 'copy',
                    '-bsf:v', 'h264_mp4toannexb',
                    '-f', 'mpegts',
                    segName
                ]);

                segments.push(segName);
            }

            console.log(`Segment ${i + 1} created`);
        }

        // Create concat file list (ensure trailing newline)
        const concatList = segments.map(seg => `file '${seg}'`).join('\n') + '\n';
        await ffmpeg.writeFile('concat_list.txt', new TextEncoder().encode(concatList));

        setProgress('Concatenating segments...');

        // Debug: Check concat list content
        const concatListContent = await ffmpeg.readFile('concat_list.txt');
        console.log('Concat list content:', new TextDecoder().decode(concatListContent as Uint8Array));

        // Final concatenation with audio normalization for YouTube
        await ffmpeg.exec([
            '-f', 'concat',
            '-safe', '0',
            '-i', 'concat_list.txt',
            '-c:v', 'copy',
            '-c:a', 'aac',
            '-ar', '48000',
            '-ac', '2',
            '-b:a', '128k',
            '-movflags', '+faststart',
            '-avoid_negative_ts', 'make_zero',
            'highlights.mp4'
        ]);

        console.log("ffmpeg 2");

        setProgress('Reading output...');
        const fileData = await ffmpeg.readFile('highlights.mp4');

        return new Blob([fileData as BlobPart], { type: 'video/mp4' });
    }

    return (
        <div>
            <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                        type="checkbox"
                        checked={adjustTimestampsByOffset}
                        onChange={(e) => useAppState.getState().setAdjustTimestampsByOffset(e.target.checked)}
                    />
                    Adjust timestamps by start offset
                </label>
                <div style={{ fontSize: '0.9em', color: '#666', marginTop: 4, marginLeft: 24 }}>
                    When enabled, subtracts the match start offset from goal timestamps when rendering highlights.
                </div>
            </div>

            <button onClick={onRender} disabled={files.length === 0 || goals.length === 0}>Render Highlights (Smart Merge)</button>
            {progress && <div style={{ marginTop: 6 }}>{progress}</div>}
            {downUrl && (
                <div style={{ marginTop: 6 }}>
                    <a href={downUrl} download="highlights.mp4">Download highlights.mp4</a>
                </div>
            )}
        </div>
    )
}
import { useEffect, useRef, useState } from 'react'
import videojs from 'video.js'
import 'video.js/dist/video-js.css'
import 'videojs-hotkeys'
import { useAppState } from '../state'
import { formatHMS } from '../utils/timeline'

export function Player() {
    const videoRef = useRef<HTMLVideoElement | null>(null)
    const playerRef = useRef<any>(null)
    const files = useAppState((s) => s.files)
    const currentFileIndex = useAppState((s) => s.currentFileIndex)
    const setCurrentFileIndex = useAppState((s) => s.setCurrentFileIndex)
    const addGoal = useAppState((s) => s.addGoal)
    const [currentTime, setCurrentTime] = useState(0)
    const setCurrentTimeInFile = useAppState((s) => s.setCurrentTimeInFile)

    useEffect(() => {
        if (!videoRef.current) return
        if (!playerRef.current) {
            playerRef.current = videojs(videoRef.current, {
                controls: true,
                autoplay: false,
                preload: 'auto',
                fluid: true,
            })

            // Enable hotkeys once the player is ready
            playerRef.current.ready(() => {
                if (playerRef.current) {
                    (playerRef.current as any).hotkeys({
                        volumeStep: 0.1,          // Volume change step (10%)
                        seekStep: 5,              // Seek step in seconds (aligns with typical keyframes)
                        enableModifiersForNumbers: false, // Disable Shift+number shortcuts
                        enableVolumeScroll: false, // Disable mouse wheel volume
                        enableHoverScroll: false,  // Disable hover + scroll volume
                        enableFullscreen: true,    // Enable F for fullscreen
                        alwaysCaptureHotkeys: true, // Capture hotkeys even when not focused
                        enableNumbers: true,       // Enable 0-9 for seeking
                        customKeys: {
                            // Speed controls
                            decreaseSpeed: {
                                key: function (event: KeyboardEvent) {
                                    return event.which === 188 && event.shiftKey; // Shift + comma (<)
                                },
                                handler: function (player: any) {
                                    const currentRate = player.playbackRate();
                                    const newRate = Math.max(0.25, currentRate - 0.25);
                                    player.playbackRate(newRate);
                                    console.log(`Playback speed: ${newRate}x`);
                                }
                            },
                            increaseSpeed: {
                                key: function (event: KeyboardEvent) {
                                    return event.which === 190 && event.shiftKey; // Shift + period (>)
                                },
                                handler: function (player: any) {
                                    const currentRate = player.playbackRate();
                                    const newRate = Math.min(4, currentRate + 0.25);
                                    player.playbackRate(newRate);
                                    console.log(`Playback speed: ${newRate}x`);
                                }
                            },
                            // Home key - jump to start
                            jumpToStart: {
                                key: function (event: KeyboardEvent) {
                                    return event.which === 36; // Home key
                                },
                                handler: function (player: any) {
                                    player.currentTime(0);
                                }
                            },
                            // End key - jump to end
                            jumpToEnd: {
                                key: function (event: KeyboardEvent) {
                                    return event.which === 35; // End key
                                },
                                handler: function (player: any) {
                                    const duration = player.duration();
                                    if (duration) {
                                        player.currentTime(duration - 1); // 1 second before end
                                    }
                                }
                            },
                            // ? key - reset speed to normal
                            resetSpeed: {
                                key: function (event: KeyboardEvent) {
                                    return event.which === 191 && event.shiftKey; // Shift + / (?)
                                },
                                handler: function (player: any) {
                                    player.playbackRate(1);
                                    console.log('Playback speed: 1x (normal)');
                                }
                            },
                            // G key - add goal at current time
                            addGoal: {
                                key: function (event: KeyboardEvent) {
                                    return event.which === 71; // G key
                                },
                                handler: function (player: any) {
                                    const currentTimeSeconds = Math.floor(player.currentTime() || 0);
                                    // Get the current file index from the store to avoid stale closure
                                    const currentIdx = useAppState.getState().currentFileIndex;
                                    addGoal({
                                        id: `${Date.now()}`,
                                        matchTimeSec: currentTimeSeconds,
                                        sourceFileIndex: currentIdx
                                    });
                                    console.log(`Goal added at ${currentTimeSeconds}s for Video ${currentIdx + 1}`);
                                }
                            },
                            // [ key - switch to previous video
                            prevVideo: {
                                key: function (event: KeyboardEvent) {
                                    return event.which === 219 || event.keyCode === 219; // [ key
                                },
                                handler: function () {
                                    const state = useAppState.getState();
                                    if (state.currentFileIndex > 0) {
                                        const newIndex = state.currentFileIndex - 1;
                                        state.setCurrentFileIndex(newIndex);
                                        console.log(`Switched to Video ${newIndex + 1}`);
                                    }
                                }
                            },
                            // ] key - switch to next video
                            nextVideo: {
                                key: function (event: KeyboardEvent) {
                                    return event.which === 221 || event.keyCode === 221; // ] key
                                },
                                handler: function () {
                                    const state = useAppState.getState();
                                    if (state.currentFileIndex < state.files.length - 1) {
                                        const newIndex = state.currentFileIndex + 1;
                                        state.setCurrentFileIndex(newIndex);
                                        console.log(`Switched to Video ${newIndex + 1}`);
                                    }
                                }
                            }
                        }
                    })
                }
            })
        }
        const p = playerRef.current
        if (files.length > 0) {
            p.src({ src: files[currentFileIndex]?.url, type: 'video/mp4' })
        }
        p.on('timeupdate', () => {
            const t = p.currentTime() || 0
            setCurrentTime(t)
            setCurrentTimeInFile(t)
        })
        p.on('ended', () => {
            if (currentFileIndex < files.length - 1) {
                setCurrentFileIndex(currentFileIndex + 1)
            }
        })

        return () => {
            // do not dispose across renders in dev HMR
        }
    }, [files, currentFileIndex])

    return (
        <div>
            <video ref={videoRef} className="video-js vjs-default-skin" />
            <div style={{ marginTop: 4 }}>
                File {files.length ? currentFileIndex + 1 : 0}/{files.length} — Current time: {formatHMS(currentTime)}
            </div>
        </div>
    )
}



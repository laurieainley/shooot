#!/bin/bash
# Renders the deliverables into the main checkout's video/out (git-ignored). Usage: scripts/render.sh [teaser|b|a]...
set -e
cd "$(dirname "$0")/.."
OUT=${OUT:-/Users/foundersfactory/code/shooot/video/out}
mkdir -p "$OUT"
for what in "$@"; do
  case $what in
    teaser)
      npx remotion render Teaser "$OUT/demo-hero-loop.mp4" --codec=h264 --crf=18 --muted --concurrency=4
      ffmpeg -y -loglevel error -i "$OUT/demo-hero-loop.mp4" -c:v libvpx-vp9 -b:v 1300k -maxrate 1800k -row-mt 1 -deadline good -cpu-used 2 -an "$OUT/demo-hero-loop.webm"
      ffmpeg -y -loglevel error -i "$OUT/demo-hero-loop.mp4" -vf "select=eq(n\,300)" -frames:v 1 "$OUT/demo-hero-loop-poster.png"
      ;;
    a|b)
      C=$(echo "$what" | tr a-z A-Z)
      npx remotion render "Demo$C" "$OUT/.demo-full-$what.raw.mp4" --codec=h264 --crf=20 --audio-bitrate=192k --concurrency=4
      # Loudness: -16 LUFS integrated, -1.5 dBTP (the raw mix peaks at 0 dBFS).
      ffmpeg -y -loglevel error -i "$OUT/.demo-full-$what.raw.mp4" -c:v copy -af loudnorm=I=-16:TP=-1.5:LRA=11 -ar 48000 -c:a aac -b:a 192k -movflags +faststart "$OUT/demo-full-$what.mp4"
      rm -f "$OUT/.demo-full-$what.raw.mp4"
      ;;
  esac
done

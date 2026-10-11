#!/bin/bash
# Contact sheet of stills: scripts/sheet.sh <Composition> <name> <frame> [frame...]
# Bundles once (set NOBUNDLE=1 to reuse), renders each frame, tiles them 3 across at 640×360.
set -e
cd "$(dirname "$0")/.."
OUT=${SHEET_DIR:-/private/tmp/claude-501/-Users-foundersfactory-code-shot-stopper/9a0d1d18-93c2-45ab-8fc1-734bff63b2c3/scratchpad/design}
B=${BUNDLE:-/private/tmp/claude-501/-Users-foundersfactory-code-shot-stopper/9a0d1d18-93c2-45ab-8fc1-734bff63b2c3/scratchpad/bundle}
COMP=$1; NAME=$2; shift 2
mkdir -p "$OUT/frames"
if [ -z "$NOBUNDLE" ]; then npx remotion bundle --out-dir="$B" --log=error >/dev/null; fi
FILES=()
for F in "$@"; do
  P="$OUT/frames/$COMP-$F.png"
  npx remotion still "$B" "$COMP" "$P" --frame="$F" --log=error ${PROPS:+--props="$PROPS"} >/dev/null
  ffmpeg -y -loglevel error -i "$P" -vf "scale=640:360,drawtext=text='$F':x=8:y=8:fontcolor=white:fontsize=20:box=1:boxcolor=black@0.6" "$P.s.png"
  FILES+=("$P.s.png")
done
N=${#FILES[@]}; COLS=$(( N < 3 ? N : 3 )); ROWS=$(( (N + 2) / 3 ))
ARGS=(); for f in "${FILES[@]}"; do ARGS+=(-i "$f"); done
if [ "$N" -eq 1 ]; then cp "${FILES[0]}" "$OUT/video-$NAME.png"; else
ffmpeg -y -loglevel error "${ARGS[@]}" -filter_complex "$(for i in $(seq 0 $((N-1))); do printf '[%d:v]' $i; done)xstack=inputs=$N:layout=$(for i in $(seq 0 $((N-1))); do printf '%d_%d|' $(( (i%3)*640 )) $(( (i/3)*360 )); done | sed 's/|$//'):fill=black" "$OUT/video-$NAME.png"
fi
echo "$OUT/video-$NAME.png"

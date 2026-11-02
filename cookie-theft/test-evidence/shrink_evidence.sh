#!/usr/bin/env bash
# shrink_evidence.sh: make the screenshot evidence small enough to live in the repo.
# Every PNG under the given directories becomes a 960-px-wide JPEG (quality 4) and the PNG is
# removed; in a frames directory a contact sheet per step (6 x 3 tiles) is built as well.
#   ./shrink_evidence.sh frames results/fixed-chrome ...
set -euo pipefail
for dir in "$@"; do
  [ -d "$dir" ] || { echo "skip $dir (not a directory)"; continue; }
  n=0
  while IFS= read -r -d '' png; do
    jpg="${png%.png}.jpg"
    # -nostdin: otherwise ffmpeg swallows the file list being read on stdin
    ffmpeg -nostdin -v error -y -i "$png" -vf "scale=960:-2" -q:v 4 "$jpg" && rm -f "$png"
    n=$((n + 1))
  done < <(find "$dir" -maxdepth 1 -name '*.png' -print0)
  echo "$dir: $n PNGs -> JPEG"
  # contact sheets for frame sequences (files named <step>-fNN-....jpg)
  for step in $(ls "$dir" | sed -n 's/^\(.*\)-f[0-9][0-9]-[0-9]*ms\.jpg$/\1/p' | sort -u); do
    ffmpeg -nostdin -v error -y -framerate 2 -pattern_type glob -i "$dir/${step}-f*.jpg" \
      -vf "scale=640:-2,tile=6x3:padding=4:color=black" -frames:v 1 -q:v 4 "$dir/${step}-SHEET.jpg"
    echo "  sheet: $dir/${step}-SHEET.jpg"
  done
done
du -sh "$@"

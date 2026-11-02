#!/bin/zsh
# Usage: ./forge/gen.sh [id ...]  → art/forge/<id>.png 1920x1088 (Z-Image-Turbo, 4-bit, SEED=7)
export PATH="$HOME/.local/bin:$PATH"; cd "$(dirname "$0")"
ids=("$@"); [[ ${#ids} -eq 0 ]] && ids=($(cut -d'|' -f1 prompts.txt))
for id in $ids; do
  p="$(grep "^$id|" prompts.txt | cut -d'|' -f2-) $(cat style.txt)"
  rm -f "$id.png"   # mflux never overwrites: it would save to <id>_1.png
  mflux-generate-z-image-turbo --prompt "$p" --width 1920 --height 1088 --steps 8 --seed ${SEED:-7} --quantize 4 --output "$id.png" 2>&1 | grep -E 'Saved|rror' || true
  echo "=== done $id $(date +%H:%M:%S)"
done

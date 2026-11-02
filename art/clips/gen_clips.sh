#!/bin/zsh
# Usage: ./clips/gen_clips.sh [id ...]   env: DIR=car (stills+motion.txt folder, default .) W= H= FRAMES=33 STEPS=30 SEED=7
# $D/chains.txt lines "child parent": the child clip starts from the LAST FRAME of clips/parent.mp4 (continuous scene)
# Renders clips/<id>.mp4 with Wan 2.2 TI2V-5B (mlx-gen, 8-bit) from art/<id>.png + motion.txt, then frames.sh → public/films/<id>/
cd "$(dirname "$0")/.."
D=${DIR:-.}
ids=("$@"); [[ ${#ids} -eq 0 ]] && ids=($(cut -d"|" -f1 $D/motion.txt))
for id in $ids; do
  p="$(grep "^$id|" $D/motion.txt | cut -d'|' -f2-)"
  img=$D/$id.png
  parent=$(grep "^$id " $D/chains.txt 2>/dev/null | cut -d' ' -f2)
  if [ -n "$parent" ]; then
    mkdir -p $D/_last; img=$D/_last/$parent.png
    ffmpeg -v error -y -sseof -0.05 -i clips/$parent.mp4 -update 1 -frames:v 1 "$img" || { echo "no parent clip $parent"; continue; }
  fi
  echo "=== $id start $(date +%H:%M:%S)"
  $HOME/.local/share/mlxgen/bin/mlxgen generate --model AbstractFramework/wan2.2-ti2v-5b-diffusers-bf16 --quantize 8 --task i2v \
    --image "$img" --prompt "$p" --frames ${FRAMES:-33} --width ${W:-1280} --height ${H:-704} --steps ${STEPS:-30} --seed ${SEED:-7} --output clips/$id.mp4 2>&1 | tr '\r' '\n' | grep -E 'Saved|rror|Peak' || true
  [ -f clips/$id.mp4 ] && ./frames.sh $id clips/$id.mp4 ${FRAME_W:-1280}
  [ -n "$parent" ] && [ -f clips/$id.mp4 ] && ffmpeg -v error -y -i "$img" -q:v 3 ../public/films/$id.jpg   # chained still = parent's last frame
  echo "=== $id done $(date +%H:%M:%S)"
done

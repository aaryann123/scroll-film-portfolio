#!/bin/zsh
# Usage: [REVERSE=1] ./frames.sh <id> <clip.mp4> [width]   (REVERSE plays the clip backwards and sets the still to its last frame)  → public/films/<id>/f_001.webp … and sets "frames" on the chapter in content.json
set -e
id=$1; clip=$2; w=${3:-1280}
out=../public/films/$id; rm -rf "$out"; mkdir -p "$out"
tmp=$(mktemp -d)
# ponytail: 2x motion-interpolated frames; swap in RIFE if ghosting shows
rev=""; [ -n "$REVERSE" ] && rev="reverse,"
ffmpeg -v error -y -i "$clip" -vf "${rev}minterpolate=fps=48:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,scale=$w:-2" "$tmp/f_%03d.png"
$HOME/.local/share/uv/tools/mflux/bin/python - "$tmp" "$out" <<'PY'
import sys, glob, os
from PIL import Image
src, dst = sys.argv[1:3]
for f in sorted(glob.glob(f"{src}/f_*.png")):
    Image.open(f).convert("RGB").save(os.path.join(dst, os.path.basename(f)[:-4] + ".webp"), "WEBP", quality=82, method=4)
PY
[ -n "$REVERSE" ] && ffmpeg -v error -y -i "$tmp/f_001.png" -q:v 3 "../public/films/$id.jpg"
rm -rf "$tmp"
n=$(ls "$out" | wc -l | tr -d ' ')
node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync('../content.json'));(c.frames??={})['$id']=$n;fs.writeFileSync('../content.json',JSON.stringify(c,null,2)+'\n')"
echo "$id: $n frames at ${w}px → $(du -sh $out | cut -f1)"

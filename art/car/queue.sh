#!/bin/zsh
cd "$(dirname "$0")/.."
SEED=21 ./car/gen.sh open-crowd chassis polish
for id in open-crowd chassis polish; do ffmpeg -v error -y -i car/$id.png -q:v 3 ../public/films/$id.jpg; done
echo "=== stills redone $(date +%H:%M:%S)"
DIR=car FRAMES=49 ./clips/gen_clips.sh open-drape chassis chassis-b panels panels-b wheels wheels-b polish driver start race race-b horizon open-polish open-crowd
echo "=== all clips done $(date +%H:%M:%S)"

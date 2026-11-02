# The film

The site is one scroll-scrubbed film, structured like pear.no: one of three openers (rotated per visit), eight story shots joined by particle dissolves, and a footer loop. Everything is rendered locally on Apple silicon; nothing is uploaded.

## Story: The Car (current)

Old hands build the new machine. Openers `open-drape`, `open-polish`, `open-crowd`. Story `chassis → chassis-b → panels → panels-b → wheels → wheels-b → polish → driver → start → race → race-b → horizon`. The `-b` shots are chained: each starts from the last frame of its parent clip (`art/car/chains.txt`), so the scene is continuous and the engine hard-cuts instead of dissolving (`continuous` in `content.json`). Clips are 49 frames. Assets in `art/car/`; `art/car/queue.sh` is the full production run; Run clips with `DIR=car FRAMES=49 art/clips/gen_clips.sh [id …]`.

## Earlier story: The Forge (retired)

Openers `open-coals`, `open-bar`, `open-door`. Story `fire → hammer → turned → quench → file → keys → lock → door-open`. A bar of iron goes into the coals, is hammered, turned, quenched and filed into a key; a second hand (halftone, the apprentice) sets down the copy; the key turns the lock; the door opens onto the sky, and the forge is visible through it.

Chapter copy rides on shots (see `chapters[].shots` in `content.json`): Bench→fire, Foundations→hammer, Day Job→turned+quench, Side Bench→file, Method→keys, Door→lock+door-open.

## Pipeline

1. Stills: `art/forge/gen.sh [id …]` → `art/forge/<id>.png` (Z-Image-Turbo, 4-bit, ~7 min each). Prompts in `art/forge/prompts.txt`, shared style in `art/forge/style.txt`. Then `ffmpeg -i art/forge/<id>.png -q:v 3 public/films/<id>.jpg`.
2. Motion: `DIR=forge art/clips/gen_clips.sh [id …]` → `art/clips/<id>.mp4` (Wan 2.2 5B via mlx-gen, 33 frames, 1280×704, 30 steps, ~16 min each). Prompts in `art/forge/motion.txt`. The script then runs `art/frames.sh`, which motion-interpolates to 63 frames, writes `public/films/<id>/f_NNN.webp`, and records the count under `frames` in `content.json`.
3. The engine (`src/scene.js`) scrubs each shot's frames over the first 72% of its scroll slot, particle-dissolves into the next over the last 20%, ping-pongs the opener until the first scroll, and keeps only the current shot and its neighbours decoded.

Halftone boxes (`halftone` in `content.json`, percent of the frame) mark the apprentice's hand in `hammer` and `keys`.

Test an opener with `?open=open-door`.

## Local-model notes

Wan 2.2 5B drifts on faces, so the story is shot on hands and objects only. Z-Image adds a figure whenever the style text mentions clothing; the forge style says "only hands and forearms". Timings on the M4 Max: still 7 min; clip 16 min at 1280×704, 8 min at 960×544.

## Installing the generators

Neither generator is a dependency of the site. To render again: `uv tool install --python 3.12 mflux` (stills, depth, and the Pillow that `art/frames.sh` uses), and `uv venv --python 3.12 ~/.local/share/mlxgen && uv pip install --python ~/.local/share/mlxgen/bin/python mlx-gen`, then `mlxgen download --model AbstractFramework/wan2.2-ti2v-5b-diffusers-bf16`. Expect about 35 GB of downloads.

# Building

## Requirements

| | |
|---|---|
| Node | 18+ (Vite 6); 22+ for `Tools/screenshots.mjs` |
| Browser | WebGL2 for the film |
| ffmpeg | For clips → frames, and posters |
| Generators | Apple silicon, `mflux` (stills) and `mlx-gen` (clips), only to render new art |
| Chrome | For screenshots |

## First run

```sh
npm install
npm run dev          # http://localhost:5757, strict port
npm test             # vite build + check.mjs
npm run build        # static site in dist/
```

## Layout

```
index.html                 shell
src/main.js                content, chapters, scroll progress, copy fades
src/scene.js               WebGL2 film engine
src/style.css              styles
content.json               placeholder copy + film structure (committed)
content.local.json         your copy (git-ignored, optional)
check.mjs                  build assertions
public/films/<id>.jpg      posters (committed)
public/films/<id>/         WebP frames (generated, git-ignored)
art/car/                   current story: prompts.txt, motion.txt, style.txt, chains.txt, gen.sh, queue.sh
art/forge/                 earlier story, same layout
art/clips/gen_clips.sh     clip renderer
art/frames.sh              clip → frames
prompts.md                 story, pipeline and model notes
Tools/screenshots.mjs      screenshot capture
```

## Your own copy

Create `content.local.json` next to `content.json`:

```json
{
  "name": "Ada Example",
  "title": "Ada Example — Built the old way",
  "mark": "AE",
  "email": "ada@example.com",
  "links": [{ "label": "GitHub", "href": "https://github.com/ada" }]
}
```

Add `chapters` too to replace the chapter text; keep each chapter's `shots` pointing at ids in `content.json`. Restart `npm run dev` the first time you create the file.

## Rendering the film

Install the generators as described at the end of `prompts.md` (about 35 GB). Then, from `art/`:

```sh
./car/gen.sh                                   # stills → art/car/<id>.png, ~7 min each on an M4 Max
for id in $(cut -d'|' -f1 car/prompts.txt); do ffmpeg -y -i car/$id.png -q:v 3 ../public/films/$id.jpg; done
DIR=car FRAMES=49 ./clips/gen_clips.sh         # clips → art/clips/<id>.mp4 → public/films/<id>/
```

`gen_clips.sh` renders each clip at 1280×704 (about 16 minutes each; `W=960 H=544` halves that), then calls `frames.sh`, which interpolates to roughly double the frames, writes WebP, and records the count in `content.json`. Shots listed in `art/car/chains.txt` start from their parent clip's last frame. `art/car/queue.sh` is the full production run.

If you already have clips, `./frames.sh <id> clips/<id>.mp4` rebuilds one shot's frames without any model.

## Adding a shot

1. Add `id|prompt` lines to `art/car/prompts.txt` and `art/car/motion.txt`.
2. Render the still and clip for that id.
3. Add the id to `shots` (or `openers`) in `content.json`, and to a chapter's `shots`.
4. If it continues the previous clip, add `child parent` to `chains.txt` and the id to `continuous`.
5. `npm test`.

## Regenerating screenshots

```sh
npm run dev &
node Tools/screenshots.mjs http://localhost:5757
```

The script loads `/?open=open-drape`, scrolls to a point inside each shot, waits until that shot's frames are decoded, and captures at 800×500 CSS pixels and 2× (the Q&A shot uses 800×640). Run it against a checkout without `content.local.json` so the placeholder copy shows. Look at every PNG before committing.

## Not supported yet

The art pipeline is Apple silicon only (MLX). The site itself runs anywhere. Frames are individual WebP files rather than one video stream, which is simple and seekable but heavy: about 57 MB for the 13 shots.

# Architecture

```
content.json (+ content.local.json)
        │ chapters, openers, shots, frames, continuous
        ▼
src/main.js ── builds .chapter copy + one 300vh .slot per shot
        │      scroll → p ∈ [0, shots)  (eased 12 % per frame)
        ▼
src/scene.js ── draw(p): shot A = floor(p), B = A+1, t = frac(p)
        │         ensure() frames for A±1, release() beyond ±2
        ▼
WebGL2 full-screen triangle ── FS: cover-fit, frame blend, zoom, particle dissolve, bottom scrim
        ▲
public/films/<shot>.jpg            poster, first texture
public/films/<shot>/f_NNN.webp     frame sequence, fetched in order
```

| File | Responsibility |
|---|---|
| `src/main.js` | Picks the opener, builds chapters and rail, computes scroll progress, fades copy in and out, calls `scene.draw`. Merges `content.local.json` over `content.json`. |
| `src/scene.js` | Owns the GL context, shader, per-shot textures, frame loading and release, and the per-frame uniforms. |
| `src/style.css` | Fixed chrome and rail, sticky copy, letterpress headlines, mobile and reduced-motion rules. |
| `check.mjs` | Builds with Vite and asserts on the bundle. |
| `art/frames.sh` | Clip → motion-interpolated WebP frames → updates `frames` in `content.json`. |
| `art/clips/gen_clips.sh` | Still + motion prompt → Wan 2.2 clip, chaining continuous shots from the parent's last frame. |

## Scroll to shot

Every shot owns one `.slot` 300 vh tall. Progress `p` is scroll offset divided by slot height, so `floor(p)` is the shot and `frac(p)` the phase. The drawn value eases toward the target (`shown += (target - shown) * 0.12`), which smooths trackpad jitter without a scrolling library. Within a phase, frames scrub over 0–0.72 and the dissolve runs over 0.80–1.0; the gap is a held frame so the copy can be read.

## Two textures per shot

Each shot has `col` and `col2`. `showFrame` uploads frame `i` and `i+1` and the shader mixes them by the fractional position, so a 95-frame shot scrubbed slowly does not step. Uploads only happen when the integer frame changes.

## The dissolve

The screen is cut into cells of `dotPx × 1.6`. Each cell gets a hash threshold in [0, 0.85]; as `mixAB` passes it, the cell's dot of shot A shrinks to nothing over a 0.15 band and shot B shows through. Because the thresholds are random per cell, the cut reads as particles rather than a wipe. Continuous shots skip it: the next clip starts on the last frame of this one, so a hard cut is invisible.

## Frame loading

`ensure()` fetches a shot's frames sequentially and decodes each to an `ImageBitmap` with `imageOrientation: "flipY"`, so uploads skip the WebGL flip. Shots more than two slots away are released (`ImageBitmap.close()`), keeping at most three shots decoded. Frames come as 1280 px WebP at quality 82, about 50 KB each.

## Placeholder and real copy

`import.meta.glob("../content.local.json", { eager: true })` resolves at build time to the file if it exists and to nothing if not, so the repository ships placeholder copy while a local build uses yours, with no config flag. The merge is shallow: a key in the local file replaces the whole key.

## Things that bit us

- **Vite answers missing files with index.html.** A fresh clone has no frames, and `/films/x/f_001.webp` returned 200 with HTML, so every shot retried 95 fetches on every animation frame. Fix: the first failed decode marks the shot `missing` and stops loading it; the poster stays up.
- **Wan 2.2 5B drifts on faces.** Faces changed over the course of a clip. Fix: the story is shot on hands, backs and objects, and the prompts say so.
- **Z-Image adds a figure whenever the style mentions clothing.** Fix: the forge style text says "Only hands and forearms are visible", and adds "no faces, no heads, no bodies".
- **mflux never overwrites.** It saves to `<id>_1.png` if the file exists. Fix: the generator scripts delete the target first.
- **Chained clips need the parent's last frame.** Fix: `gen_clips.sh` extracts it with `ffmpeg -sseof` into `art/car/_last/` and uses it as the child's start image, then copies it to the child's poster.

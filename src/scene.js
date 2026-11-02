// One fixed WebGL2 canvas scrubbing a sequence of shots (frame sequences), joined by
// particle dissolves, the way pear.no cuts between scenes.
// ponytail: raw WebGL2, no three.js. Frames = /films/<shot>/f_NNN.webp, still = /films/<shot>.jpg

const VS = `#version 300 es
in vec2 a; out vec2 v; void main(){ v = a * .5 + .5; gl_Position = vec4(a, 0., 1.); }`;

const FS = `#version 300 es
precision highp float;
in vec2 v; out vec4 o;
uniform sampler2D colA, colA2, colB;
uniform vec2 res; uniform float imgAspect, fracA, zoomA, zoomB, mixAB, dotPx;
uniform vec4 boxA;

vec2 cover(vec2 uv){ float c = res.x / res.y; vec2 s = c > imgAspect ? vec2(1., imgAspect / c) : vec2(c / imgAspect, 1.); return (uv - .5) * s + .5; }
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

vec3 shot(sampler2D c0, sampler2D c1, float f, float zoom, vec2 uv0, vec4 box, bool tone){
  vec2 uv = (uv0 - .5) / zoom + .5;
  vec3 c = mix(texture(c0, uv).rgb, texture(c1, uv).rgb, f);
  if (tone) {                                        // halftone the "AI" box
    vec2 b = (uv - box.xy) / box.zw;
    if (all(greaterThan(b, vec2(0.))) && all(lessThan(b, vec2(1.)))) {
      float l = dot(c, vec3(.299, .587, .114));
      float r = length(fract(gl_FragCoord.xy / dotPx) - .5);
      float d = smoothstep(.5 * l + .08, .5 * l - .02, r);
      c = mix(c, c * .35 + .05, d * .9);
    }
  }
  return c;
}
void main(){
  vec2 uv = cover(v);
  vec3 a = shot(colA, colA2, fracA, zoomA, uv, boxA, true);
  vec3 b = shot(colB, colB, 0., zoomB, uv, boxA, false);
  // particle dissolve: each dot-cell flips A→B at its own threshold; A shrinks to a dot first
  vec2 cell = floor(gl_FragCoord.xy / (dotPx * 1.6));
  float h = hash(cell) * .85;                        // thresholds in [0, .85]
  float band = .15;
  float k = clamp((mixAB - h) / band, 0., 1.);       // 0 = still A, 1 = fully B in this cell
  float r = length(fract(gl_FragCoord.xy / (dotPx * 1.6)) - .5);
  float keepA = k <= 0. ? 1. : step(r, .5 * (1. - k));
  vec3 c = mix(b, a, keepA);
  c *= mix(1., .32, smoothstep(.35, 1., 1. - v.y));   // bottom scrim for the copy
  o = vec4(c, 1.);
}`;

export const PLAY = 0.72;   // frames scrub over the first 72% of a shot's slot
export const CUT = 0.80;    // particle dissolve runs over the last 20%

export function createScene(canvas, items, { reduce = false } = {}) {
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false });
  if (!gl) return null;
  const prog = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, FS]]) {
    const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    gl.attachShader(prog, sh);
  }
  gl.linkProgram(prog); gl.useProgram(prog);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const U = n => gl.getUniformLocation(prog, n);
  for (const [n, i] of [["colA", 0], ["colA2", 1], ["colB", 2]]) gl.uniform1i(U(n), i);

  const tex = () => {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([20, 102, 201]));
    for (const [k, v] of [[gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE], [gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    return t;
  };
  let aspect = 16 / 9;

  // items: [{ id, frames, halftone? }] in scroll order
  const shots = items.map(it => {
    const sc = { id: it.id, frames: it.frames ?? 0, continuous: !!it.continuous, col: tex(), col2: tex(), still: null, bitmaps: [], shown: -1, frac: 0, loading: false };
    const [x, y, w, h] = it.halftone ?? [0, 0, 0, 0];
    sc.box = [x / 100, 1 - (y + h) / 100, w / 100, h / 100];
    const img = new Image();
    img.onload = () => { sc.still = img; aspect = img.width / img.height; upload(sc, sc.col, 0); upload(sc, sc.col2, 0); };
    img.src = `/films/${it.id}.jpg`;
    return sc;
  });

  // memory-bounded frame loading: decode the current shot and its neighbours, drop the rest
  // ponytail: keeps ≤3 shots × 63 frames (~700 MB) decoded; stream from video if that bites
  async function ensure(sc) {
    if (!sc.frames || sc.missing || sc.loading || sc.bitmaps.length) return;
    sc.loading = true;
    for (let f = 1; f <= sc.frames; f++) {
      try {
        const r = await fetch(`/films/${sc.id}/f_${String(f).padStart(3, "0")}.webp`);
        if (!r.ok) { sc.missing = true; break; }   // frames not rendered on this machine: the still stays up
        sc.bitmaps[f - 1] = await createImageBitmap(await r.blob(), { imageOrientation: "flipY" });
      } catch { sc.missing = true; break; }
    }
    sc.loading = false;
  }
  function release(sc) { if (sc.loading || !sc.bitmaps.length) return; for (const b of sc.bitmaps) b?.close?.(); sc.bitmaps = []; sc.shown = -1; }
  function upload(sc, tx, idx) {
    gl.bindTexture(gl.TEXTURE_2D, tx);
    if (idx === 0) { if (sc.still) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, sc.still); return; }
    const bm = sc.bitmaps[idx]; if (!bm) return;
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, bm);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  }
  function showFrame(sc, u) {              // u in [0,1] through the shot's frames
    if (!sc.frames) { sc.frac = 0; return; }
    const pos = Math.min(1, Math.max(0, u)) * (sc.frames - 1);
    const idx = Math.floor(pos); sc.frac = pos - idx;
    if (idx === sc.shown) return;
    upload(sc, sc.col, idx); upload(sc, sc.col2, Math.min(idx + 1, sc.frames - 1)); sc.shown = idx;
  }

  function resize() { const d = Math.min(devicePixelRatio, 2); canvas.width = innerWidth * d; canvas.height = innerHeight * d; gl.viewport(0, 0, canvas.width, canvas.height); }
  addEventListener("resize", resize); resize();

  // p in [0, n): shot floor(p) at phase frac(p). idle: seconds since last scroll, for the opener ping-pong.
  function draw(p, idle, now = performance.now()) {
    const n = shots.length;
    const i = Math.min(Math.floor(p), n - 1), t = p - i, j = Math.min(i + 1, n - 1);
    const A = shots[i], B = shots[j];
    for (let k = 0; k < n; k++) { if (Math.abs(k - i) <= 1) ensure(shots[k]); else if (Math.abs(k - i) > 2) release(shots[k]); }
        const flows = j !== i && B.continuous;          // next shot starts on this shot's last frame: no dissolve
    const play = flows ? 1 : PLAY;
    // the opener plays once on its own as soon as its frames are in, then holds; scrolling never rewinds it
    const O = shots[0];
    if (!O.readyAt && O.frames && O.bitmaps.filter(Boolean).length >= O.frames) O.readyAt = now;
    const auto = i === 0 && O.readyAt ? Math.min(1, (now - O.readyAt) / 4500) : 0;
    const loop = i === n - 1 && t > PLAY;            // footer: breathe on the last shot
    const u = reduce ? 0 : loop ? 0.5 + 0.5 * Math.sin(idle * 0.9) : Math.max(auto, Math.min(1, t / play));
    showFrame(A, u);
    if (j !== i) showFrame(B, 0);
    const mixAB = i === j || flows ? 0 : Math.max(0, (t - CUT) / (1 - CUT));
    gl.uniform2f(U("res"), canvas.width, canvas.height);
    gl.uniform1f(U("imgAspect"), aspect);
    gl.uniform1f(U("fracA"), A.frac);
    gl.uniform1f(U("zoomA"), reduce || flows ? 1 : 1 + 0.06 * t);   // no dolly into a hard cut
    gl.uniform1f(U("zoomB"), 1);
    gl.uniform1f(U("mixAB"), reduce ? (t > CUT ? 1 : 0) : mixAB);
    gl.uniform1f(U("dotPx"), 6 * Math.min(devicePixelRatio, 2));
    gl.uniform4fv(U("boxA"), A.box);
    for (const [k, tx] of [[0, A.col], [1, A.col2], [2, B.col]]) { gl.activeTexture(gl.TEXTURE0 + k); gl.bindTexture(gl.TEXTURE_2D, tx); }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  return { draw, shots };
}

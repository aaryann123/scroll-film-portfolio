import base from "../content.json";
import { createScene, CUT } from "./scene.js";
// ponytail: a git-ignored content.local.json, if present, replaces any top-level keys (your name, links, chapters)
const local = Object.values(import.meta.glob("../content.local.json", { eager: true, import: "default" }))[0];
const content = { ...base, ...local };

const main = document.getElementById("chapters");
const rail = document.getElementById("rail");
const foot = document.getElementById("foot");
const cta = document.getElementById("cta");
const canvas = document.getElementById("stage");
cta.href = `mailto:${content.email}`;
if (content.title) document.title = content.title;
if (content.mark) document.querySelector(".mark").textContent = content.mark;

function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

// --- the film: one opener (rotated per visit) + the story shots -----------------
const pick = new URLSearchParams(location.search).get("open");
const opener = content.openers.includes(pick) ? pick : content.openers[Math.floor(Math.random() * content.openers.length)];
const sequence = [opener, ...content.shots];                       // ids in scroll order
const items = sequence.map(id => ({ id, frames: content.frames?.[id] ?? 0, halftone: content.halftone?.[id], continuous: content.continuous?.includes(id) }));
const slotOf = id => sequence.indexOf(id);

// --- chapters: copy rides on shots; one scroll slot per shot ------------------------
content.chapters.forEach((c, i) => {
  const s = el("section", "chapter"); s.id = c.id;
  const copy = el("div", "copy");
  copy.append(el("p", "kicker", `${String(i + 1).padStart(2, "0")} — ${c.label}`));
  const h = el("h2", "headline");
  for (const line of c.headline.split("\n")) { const sp = el("span", "line", line); sp.dataset.text = line; h.append(sp); }
  copy.append(h, el("p", "body", c.body));
  if (c.items) { const ul = el("ul", "items"); for (const t of c.items) ul.append(el("li", null, t)); copy.append(ul); }
  if (c.qa) { const dl = el("dl", "qa"); for (const { q, a } of c.qa) { dl.append(el("dt", null, q), el("dd", null, a)); } copy.append(dl); }
  s.append(copy); main.append(s);
  const li = el("li"), a = el("a", "rail-link", c.label); a.href = `#${c.id}`; li.append(a); rail.append(li);
});
const spacers = sequence.map(id => { const d = el("div", "slot"); d.dataset.shot = id; main.append(d); return d; });
foot.append(el("span", null, content.name), ...content.links.map(l => Object.assign(el("a", null, l.label), { href: l.href, rel: "noopener" })), Object.assign(el("a", null, content.email), { href: `mailto:${content.email}` }));

const chapters = [...main.querySelectorAll(".chapter")];
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const scene = createScene(canvas, items, { reduce });
window.__scene = scene; // debug handle
if (!scene) { canvas.remove(); chapters.forEach((s, i) => { s.style.backgroundImage = `url(/films/${content.chapters[i].shots[0]}.jpg)`; s.classList.add("flat"); }); }

function progress() {                                   // in shots: [0, n)
  const top = spacers[0].getBoundingClientRect().top + scrollY;
  return Math.max(0, Math.min(sequence.length - 1e-4, (scrollY - top) / spacers[0].offsetHeight));
}
const ease = x => x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x);
function setCurrent(id) { for (const a of rail.querySelectorAll(".rail-link")) a.toggleAttribute("aria-current", a.hash === `#${id}`); }

// chapter copy: in at the start of its first shot, out through the cut of its last shot
function layoutCopy(p) {
  let current = content.chapters[0].id;
  content.chapters.forEach((c, i) => {
    const a = slotOf(c.shots[0]), b = slotOf(c.shots[c.shots.length - 1]);
    const fadeIn = i === 0 ? 1 : ease((p - a + 0.05) / 0.25);
    const fadeOut = i === content.chapters.length - 1 ? 1 : 1 - ease((p - b - CUT) / (1 - CUT));
    const vis = reduce ? 1 : fadeIn * fadeOut;
    const copy = chapters[i].querySelector(".copy");
    copy.style.opacity = vis;
    copy.style.transform = reduce ? "" : `translateY(${(1 - fadeIn) * 28}px)`;
    copy.classList.toggle("on", vis > 0.5);
    if (p >= a - 0.15) current = c.id;
  });
  setCurrent(current);
}
rail.addEventListener("click", e => {                   // rail → the chapter's first shot
  const a = e.target.closest("a"); if (!a) return; e.preventDefault();
  const c = content.chapters.find(x => `#${x.id}` === a.hash);
  const sp = spacers[slotOf(c.shots[0])];
  scrollTo({ top: sp.getBoundingClientRect().top + scrollY + 1, behavior: reduce ? "auto" : "smooth" });
});

let target = progress(), shown = target, lastScroll = performance.now();
addEventListener("scroll", () => { target = progress(); lastScroll = performance.now(); }, { passive: true });
(function frame(now) {
  shown += (target - shown) * (reduce ? 1 : 0.12);
  if (scene) scene.draw(shown, (now - lastScroll) / 1000, now);
  layoutCopy(shown);
  requestAnimationFrame(frame);
})(performance.now());

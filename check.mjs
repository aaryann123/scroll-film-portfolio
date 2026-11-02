// ponytail: one build-and-grep check; add Playwright when there's behaviour a grep can't see
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import assert from "node:assert/strict";

execSync("npx vite build --logLevel error", { stdio: "inherit" });
assert.ok(existsSync("dist/index.html"), "dist/index.html missing");
const html = readFileSync("dist/index.html", "utf8");
const js = readFileSync("dist/" + html.match(/assets\/index-[^"]+\.js/)[0], "utf8");
const content = JSON.parse(readFileSync("content.json", "utf8"));
for (const c of content.chapters) assert.ok(js.includes(`"${c.id}"`), `chapter ${c.id} missing from bundle`);
for (const id of [...content.openers, ...content.shots]) assert.ok(js.includes(`"${id}"`), `shot ${id} missing from bundle`);
assert.ok(content.chapters.length >= 6, "expected at least six chapters");
for (const c of content.chapters) for (const s of c.shots) assert.ok([...content.openers, ...content.shots].includes(s), `chapter ${c.id} rides on unknown shot ${s}`);
const bad = [...(html + js).matchAll(/https?:\/\/[^\s"'`)]+/g)].map(m => m[0])
  .filter(u => !/^https?:\/\/(github\.com|www\.linkedin\.com|linkedin\.com)/.test(u) && !/gsap\.com|greensock|w3\.org/.test(u));
assert.deepEqual(bad, [], "external requests found: " + bad.join(", "));
console.log(`ok: ${content.chapters.length} chapters, ${content.shots.length} shots, no external requests`);

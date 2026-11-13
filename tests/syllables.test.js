const assert = require("assert");
const path = require("path");
const root = path.resolve(__dirname, "..");
const S = require(root + "/js/syllables.js");
const { words: split } = require(root + "/js/check.js");
const content = require(root + "/data/content.json");
const wordList = require(root + "/data/words.json");
const grammar = require(root + "/data/grammar.json");

// Spelling rules
assert(S.check("k", "e").ok);
assert(!S.check("c", "e").ok);
assert(S.check("gh", "i").ok);
assert(!S.check("g", "e").ok);
assert(!S.check("gh", "a").ok);
assert(S.check("ngh", "e").ok);
assert(!S.check("ng", "i").ok);
assert(!S.check("", "ă").ok);
assert(S.check("gi", "a").ok);
assert(S.validTone("ac", "sắc") && !S.validTone("ac", "huyền"));

// Tone placement examples, both styles
assert.equal(S.write("ng", "ươi", "huyền"), "người");
assert.equal(S.write("h", "oa", "huyền"), "hoà");
assert.equal(S.write("h", "oa", "huyền", "old"), "hòa");
assert.equal(S.write("gi", "i", "huyền"), "gì");
assert.equal(S.write("qu", "a", "hỏi"), "quả");
assert.equal(S.write("t", "oan", "sắc"), "toán");
assert.equal(S.write("ng", "uyên", "ngã"), "nguyễn");

// Every Vietnamese syllable in the app parses, is spelled legally, and its tone mark sits where the rules say.
const LOANS = new Set(["isaac", "iphone", "tromsø", "menu", "set", "uy"]);
const syllables = new Set();
const add = (text) => split(text).forEach((w) => /\d/.test(w) || syllables.add(w.toLowerCase().normalize("NFC")));
content.items.forEach((i) => { add(i.vi); (i.alt || []).forEach(add); });
wordList.forEach((w) => add(w.vi));
grammar.forEach((p) => p.examples.forEach((e) => add(e.vi)));
const problems = [];
for (const s of syllables) {
  if (LOANS.has(s) || /[fjwz]/.test(s)) continue;
  const parsed = S.parse(s);
  if (!parsed) { problems.push(`${s}: no parse`); continue; }
  const { initial, rime, tone } = parsed;
  if (!S.RIMES.has(rime)) { problems.push(`${s}: unknown rime ${rime}`); continue; }
  const rule = S.check(initial, rime);
  if (!rule.ok) problems.push(`${s}: ${rule.reason}`);
  if (!S.validTone(rime, tone)) problems.push(`${s}: tone ${tone} on a stop ending`);
  const spelled = [S.write(initial, rime, tone, "new"), S.write(initial, rime, tone, "old")];
  if (!spelled.includes(s)) problems.push(`${s}: rules give ${spelled.join(" / ")}`);
}
assert.deepEqual(problems, [], "\n" + problems.join("\n"));
console.log("ok syllables", syllables.size, "checked");

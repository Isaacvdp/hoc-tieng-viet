const assert = require("assert");
const path = require("path");
const root = path.resolve(__dirname, "..");
const { checkAnswer } = require(root + "/js/check.js");
const grammar = require(root + "/data/grammar.json");
const content = require(root + "/data/content.json");
const words = new Set(require(root + "/data/words.json").map((w) => w.vi));
const topics = new Set(content.topics.map((t) => t.id));
const ids = new Set(grammar.map((p) => p.id));

const LEVELS = new Set(["A1", "A2"]);
const TYPES = new Set(["choice", "translate", "fix", "truefalse"]);
assert.equal(ids.size, grammar.length, "duplicate ids");
assert(grammar.length >= 90, "expected about 100 points, got " + grammar.length);

const strings = (value) => (typeof value === "string" ? [value] : Array.isArray(value) ? value.flatMap(strings) : value && typeof value === "object" ? Object.values(value).flatMap(strings) : []);

for (const p of grammar) {
  const where = `[${p.id}]`;
  for (const field of ["form", "meaning", "category", "pattern", "summary", "english"]) assert(p[field], `${where} missing ${field}`);
  assert(LEVELS.has(p.level), `${where} level ${p.level}`);
  assert(p.examples.length >= 2, `${where} needs 2+ examples`);
  assert(p.practice.length >= 3, `${where} needs 3+ practice questions`);
  for (const s of strings(p)) assert.equal(s, s.normalize("NFC"), `${where} not NFC: ${s}`);
  for (const id of p.related || []) assert(ids.has(id), `${where} unknown related ${id}`);
  for (const t of p.topics || []) assert(topics.has(t), `${where} unknown topic ${t}`);
  for (const w of p.words || []) assert(words.has(w), `${where} word not in list ${w}`);
  p.practice.forEach((q, n) => {
    const at = `${where} practice ${n}`;
    assert(TYPES.has(q.type), `${at} type ${q.type}`);
    assert(q.q, `${at} no question`);
    if (q.type === "choice") {
      assert(q.options.includes(q.answer), `${at} answer not in options`);
      assert.equal(new Set(q.options).size, q.options.length, `${at} duplicate options`);
    }
    if (q.type === "truefalse") assert.equal(typeof q.answer, "boolean", `${at} answer must be true/false`);
    if (q.type === "translate" || q.type === "fix") {
      const accepted = [q.answer, ...(q.alt || [])];
      for (const a of accepted) assert(checkAnswer(a, accepted).correct, `${at} answer fails itself: ${a}`);
    }
    if (q.type === "fix") {
      const accepted = [q.answer, ...(q.alt || [])];
      assert(!checkAnswer(q.q, accepted, { flexiblePronouns: false }).correct, `${at} the wrong sentence is already accepted: ${q.q}`);
    }
  });
}

// Every practice topic with a lesson rule in the old notes is still covered by a grammar point.
const covered = new Set(grammar.flatMap((p) => p.topics || []));
for (const t of ["yes-no", "what", "make-question", "who", "where", "this-that", "to-from", "go-home", "we-with", "or", "work", "have-give", "greetings", "thanks-sorry", "how-are-you", "restaurant-seat", "numbers", "ta-tay"]) {
  assert(covered.has(t), "no grammar point for practice topic " + t);
}
console.log("ok grammar", grammar.length, "points,", grammar.reduce((n, p) => n + p.practice.length, 0), "practice questions");

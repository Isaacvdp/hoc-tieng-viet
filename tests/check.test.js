const assert = require("assert");
const fs = require("fs");
const root = require("path").resolve(__dirname, "..");
const { checkAnswer, words } = require(root + "/js/check.js");
const content = JSON.parse(fs.readFileSync(root + "/data/content.json", "utf8"));
const tips = content.tips;
const run = (input, accepted, o = {}) => checkAnswer(input, [].concat(accepted), { tips, ...o });

// marks ignored
assert(run("anh co muon di viet nam khong", "Anh có muốn đi Việt Nam không?").correct);
assert(run("Anh có muốn đi Việt Nam không?", "Anh có muốn đi Việt Nam không?").correct);
assert(run("DI CHO!", "đi chợ").correct);
// wrong marks are not corrected
assert(run("anh cò mụon di viet nam khong", "Anh có muốn đi Việt Nam không?").correct);
// missing word + tip
let r = run("anh co muon di viet nam", "Anh có muốn đi Việt Nam không?");
assert(!r.correct); assert.equal(r.kinds.missing, 1); assert(r.tips.some((t) => t.includes("không")));
// extra
r = run("toi la o day", "Tôi ở đây."); assert.equal(r.kinds.extra, 1);
// spelling and almost
r = run("anh ten la gii", "Anh tên là gì?"); assert.equal(r.kinds.spelling, 1); assert(r.almost);
r = run("anh ten laa gii", "Anh tên là gì?"); assert(!r.almost);
// order with question word tip
r = run("gi anh ten la", "Anh tên là gì?"); assert(r.kinds.order >= 1, JSON.stringify(r.kinds)); assert(r.tips.some((t) => t.includes("Question words")));
// hay/hoac
r = run("anh ay muon di viet nam hoac thai lan", "Anh ấy muốn đi Việt Nam hay Thái Lan?"); assert(r.tips.some((t) => t.includes("hoặc")));
// chúng tôi / ta
r = run("chung toi la nguoi na uy", "Chúng ta là người Na Uy."); assert(r.tips.some((t) => t.includes("chúng ta")));
// lam/nam
r = run("muoi nam", "mười lăm"); assert(r.tips.some((t) => t.includes("ten years")), JSON.stringify(r));
// flexible pronouns
assert(run("chi ten la gi", "Anh tên là gì?").correct);
assert(!run("chi ay thich gi", "Anh ấy thích gì?").correct);
assert(!run("chao em", "Chào anh.", { flexiblePronouns: false }).correct);
// alternates
r = run("day la com", ["Đó là cơm.", "Đấy là cơm."]); assert(r.correct); assert.equal(r.answer, "Đấy là cơm.");
// numbers & ø
assert(run("cho toi 1 bat pho", "Cho tôi một bát phở.").correct);
assert(run("cua anh het 100000", "Của anh hết 100.000.").correct);
assert(run("toi la nguoi tromso", "Tôi là người Tromsø.").correct);
// empty
r = run("", "Tôi ở đây."); assert(!r.correct); assert.equal(r.kinds.skipped, 1);

// content sanity
const topics = new Set(content.topics.map((t) => t.id));
const seen = new Set();
for (const item of content.items) {
  assert(topics.has(item.topic), item.topic);
  const key = item.topic + "|" + item.vi;
  assert(!seen.has(key), "dup " + key); seen.add(key);
  assert.equal(item.vi, item.vi.normalize("NFC"), item.vi);
  // every sentence must match itself and its alternates
  for (const a of [item.vi, ...(item.alt || [])]) assert(run(a, [item.vi, ...(item.alt || [])]).correct, a);
  assert(item.en);
}
for (const t of content.topics) assert(content.items.some((i) => i.topic === t.id), "empty " + t.id);

// exercises: the right answer is always there, once, and no wrong option is also valid
const Ex = require(root + "/js/exercises.js");
const { plain } = require(root + "/js/check.js");
const plainText = (t) => words(t).map(plain).join(" ");
assert.equal(Ex.toneName("nước"), "sắc");
assert.equal(Ex.toneName("mã"), "ngã");
assert.equal(Ex.toneName("mạ"), "nặng");
assert.equal(Ex.toneName("cam"), "ngang");
for (const item of content.items) {
  const accepted = new Set([item.vi, ...(item.alt || [])].map(plainText));
  const modes = Ex.allowedModes(item);
  for (let round = 0; round < 25; round++) {
    const m = Ex.meaningOptions(item, content.items);
    assert.equal(m.length, 4, item.vi); assert.equal(new Set(m).size, 4, item.vi); assert(m.includes(item.en));
    if (modes.includes("fill")) {
      const f = Ex.fillBlank(item, content.items, content.confusables);
      assert.equal(f.options.length, 4, item.vi); assert.equal(new Set(f.options).size, 4, item.vi + f.options);
      assert(f.options.includes(f.right));
      for (const o of f.options) {
        if (o === f.right) continue;
        assert(!accepted.has(plainText(`${f.before} ${o} ${f.after}`)), `fill also valid: ${item.vi} / ${o}`);
      }
    }
    if (modes.includes("sentence")) {
      const s = Ex.sentenceOptions(item);
      assert(s.options.length >= 3, "few sentence options: " + item.vi); assert(s.options.includes(s.right));
      assert.equal(new Set(s.options).size, s.options.length);
      for (const o of s.options) if (o !== s.right) assert(!accepted.has(plainText(o)), `sentence also valid: ${o}`);
    }
    if (modes.includes("marks")) {
      const k = Ex.marksOptions(item);
      assert.equal(k.options.length, 4, "marks options: " + item.vi); assert(k.options.includes(item.vi));
      for (const o of k.options) assert.equal(plainText(o), plainText(item.vi), o);
    }
  }
}

const letters = content.letterGroups.slice(0, 4).flatMap((g) => g.letters.map((l) => l.letter));
assert.equal(letters.length, 29, "alphabet count " + letters.length);
console.log("ok", content.items.length, "items;", new Set(words(content.items.map((i) => i.vi).join(" ")).map((w) => w.toLowerCase())).size, "unique words");

const assert = require("assert");
const path = require("path");
const root = path.resolve(__dirname, "..");
const SRS = require(root + "/js/srs.js");
const words = require(root + "/data/words.json");
const { MINUTE, DAY } = SRS;

const now = new Date(2026, 10, 13, 9, 0).getTime();

// Word list: 1000 unique, ranked 1..1000, every word has a tidy meaning.
assert.equal(words.length, 1000);
words.forEach((w, i) => {
  assert.equal(w.rank, i + 1);
  assert(w.vi && w.en, w.rank);
  assert.equal(w.vi, w.vi.normalize("NFC"), w.vi);
  assert(!/[／]|\s\/|\/\s/.test(w.en), "messy separator: " + w.en);
});
assert.equal(new Set(words.map((w) => w.vi)).size, 1000);

// Learning steps: 1 minute, then 10 minutes, then graduate to 1 day.
let card = SRS.newCard("1:r");
card = SRS.schedule(card, "good", now);
assert.equal(card.due - now, 10 * MINUTE);
card = SRS.schedule(card, "good", now);
assert.equal(card.state, "review"); assert.equal(card.interval, 1);
assert.equal(card.due, SRS.startOfDay(now) + DAY);
// Good on review multiplies by ease.
card = SRS.schedule(card, "good", card.due);
assert.equal(card.interval, 3);
const beforeReview = card;
card = SRS.schedule(card, "good", card.due);
assert.equal(card.interval, 8);
assert(SRS.shouldUnlockReverse(beforeReview, card));
// Easy on a brand-new word gives 4 days but must not unlock the reverse card yet.
const fresh = SRS.newCard("9:r");
assert(!SRS.shouldUnlockReverse(fresh, SRS.schedule(fresh, "easy", now)));
// Again lapses: half interval, relearn for 10 minutes, then back to review.
const lapseAt = card.due;
card = SRS.schedule(card, "again", lapseAt);
assert.equal(card.state, "relearning"); assert.equal(card.lapses, 1); assert.equal(card.interval, 4);
assert.equal(card.due - lapseAt, 10 * MINUTE);
card = SRS.schedule(card, "good", lapseAt);
assert.equal(card.state, "review"); assert.equal(card.interval, 4);
assert(card.ease < 2.5);

// Easy on a new card graduates straight to 4 days.
assert.equal(SRS.schedule(SRS.newCard("2:r"), "easy", now).interval, 4);
assert.equal(SRS.preview(SRS.newCard("2:r"), "again", now), "1m");
assert.equal(SRS.preview(SRS.newCard("2:r"), "good", now), "10m");
assert.equal(SRS.preview(SRS.newCard("2:r"), "easy", now), "4d");

// Queue order: due learning, due review, new word, then learning ahead; nothing when done.
const cards = {
  "1:r": { ...SRS.newCard("1:r"), state: "review", interval: 3, due: now - 1 },
  "2:r": { ...SRS.newCard("2:r"), due: now + 5 * MINUTE },
};
assert.equal(SRS.pickNext(cards, words, { now, newLeft: 5 }).card.id, "1:r");
delete cards["1:r"];
assert.equal(SRS.pickNext(cards, words, { now, newLeft: 5 }).introduce.rank, 1);
assert.equal(SRS.pickNext(cards, words, { now, newLeft: 0 }).card.id, "2:r");
cards["2:r"].due = now + 60 * MINUTE;
assert.equal(SRS.pickNext(cards, words, { now, newLeft: 0 }), null);
const c = SRS.counts(cards, words, { now, newLeft: 5 });
assert.deepEqual(c, { new: 5, learning: 0, review: 0 });

console.log("ok srs");

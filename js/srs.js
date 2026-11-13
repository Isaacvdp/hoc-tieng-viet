// Spaced repetition for word cards, a simplified version of the Anki scheduler.
// Cards are "learning" for their first minutes, then "review" with growing day intervals.
(function (root) {
  const MINUTE = 60 * 1000;
  const DAY = 24 * 60 * MINUTE;
  const LEARN_STEPS = [1 * MINUTE, 10 * MINUTE];
  const RELEARN_STEPS = [10 * MINUTE];
  const LEARN_AHEAD = 20 * MINUTE;
  const START_EASE = 2.5;
  const MIN_EASE = 1.3;
  // The English-to-Vietnamese card unlocks once the word has a review interval this long.
  const UNLOCK_REVERSE_DAYS = 4;

  function startOfDay(time) {
    const date = new Date(time);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  }

  function dayKey(time) {
    const date = new Date(time);
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  }

  const inDays = (now, days) => startOfDay(now) + days * DAY;

  function newCard(id) {
    return { id, state: "learning", step: 0, due: 0, interval: 0, ease: START_EASE, reps: 0, lapses: 0 };
  }

  function schedule(card, grade, now) {
    const next = { ...card, reps: card.reps + 1, last: now };
    if (card.state === "review") {
      if (grade === "again") {
        next.lapses += 1;
        next.ease = Math.max(MIN_EASE, card.ease - 0.2);
        next.interval = Math.max(1, Math.round(card.interval * 0.5));
        next.state = "relearning";
        next.step = 0;
        next.due = now + RELEARN_STEPS[0];
        return next;
      }
      if (grade === "hard") {
        next.ease = Math.max(MIN_EASE, card.ease - 0.15);
        next.interval = Math.max(card.interval + 1, Math.round(card.interval * 1.2));
      } else if (grade === "good") {
        next.interval = Math.max(card.interval + 1, Math.round(card.interval * card.ease));
      } else {
        next.ease = card.ease + 0.15;
        next.interval = Math.max(card.interval + 2, Math.round(card.interval * card.ease * 1.3));
      }
      next.due = inDays(now, next.interval);
      return next;
    }

    // Learning or relearning: short steps measured in minutes.
    const steps = card.state === "relearning" ? RELEARN_STEPS : LEARN_STEPS;
    const graduate = (days) => {
      next.state = "review";
      next.step = 0;
      next.interval = days;
      next.due = inDays(now, days);
      return next;
    };
    if (grade === "again") {
      next.step = 0;
      next.due = now + steps[0];
      return next;
    }
    if (grade === "hard") {
      next.due = now + (card.step === 0 && steps.length > 1 ? (steps[0] + steps[1]) / 2 : steps[card.step]);
      return next;
    }
    if (grade === "good") {
      if (card.step + 1 < steps.length) {
        next.step = card.step + 1;
        next.due = now + steps[next.step];
        return next;
      }
      return graduate(card.state === "relearning" ? card.interval : 1);
    }
    return graduate(card.state === "relearning" ? card.interval + 1 : 4);
  }

  function formatWait(ms) {
    if (ms < 60 * MINUTE) return `${Math.max(1, Math.round(ms / MINUTE))}m`;
    if (ms < DAY) return `${Math.round(ms / (60 * MINUTE))}h`;
    const days = Math.round(ms / DAY);
    if (days < 31) return `${days}d`;
    return `${Math.round(days / 30)}mo`;
  }

  // Shown on each grade button, like Anki.
  function preview(card, grade, now) {
    const next = schedule(card, grade, now);
    return next.state === "review" ? formatWait(next.interval * DAY) : formatWait(next.due - now);
  }

  // Picks what to show next. Order: learning cards that are due, reviews that are due,
  // a new word if today's allowance has room, then learning cards due in the next few minutes.
  function pickNext(cards, words, { now, newLeft }) {
    const list = Object.values(cards);
    const earliest = (filter) => list.filter(filter).sort((a, b) => a.due - b.due)[0] || null;
    const learning = (c) => c.state === "learning" || c.state === "relearning";
    const dueLearning = earliest((c) => learning(c) && c.due <= now);
    if (dueLearning) return { card: dueLearning };
    const dueReview = earliest((c) => c.state === "review" && c.due <= now);
    if (dueReview) return { card: dueReview };
    if (newLeft > 0) {
      const fresh = words.find((w) => !cards[`${w.rank}:r`]);
      if (fresh) return { introduce: fresh };
    }
    const soon = earliest((c) => learning(c) && c.due <= now + LEARN_AHEAD);
    if (soon) return { card: soon };
    return null;
  }

  function counts(cards, words, { now, newLeft }) {
    const list = Object.values(cards);
    const notStarted = words.filter((w) => !cards[`${w.rank}:r`]).length;
    return {
      new: Math.min(newLeft, notStarted),
      learning: list.filter((c) => (c.state === "learning" || c.state === "relearning") && c.due <= now + LEARN_AHEAD).length,
      review: list.filter((c) => c.state === "review" && c.due <= now).length,
    };
  }

  // Only a passed review on a later day unlocks the reverse card. Grading a brand-new
  // word Easy also gives a 4-day interval, but that word has not been remembered yet.
  function shouldUnlockReverse(before, after) {
    return after.id.endsWith(":r") && before.state === "review" && after.state === "review" && after.interval >= UNLOCK_REVERSE_DAYS;
  }

  const api = { schedule, preview, pickNext, counts, newCard, shouldUnlockReverse, startOfDay, dayKey, formatWait, MINUTE, DAY };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SRS = api;
})(this);

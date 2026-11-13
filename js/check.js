// Compares a typed answer with the accepted answers and explains the differences.
// Tone and vowel marks are ignored on purpose: the learner is not typing them yet.
(function (root) {
  const SECOND_PERSON = new Set(["anh", "chi", "em", "ban"]);

  function plain(word) {
    return word
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "d")
      .replace(/ø/g, "o")
      .replace(/Ø/g, "o")
      .toLowerCase();
  }

  // Splits on anything that is not part of a word and keeps the marks on each word.
  function words(text) {
    return text
      .normalize("NFC")
      .replace(/(\d)[.,](?=\d)/g, "$1")
      .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
      .trim()
      .split(" ")
      .filter(Boolean);
  }

  // "anh", "chị", "em" and "bạn" are all "you", so any of them is right unless the
  // topic is about choosing the right one. "anh ấy" (he) stays fixed.
  function comparable(list, flexiblePronouns) {
    return list.map((word, i) => {
      const value = plain(word) === "1" ? "mot" : plain(word);
      const next = list[i + 1] ? plain(list[i + 1]) : "";
      return flexiblePronouns && SECOND_PERSON.has(value) && next !== "ay" ? "you" : value;
    });
  }

  function editDistance(a, b) {
    const row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let diagonal = row[0];
      row[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const above = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
        diagonal = above;
      }
    }
    return row[b.length];
  }

  function isMisspelling(typed, expected) {
    if (typed === "you" || expected === "you") return false;
    const distance = editDistance(typed, expected);
    return distance > 0 && distance <= Math.max(1, Math.floor(expected.length / 3));
  }

  // Word-level alignment. Each step is one of:
  // match, spelling (typed vs expected), extra (typed only), missing (expected only).
  function align(typed, expected) {
    const rows = typed.length + 1;
    const cols = expected.length + 1;
    const cost = Array.from({ length: rows }, () => new Array(cols).fill(0));
    for (let i = 1; i < rows; i++) cost[i][0] = i;
    for (let j = 1; j < cols; j++) cost[0][j] = j;
    const swapCost = (i, j) => {
      if (typed[i] === expected[j]) return 0;
      return isMisspelling(typed[i], expected[j]) ? 0.8 : Infinity;
    };
    for (let i = 1; i < rows; i++) {
      for (let j = 1; j < cols; j++) {
        cost[i][j] = Math.min(
          cost[i - 1][j] + 1,
          cost[i][j - 1] + 1,
          cost[i - 1][j - 1] + swapCost(i - 1, j - 1),
        );
      }
    }
    const steps = [];
    let i = typed.length;
    let j = expected.length;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && cost[i][j] === cost[i - 1][j - 1] + swapCost(i - 1, j - 1)) {
        steps.unshift({ kind: typed[i - 1] === expected[j - 1] ? "match" : "spelling", typed: i - 1, expected: j - 1 });
        i--;
        j--;
      } else if (j > 0 && cost[i][j] === cost[i][j - 1] + 1) {
        steps.unshift({ kind: "missing", expected: j - 1 });
        j--;
      } else {
        steps.unshift({ kind: "extra", typed: i - 1 });
        i--;
      }
    }
    return { steps, cost: cost[typed.length][expected.length] };
  }

  // A word that is both missing and extra was typed in the wrong place.
  function markMoved(steps, typedKeys, expectedKeys) {
    for (const missing of steps) {
      if (missing.kind !== "missing") continue;
      const extra = steps.find(
        (s) => s.kind === "extra" && typedKeys[s.typed] === expectedKeys[missing.expected],
      );
      if (extra) {
        missing.kind = "moved-expected";
        extra.kind = "moved-typed";
      }
    }
  }

  function findTips(tips, steps, typedKeys, expectedKeys) {
    const found = new Set();
    const missing = steps.filter((s) => s.kind === "missing");
    const extra = steps.filter((s) => s.kind === "extra");
    const moved = steps.filter((s) => s.kind === "moved-expected");
    for (const tip of tips || []) {
      if (tip.needs && !expectedKeys.includes(tip.needs)) continue;
      if (tip.swap) {
        const [wanted, wrote] = tip.swap;
        const wantedMissing = missing.some((s) => expectedKeys[s.expected] === wanted);
        const wroteExtra = extra.some((s) => typedKeys[s.typed] === wrote);
        // Words one letter apart (lăm, năm) line up as a spelling slip.
        const sideBySide = steps.some(
          (s) => s.kind === "spelling" && expectedKeys[s.expected] === wanted && typedKeys[s.typed] === wrote,
        );
        if ((wantedMissing && wroteExtra) || sideBySide) found.add(tip.tip);
      }
      if (tip.missing && missing.some((s) => expectedKeys[s.expected] === tip.missing)) found.add(tip.tip);
      if (tip.moved && moved.some((s) => tip.moved.includes(expectedKeys[s.expected]))) found.add(tip.tip);
    }
    return [...found];
  }

  function checkAnswer(input, accepted, options = {}) {
    const flexible = options.flexiblePronouns !== false;
    const typedWords = words(input);
    const typedKeys = comparable(typedWords, flexible);
    let best = null;
    accepted.forEach((answer, index) => {
      const expectedWords = words(answer);
      const expectedKeys = comparable(expectedWords, flexible);
      const { steps, cost } = align(typedKeys, expectedKeys);
      // Ties keep the earlier answer, so the main form is shown first.
      if (!best || cost < best.cost) {
        best = { answer, index, expectedWords, expectedKeys, steps, cost };
      }
    });
    markMoved(best.steps, typedKeys, best.expectedKeys);

    const count = (kind) => best.steps.filter((s) => s.kind === kind).length;
    const kinds = {};
    if (typedWords.length === 0) {
      kinds.skipped = 1;
    } else {
      if (count("missing")) kinds.missing = count("missing");
      if (count("extra")) kinds.extra = count("extra");
      if (count("spelling")) kinds.spelling = count("spelling");
      if (count("moved-expected")) kinds.order = count("moved-expected");
    }

    const tips = findTips(options.tips, best.steps, typedKeys, best.expectedKeys);
    return {
      correct: best.cost === 0,
      almost: best.cost > 0 && tips.length === 0 && Object.keys(kinds).length === 1 && kinds.spelling === 1,
      answer: best.answer,
      typedWords,
      expectedWords: best.expectedWords,
      steps: best.steps,
      kinds,
      tips,
    };
  }

  const api = { checkAnswer, words, plain };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Check = api;
})(this);

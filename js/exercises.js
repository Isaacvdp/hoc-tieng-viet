// Builds the answer options for the multiple-choice exercises.
(function (root) {
  const Check = typeof module !== "undefined" && module.exports ? require("./check.js") : root.Check;

  const TONE_MARKS = ["́", "̀", "̉", "̃", "̣"];
  const TONE_NAMES = { "́": "sắc", "̀": "huyền", "̉": "hỏi", "̃": "ngã", "̣": "nặng", "": "ngang" };
  const PROPER_FIRST_WORDS = new Set(["Isaac", "Tết", "Na"]);
  // "anh", "chị" and "em" are all right in most sentences, so they never make a fair blank.
  const NEVER_BLANK = new Set(["anh", "chị", "em", "ấy", "Isaac", "Na", "Uy", "Việt", "Nam", "Thái", "Lan", "Hà", "Nội", "Tân", "Tromsø", "iPhone"]);

  function shuffle(list) {
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const plainWords = (text) => Check.words(text).map(Check.plain).join(" ");

  function toneMark(word) {
    return [...word.normalize("NFD")].find((c) => TONE_MARKS.includes(c)) || "";
  }

  const toneName = (word) => TONE_NAMES[toneMark(word)];

  function withTone(word, mark) {
    const current = toneMark(word);
    const decomposed = word.normalize("NFD");
    return (current ? decomposed.replace(current, mark) : decomposed).normalize("NFC");
  }

  const acceptedAnswers = (item) => [item.vi, ...(item.alt || [])];

  function tileWords(item) {
    const list = Check.words(item.vi);
    if (!PROPER_FIRST_WORDS.has(list[0])) list[0] = list[0].toLowerCase();
    return list;
  }

  function hasTonedWord(item) {
    return Check.words(item.vi).some((word) => toneMark(word));
  }

  // Which exercises work for an item. "marks" is left out of Mix by the app.
  function allowedModes(item) {
    if (item.from) return ["translate", "build"];
    const count = Check.words(item.vi).length;
    const modes = ["translate", "meaning"];
    if (count >= 3) modes.push("build", "fill");
    if (count >= 4 && !/\d/.test(item.vi)) modes.push("sentence");
    if (hasTonedWord(item)) modes.push("marks");
    return modes;
  }

  function meaningOptions(item, items) {
    const others = shuffle(items.filter((other) => other.en !== item.en && !other.from));
    // Options from the same topic are harder to tell apart, so they come first.
    const ordered = [...others.filter((o) => o.topic === item.topic), ...others.filter((o) => o.topic !== item.topic)];
    const wrong = [];
    for (const other of ordered) {
      if (wrong.length === 3) break;
      if (!wrong.includes(other.en)) wrong.push(other.en);
    }
    return shuffle([item.en, ...wrong]);
  }

  function fillBlank(item, items, confusables) {
    const words = Check.words(item.vi);
    const candidates = words.map((word, index) => ({ word, index })).filter(({ word }) => !NEVER_BLANK.has(word) && !NEVER_BLANK.has(word.toLowerCase()) && !/\d/.test(word));
    const inGroup = ({ word }) => confusables.some((group) => group.includes(word.toLowerCase()));
    const preferred = candidates.filter(inGroup);
    const target = pick(preferred.length ? preferred : candidates.length ? candidates : words.map((word, index) => ({ word, index })));
    const right = target.word.toLowerCase();

    const accepted = new Set(acceptedAnswers(item).map(plainWords));
    const fits = (word) => {
      const lower = word.toLowerCase();
      if (lower === right || NEVER_BLANK.has(word) || NEVER_BLANK.has(lower) || /\d/.test(word)) return false;
      // đó and đấy both mean "there", so neither can be wrong for the other.
      if (["đó", "đấy"].includes(lower) && ["đó", "đấy"].includes(right)) return false;
      const filled = words.map((w, i) => (i === target.index ? word : w)).join(" ");
      return !accepted.has(plainWords(filled));
    };

    const related = confusables.filter((group) => group.includes(right)).flat();
    const sameTopic = items.filter((o) => o.topic === item.topic).flatMap((o) => Check.words(o.vi));
    const everywhere = items.flatMap((o) => Check.words(o.vi));
    const wrong = [];
    for (const word of [...shuffle(related), ...shuffle(sameTopic), ...shuffle(everywhere)]) {
      const lower = word.toLowerCase();
      if (wrong.length === 3) break;
      if (!wrong.includes(lower) && fits(word)) wrong.push(lower);
    }
    return {
      before: words.slice(0, target.index).join(" "),
      after: words.slice(target.index + 1).join(" "),
      right,
      options: shuffle([right, ...wrong]),
    };
  }

  // Commas are dropped from every option so punctuation can't give the answer away.
  function asSentence(words, item) {
    const text = words.join(" ");
    const first = /^\p{Lu}/u.test(item.vi) ? text[0].toUpperCase() + text.slice(1) : text;
    const end = /[.?]$/.test(item.vi) ? item.vi.slice(-1) : "";
    return first + end;
  }

  function sentenceOptions(item) {
    const words = tileWords(item);
    const accepted = new Set(acceptedAnswers(item).map(plainWords));
    const right = asSentence(words, item);
    const wrong = new Set();
    for (let tries = 0; tries < 200 && wrong.size < 3; tries++) {
      const copy = [...words];
      if (Math.random() < 0.7) {
        const i = Math.floor(Math.random() * (copy.length - 1));
        [copy[i], copy[i + 1]] = [copy[i + 1], copy[i]];
      } else {
        const from = Math.floor(Math.random() * copy.length);
        const [moved] = copy.splice(from, 1);
        copy.splice(Math.floor(Math.random() * (copy.length + 1)), 0, moved);
      }
      const sentence = asSentence(copy, item);
      if (sentence !== right && !accepted.has(plainWords(sentence))) wrong.add(sentence);
    }
    return { right, options: shuffle([right, ...wrong]) };
  }

  function marksOptions(item) {
    const accepted = new Set(acceptedAnswers(item).map((a) => a.normalize("NFC")));
    const parts = item.vi.split(/(\s+)/);
    const toned = parts.map((part, i) => (toneMark(part) ? i : -1)).filter((i) => i >= 0);
    const wrong = new Set();
    for (let tries = 0; tries < 200 && wrong.size < 3; tries++) {
      const index = pick(toned);
      const mark = pick([...TONE_MARKS, ""].filter((m) => m !== toneMark(parts[index])));
      const copy = [...parts];
      copy[index] = withTone(parts[index], mark);
      const sentence = copy.join("");
      if (!accepted.has(sentence)) wrong.add(sentence);
    }
    return { right: item.vi, options: shuffle([item.vi, ...wrong]) };
  }

  const api = { shuffle, pick, toneName, tileWords, allowedModes, acceptedAnswers, meaningOptions, fillBlank, sentenceOptions, marksOptions };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Exercises = api;
})(this);

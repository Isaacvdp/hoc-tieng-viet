"use strict";

const SESSION_SIZE = 10;
const QUIZ_SIZE = 10;
const DAY = 24 * 60 * 60 * 1000;
const REVIEW_AFTER_DAYS = [0, 1, 3, 7, 21];
const STORAGE_KEY = "hoc-tieng-viet";
const SEARCH_LIMIT = 40;

const MODES = [
  { id: "mix", label: "Mix", hint: "A bit of everything except marks." },
  { id: "translate", label: "Translate", hint: "Read the English and type the Vietnamese." },
  { id: "build", label: "Build", hint: "Tap the words into the right order." },
  { id: "fill", label: "Fill in", hint: "Pick the word that completes the sentence." },
  { id: "meaning", label: "Meaning", hint: "Read the Vietnamese and pick what it means." },
  { id: "sentence", label: "Right sentence", hint: "Pick the sentence with the correct word order." },
  { id: "marks", label: "Right marks", hint: "Pick the correct spelling. You read the marks, you don't type them." },
];

const KIND_LABELS = {
  order: "word order",
  missing: "missing words",
  extra: "extra words",
  spelling: "spelling",
  skipped: "didn't know",
  meaning: "meaning",
  choice: "wrong word",
  marks: "marks",
};

const { shuffle, pick, toneName, tileWords, allowedModes, acceptedAnswers } = Exercises;

const app = document.getElementById("app");
let content;
let words = [];
let grammar = [];
let topicById = {};
let state = load();
let onKey = null;

// ---------- Storage ----------

function load() {
  const empty = { progress: {}, mode: "mix", topics: null };
  const fill = (saved) => {
    if (!MODES.some((mode) => mode.id === saved.mode)) saved.mode = "mix";
    saved.words = { cards: {}, newPerDay: 5, introduced: {}, bonus: {}, ...saved.words };
    saved.grammar = { right: {}, misses: {}, ...saved.grammar };
    saved.grammarUi = { level: "All", category: "All", ...saved.grammarUi };
    saved.syllableUi = { initial: "b", group: "vowels", rime: "a", ...saved.syllableUi };
    return saved;
  };
  try {
    return fill({ ...empty, ...JSON.parse(localStorage.getItem(STORAGE_KEY)) });
  } catch {
    return fill({ ...empty });
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private windows can block storage. The app still works for this visit.
  }
  updateMistakeCount();
}

const itemKey = (item) => `${item.topic}|${item.vi}`;

function record(item, result) {
  const key = itemKey(item);
  const before = state.progress[key] ? structuredClone(state.progress[key]) : null;
  const p = state.progress[key] || { box: 0, streak: 0, misses: 0, open: false, kinds: {} };
  p.lastAt = Date.now();
  if (result.correct) {
    p.box = Math.min(p.box + 1, REVIEW_AFTER_DAYS.length - 1);
    p.streak += 1;
    // A mistake stays on the list until it has been right twice in a row.
    if (p.streak >= 2) {
      p.open = false;
      p.kinds = {};
    }
  } else {
    p.box = 0;
    p.streak = 0;
    p.misses += 1;
    p.open = true;
    p.lastTyped = result.typed || "";
    for (const [kind, n] of Object.entries(result.kinds || {})) {
      p.kinds[kind] = (p.kinds[kind] || 0) + n;
    }
  }
  p.due = p.lastAt + REVIEW_AFTER_DAYS[p.box] * DAY;
  state.progress[key] = p;
  save();
  return before;
}

function undoRecord(item, before) {
  if (before) state.progress[itemKey(item)] = before;
  else delete state.progress[itemKey(item)];
}

const openMistakes = () => content.items.filter((item) => state.progress[itemKey(item)]?.open);

function updateMistakeCount() {
  const badge = document.getElementById("mistake-count");
  if (!content) return;
  const count = openMistakes().length + openGrammarMisses().length;
  badge.hidden = count === 0;
  badge.textContent = count;
}

// ---------- Small helpers ----------

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(props)) {
    if (name === "class") el.className = value;
    else if (name.startsWith("on")) el.addEventListener(name.slice(2), value);
    else if (value === true) el.setAttribute(name, "");
    else if (value !== false && value != null) el.setAttribute(name, value);
  }
  el.append(...clean(children));
  return el;
}

function clean(children) {
  return children.flat(Infinity).filter((child) => child != null && child !== false);
}

const vi = (text, props = {}) => h("span", { lang: "vi", ...props }, text);

function show(...children) {
  onKey = null;
  app.replaceChildren(...clean(children));
  window.scrollTo(0, 0);
}

// "Tôi muốn đi **Na Uy**." becomes text with the keyword emphasised.
function withBold(text) {
  return text.split("**").map((part, i) => (i % 2 ? h("strong", {}, part) : part));
}

function modesFor(item, sessionMode) {
  const modes = allowedModes(item);
  return sessionMode === "mix" ? modes.filter((mode) => mode !== "marks") : modes;
}

// ---------- Practice setup ----------

function renderPractice() {
  const selected = new Set(state.topics || content.topics.map((t) => t.id));
  const startButton = h("button", { class: "btn primary", type: "button", onclick: () => startSession(poolFor()) });
  const message = h("p", { class: "sub small", role: "status" });

  function poolFor() {
    return content.items.filter((item) => selected.has(item.topic) && (state.mode === "mix" || allowedModes(item).includes(state.mode)));
  }

  function refresh() {
    state.topics = [...selected];
    save();
    const count = Math.min(SESSION_SIZE, poolFor().length);
    startButton.disabled = count === 0;
    startButton.textContent = count ? `Start ${count} questions` : "Start";
    message.textContent = count ? "" : "Pick at least one topic that works with this exercise.";
    message.hidden = count > 0;
    for (const box of topicBoxes) box.checked = selected.has(box.value);
  }

  const modeHint = h("p", { class: "sub small mode-hint" }, MODES.find((m) => m.id === state.mode).hint);
  const modes = h("div", { class: "segments", role: "radiogroup", "aria-label": "Exercise" },
    MODES.map((mode) =>
      h("label", {},
        h("input", {
          type: "radio", name: "mode", value: mode.id, checked: state.mode === mode.id,
          onchange: () => { state.mode = mode.id; modeHint.textContent = mode.hint; refresh(); },
        }),
        mode.label)),
  );

  const topicBoxes = [];
  const groups = [...new Set(content.topics.map((t) => t.group))];
  const list = groups.map((group) => [
    h("p", { class: "topic-group" }, group),
    content.topics.filter((t) => t.group === group).map((topic) => {
      const items = content.items.filter((item) => item.topic === topic.id);
      const practised = items.filter((item) => state.progress[itemKey(item)]).length;
      const box = h("input", {
        type: "checkbox", value: topic.id,
        onchange: (event) => {
          if (event.target.checked) selected.add(topic.id);
          else selected.delete(topic.id);
          refresh();
        },
      });
      topicBoxes.push(box);
      return h("label", { class: "topic" }, box,
        h("span", { class: "topic-name" }, topic.title),
        h("span", { class: "topic-progress", "aria-label": `${practised} of ${items.length} practised` }, `${practised}/${items.length}`));
    }),
  ]);

  const setAll = (on) => {
    selected.clear();
    if (on) content.topics.forEach((t) => selected.add(t.id));
    refresh();
  };

  show(
    h("h1", {}, "Practice"),
    h("p", { class: "sub" }, "You don't need to type tone marks yet. The correct spelling is always shown afterwards."),
    h("h2", {}, "Exercise"),
    modes, modeHint,
    h("div", { class: "topic-head" },
      h("h2", {}, "Topics"),
      h("span", {},
        h("button", { class: "btn link", type: "button", onclick: () => setAll(true) }, "All"),
        " ",
        h("button", { class: "btn link", type: "button", onclick: () => setAll(false) }, "None"))),
    list,
    h("div", { class: "start-bar" }, message, startButton),
  );
  refresh();
}

// Weakest first: open mistakes, then anything due for review, then new sentences.
function chooseItems(pool) {
  const now = Date.now();
  const rank = (item) => {
    const p = state.progress[itemKey(item)];
    if (!p) return 2;
    if (p.open) return 0;
    return p.due <= now ? 1 : 3;
  };
  const ordered = shuffle(pool).sort((a, b) => rank(a) - rank(b));
  const seen = new Set();
  return ordered.filter((item) => {
    if (seen.has(item.vi)) return false;
    seen.add(item.vi);
    return true;
  }).slice(0, SESSION_SIZE);
}

function startSession(pool, mode = state.mode) {
  const queue = chooseItems(pool).map((item) => ({ item, retry: false }));
  nextQuestion({ queue, mode, total: queue.length, done: 0, firstTryRight: 0, missed: [], pool });
}

// ---------- Practice session ----------

function nextQuestion(session) {
  const entry = session.queue.shift();
  if (!entry) return renderSummary(session);
  const options = modesFor(entry.item, session.mode);
  const mode = session.mode === "mix" ? pick(options) : options.includes(session.mode) ? session.mode : "translate";
  const ask = { translate: askTyped, build: askBuild, meaning: askMeaning, fill: askFill, sentence: askSentence, marks: askMarks };
  ask[mode](session, entry);
}

function progressRow(session, retry) {
  const fill = h("div", { class: "progress-fill", style: `width:${(session.done / session.total) * 100}%` });
  return h("div", { class: "progress-row" },
    h("div", { class: "progress-track", role: "progressbar", "aria-valuenow": session.done, "aria-valuemin": 0, "aria-valuemax": session.total }, fill),
    h("span", {}, retry ? "Second try" : `${session.done + 1} of ${session.total}`),
    h("button", { class: "btn link small end-link", type: "button", onclick: () => renderSummary(session) }, "End"));
}

function promptFor(item) {
  if (item.from) {
    return [
      h("p", { class: "instruction" }, "Ask about the highlighted word"),
      h("p", { class: "prompt", lang: "vi" }, withBold(item.from)),
    ];
  }
  return [h("p", { class: "instruction" }, "In Vietnamese"), h("p", { class: "prompt" }, item.en)];
}

function askTyped(session, entry) {
  const { item } = entry;
  const input = h("input", {
    class: "answer-input", type: "text", lang: "vi", "aria-label": "Your answer",
    autocomplete: "off", autocapitalize: "off", autocorrect: "off", spellcheck: "false",
    placeholder: "Type here, no marks needed",
  });
  const hint = h("p", { class: "hint", lang: "vi", hidden: true });
  const submit = (typed) => finish(session, entry, gradeTyped(item, typed));
  const showHint = () => {
    hint.hidden = false;
    hint.textContent = Check.words(item.vi).map((word) => `${word[0]}${"·".repeat(word.length - 1)}`).join("  ");
    input.focus();
  };
  const form = h("form", { onsubmit: (event) => { event.preventDefault(); submit(input.value); } },
    input, hint,
    h("div", { class: "actions" },
      h("button", { class: "btn primary", type: "submit" }, "Check"),
      h("button", { class: "btn", type: "button", onclick: showHint }, "Hint"),
      h("button", { class: "btn link", type: "button", onclick: () => submit("") }, "I don't know")));
  show(progressRow(session, entry.retry), promptFor(item), form);
  input.focus();
}

function gradeTyped(item, typed) {
  const check = Check.checkAnswer(typed, acceptedAnswers(item), {
    tips: content.tips,
    flexiblePronouns: !topicById[item.topic].strictPronouns,
  });
  return { ...check, typed, showDiff: true };
}

function askBuild(session, entry) {
  const { item } = entry;
  const tiles = shuffle(tileWords(item).map((word, id) => ({ word, id })));
  const built = [];
  const builtTray = h("div", { class: "tray built", "aria-label": "Your sentence", lang: "vi" });
  const bankTray = h("div", { class: "tray bank", "aria-label": "Available words", lang: "vi" });
  const checkButton = h("button", {
    class: "btn primary", type: "button", disabled: true,
    onclick: () => finish(session, entry, gradeTyped(item, built.map((t) => t.word).join(" "))),
  }, "Check");

  function draw() {
    builtTray.replaceChildren(...built.map((tile) =>
      h("button", { class: "tile", type: "button", onclick: () => { built.splice(built.indexOf(tile), 1); draw(); } }, tile.word)));
    bankTray.replaceChildren(...tiles.filter((tile) => !built.includes(tile)).map((tile) =>
      h("button", { class: "tile", type: "button", onclick: () => { built.push(tile); draw(); } }, tile.word)));
    checkButton.disabled = built.length !== tiles.length;
  }

  show(
    progressRow(session, entry.retry),
    item.from ? promptFor(item) : [h("p", { class: "instruction" }, "Put the words in order"), h("p", { class: "prompt" }, item.en)],
    builtTray, bankTray,
    h("div", { class: "actions" }, checkButton,
      h("button", { class: "btn link", type: "button", onclick: () => finish(session, entry, gradeTyped(item, "")) }, "I don't know")),
  );
  draw();
}

// Shared by every multiple-choice exercise.
function askChoice(session, entry, { heading, options, right, wrongKind, optionsLang }) {
  const { item } = entry;
  const buttons = options.map((text, i) =>
    h("button", { class: "option", type: "button", lang: optionsLang, onclick: () => choose(i) },
      h("span", { class: "key", "aria-hidden": "true" }, i + 1), h("span", {}, text)));

  function choose(i) {
    if (buttons[0].disabled) return;
    const correct = options[i] === right;
    buttons.forEach((button, b) => {
      button.disabled = true;
      if (options[b] === right) button.classList.add("is-right");
      else if (b === i) button.classList.add("is-wrong");
    });
    onKey = null;
    finish(session, entry, {
      correct, answer: item.vi, typed: options[i], kinds: correct ? {} : { [wrongKind]: 1 }, tips: [],
      showDiff: false, keep: true,
    });
  }

  show(progressRow(session, entry.retry), heading, h("div", { class: "options" }, buttons));
  onKey = (event) => {
    const index = Number(event.key) - 1;
    if (index >= 0 && index < options.length) choose(index);
  };
}

function askMeaning(session, entry) {
  const { item } = entry;
  askChoice(session, entry, {
    heading: [h("p", { class: "instruction" }, "What does this mean?"), h("p", { class: "prompt", lang: "vi" }, item.vi)],
    options: Exercises.meaningOptions(item, content.items),
    right: item.en,
    wrongKind: "meaning",
  });
}

function askFill(session, entry) {
  const { item } = entry;
  const blank = Exercises.fillBlank(item, content.items, content.confusables);
  askChoice(session, entry, {
    heading: [
      h("p", { class: "instruction" }, "Fill in the missing word"),
      h("p", { class: "prompt" }, item.en),
      h("p", { class: "blank-line", lang: "vi" }, blank.before, " ", h("span", { class: "blank", "aria-label": "missing word" }, " "), " ", blank.after),
    ],
    options: blank.options,
    right: blank.right,
    wrongKind: "choice",
    optionsLang: "vi",
  });
}

function askSentence(session, entry) {
  const { item } = entry;
  const { options, right } = Exercises.sentenceOptions(item);
  askChoice(session, entry, {
    heading: [h("p", { class: "instruction" }, "Which sentence is right?"), h("p", { class: "prompt" }, item.en)],
    options, right, wrongKind: "order", optionsLang: "vi",
  });
}

function askMarks(session, entry) {
  const { item } = entry;
  const { options, right } = Exercises.marksOptions(item);
  askChoice(session, entry, {
    heading: [h("p", { class: "instruction" }, "Which spelling is right?"), h("p", { class: "prompt" }, item.en)],
    options, right, wrongKind: "marks", optionsLang: "vi",
  });
}

function verdictFor(result) {
  if (result.correct) return h("strong", { class: "verdict right" }, "Correct");
  if (result.almost) return h("strong", { class: "verdict almost" }, "Almost, one spelling slip");
  return h("strong", { class: "verdict wrong" }, result.kinds?.skipped ? "Here's the answer" : "Not quite");
}

function typedLine(result) {
  return result.steps.filter((s) => s.typed !== undefined).flatMap((step) => {
    const word = result.typedWords[step.typed];
    const cls = { extra: "w-extra", spelling: "w-spelling", "moved-typed": "w-moved" }[step.kind];
    return [cls ? h("span", { class: cls }, word) : word, " "];
  });
}

function expectedLine(result) {
  return result.steps.filter((s) => s.expected !== undefined).flatMap((step) => {
    const word = result.expectedWords[step.expected];
    const cls = { missing: "w-missing", spelling: "w-spelling", "moved-expected": "w-moved" }[step.kind];
    return [cls ? h("span", { class: cls }, word) : word, " "];
  });
}

function explainMistakes(result) {
  const lines = [];
  const say = (kind) => result.steps.filter((s) => s.kind === kind);
  const list = (steps, side) => steps.map((s) => (side === "e" ? result.expectedWords[s.expected] : result.typedWords[s.typed])).join(", ");
  if (say("missing").length) lines.push(["Missing: ", vi(list(say("missing"), "e"))]);
  if (say("extra").length) lines.push(["Not needed: ", vi(list(say("extra"), "t"))]);
  if (say("moved-expected").length) lines.push(["In the wrong place: ", vi(list(say("moved-expected"), "e"))]);
  for (const step of say("spelling")) {
    lines.push(["Spelling: you wrote ", vi(result.typedWords[step.typed]), ", it's ", vi(result.expectedWords[step.expected])]);
  }
  return lines;
}

function finish(session, entry, result) {
  const { item } = entry;
  const before = record(item, result);
  if (!entry.retry) {
    if (result.correct) session.firstTryRight += 1;
    else session.missed.push({ item, typed: result.typed });
    session.done += 1;
  }
  if (!result.correct && !entry.retry) session.queue.push({ item, retry: true });

  const next = () => nextQuestion(session);
  const nextButton = h("button", { class: "btn primary", type: "button", onclick: next },
    session.queue.length ? "Next" : "See results");
  const actions = h("div", { class: "actions" }, nextButton);
  const typedWrong = result.showDiff && !result.correct && !result.kinds?.skipped;

  // The checker only knows the answers in the notes, so a wrong call can be overruled.
  if (typedWrong) {
    actions.append(h("button", {
      class: "btn link", type: "button",
      onclick: () => {
        undoRecord(item, before);
        record(item, { correct: true });
        if (!entry.retry) {
          session.queue = session.queue.filter((e) => e.item !== item);
          session.missed = session.missed.filter((m) => m.item !== item);
          session.firstTryRight += 1;
        }
        next();
      },
    }, "My answer was fine"));
  }

  const lines = typedWrong ? explainMistakes(result) : [];
  const notes = [...(result.tips || []), ...(item.note ? [item.note] : [])];
  // The grammar points for this topic, most specific first: those whose word links appear in the answer.
  const answerWords = new Set(Check.words(item.vi).map((w) => w.toLowerCase()));
  const related = pointsForTopic(item.topic)
    .map((p) => ({ p, hits: (p.words || []).filter((w) => answerWords.has(w.toLowerCase())).length }))
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 2)
    .map((x) => x.p);

  const panel = h("section", { class: "feedback", "aria-live": "polite" },
    verdictFor(result),
    typedWrong && [
      h("p", { class: "line-label" }, "You wrote"),
      h("p", { class: "words", lang: "vi" }, typedLine(result)),
    ],
    h("p", { class: "line-label" }, result.correct && result.showDiff ? "With marks" : "Correct answer"),
    h("p", { class: "words", lang: "vi" }, typedWrong ? expectedLine(result) : result.answer),
    (result.keep || item.from) && h("p", { class: "sub small" }, item.en),
    lines.length > 0 && h("ul", { class: "mistake-list" }, lines.map((line) => h("li", {}, line))),
    notes.length > 0 && h("div", { class: "tip" }, notes.map((note) => h("p", {}, note))),
    !result.correct && related.map(grammarPeek),
  );

  if (result.keep) {
    // Keep the answer options on screen so the right one can be compared.
    app.append(panel, actions);
  } else {
    show(progressRow(session, entry.retry),
      item.from ? h("p", { class: "prompt", lang: "vi" }, withBold(item.from)) : h("p", { class: "prompt" }, item.en),
      panel, actions);
  }
  nextButton.focus();
}

function renderSummary(session) {
  const answered = session.done;
  show(
    h("h1", {}, answered ? `${session.firstTryRight} of ${answered} right first time` : "Session ended"),
    session.missed.length > 0
      ? [h("h2", {}, "Worth another look"),
         session.missed.map(({ item, typed }) =>
           h("div", { class: "review-item" },
             h("p", { class: "mistake-vi", lang: "vi" }, item.vi),
             h("p", { class: "mistake-en" }, item.en),
             typed ? h("p", { class: "mistake-typed" }, "You answered: ", vi(typed)) : null))]
      : answered ? h("p", { class: "sub" }, "No mistakes in this session.") : null,
    h("div", { class: "actions" },
      h("button", { class: "btn primary", type: "button", onclick: () => startSession(session.pool, session.mode) }, "Keep going"),
      h("a", { class: "btn as-link", href: "#/practice" }, "Change topics")),
  );
}

// ---------- Letters ----------

// The picture that goes with a letter: a vowel map spot, or where a consonant is made.
function letterVisual(letter) {
  return Visuals.isVowel(letter) ? Visuals.vowelMap(letter) : Visuals.placeStrip(letter);
}

function letterRow(entry) {
  const vowel = Visuals.isVowel(entry.letter);
  const air = Visuals.consonantAir(entry.letter);
  // Skip the air note when the description already says it, such as "no puff of air".
  const longWords = (text) => text.toLowerCase().split(/\W+/).filter((w) => w.length >= 3);
  const repeats = air && longWords(air).some((w) => longWords(entry.sound).includes(w));
  const detail = vowel ? Visuals.vowelTags(entry.letter) : repeats ? null : air;
  return h("div", { class: `letter-row ${vowel ? "has-picture" : ""}` },
    h("span", { class: "letter-glyph", lang: "vi" }, entry.letter),
    vowel && h("div", { class: "letter-picture" }, Visuals.vowelMap(entry.letter)),
    h("div", {},
      h("p", {}, entry.sound),
      detail && h("p", { class: "letter-detail" }, detail),
      !vowel && Visuals.placeStrip(entry.letter),
      h("p", { class: "letter-word" }, h("b", { lang: "vi" }, entry.word), ` = ${entry.meaning}`)));
}

function renderLetters() {
  const groups = content.letterGroups;
  const firstVowelGroup = groups.find((group) => group.letters.some((l) => Visuals.isVowel(l.letter)));
  const firstConsonantGroup = groups.find((group) => !group.letters.some((l) => Visuals.isVowel(l.letter)));

  const jump = (id, label) => h("button", { class: "btn link jump", type: "button", onclick: () => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }) }, label);

  show(
    h("h1", {}, "Sounds"),
    h("p", { class: "sub" }, "How Vietnamese sounds in the north, described in English: tones, letters, vowel groups, endings, and how syllables are built."),
    h("nav", { class: "page-jumps", "aria-label": "On this page" },
      jump("sec-tones", "Tones"), jump("sec-vowels", "Vowels"), jump("sec-consonants", "Consonants"),
      jump("sec-groups", "Vowel groups"), jump("sec-endings", "Endings"), jump("sec-syllables", "Syllable builder")),
    h("div", { class: "quiz-buttons" },
      h("button", { class: "btn primary", type: "button", onclick: () => startQuiz(soundQuestions()) }, "Letter sounds quiz"),
      h("button", { class: "btn", type: "button", onclick: () => startQuiz(toneQuestions()) }, "Tones quiz"),
      h("button", { class: "btn", type: "button", onclick: () => startQuiz(similarQuestions()) }, "Similar words quiz")),
    h("h2", { id: "sec-tones" }, "Tones"),
    h("p", { class: "group-note" }, "Six tones. The mark changes the word completely. Each line shows your voice going from low (bottom) to high (top) across the word. The dot is where you start."),
    content.tones.map((tone) =>
      h("div", { class: "letter-row has-picture" },
        h("span", { class: "letter-glyph", lang: "vi" }, tone.mark),
        h("div", { class: "letter-picture" }, Visuals.contour(tone.name)),
        h("div", {},
          h("p", {}, h("b", { lang: "vi" }, tone.name), `. ${tone.how}`),
          h("p", { class: "letter-word" }, h("b", { lang: "vi" }, tone.word), ` = ${tone.meaning}`)))),
    groups.map((group) => [
      group === firstVowelGroup && [
        h("h2", { id: "sec-vowels" }, "Vowel map"),
        h("p", { class: "group-note" }, "Where your tongue sits for each vowel. Left is the front of the mouth, top is a nearly closed mouth. Circled vowels have rounded lips."),
        h("div", { class: "vowel-map-wrap" }, Visuals.vowelMap(null, "large")),
      ],
      h("h2", { id: group === firstConsonantGroup ? "sec-consonants" : null }, group.title),
      group === firstConsonantGroup && h("p", { class: "group-note" }, "The strip shows where in the mouth each sound is made, from the lips to the throat."),
      group.note ? h("p", { class: "group-note" }, group.note) : null,
      group.letters.map(letterRow),
    ]),
    northernExtras(),
    syllableBuilder(),
  );
}

// ---------- Vowel groups, endings and the syllable builder ----------

const VOWEL_GROUPS = [
  { forms: "iê · ia · yê · ya", how: "Say 'ee' and glide into 'uh', like 'ear'. Written ia (or ya) when nothing follows, iê (or yê) when a letter follows.", words: ["tiền", "nhiều", "việc", "chia sẻ"] },
  { forms: "uô · ua", how: "'oo' gliding into 'uh'. Written ua when nothing follows, uô when a letter follows.", words: ["của", "muốn", "cuộc", "mua"] },
  { forms: "ươ · ưa", how: "ư (oo with spread lips) gliding into ơ. Written ưa when nothing follows, ươ when a letter follows.", words: ["nước", "người", "chưa", "đưa"] },
  { forms: "oa · oe · uy · uê", how: "Start with a quick w: oa ≈ 'wa', oe ≈ 'weh', uy ≈ 'wee', uê ≈ 'way'. After q the w is written u: qua, quê.", words: ["hoặc", "khoảng", "thuê", "quả"] },
  { forms: "ai · ay / ao · au", how: "ai has a long a, ay a short one (tai vs tay). The same goes for ao (long) and au (short).", words: ["hai", "này", "sao", "sau"] },
];

const ENDINGS = [
  { forms: "-anh", how: "Sounds like 'ayn' in the north.", words: ["anh", "nhanh", "thành"] },
  { forms: "-ach", how: "Sounds like 'ayk', short and cut off.", words: ["sách", "cách", "khách"] },
  { forms: "-ênh, -inh, -êch, -ich", how: "The tongue stays forward; -nh is a soft ng and -ch a soft k.", words: ["tính", "lịch sử", "chính"] },
  { forms: "-ong, -ông, -ung, -oc, -ôc, -uc", how: "The lips close at the end, so ông almost sounds like 'om' with puffed cheeks.", words: ["không", "ông", "cùng", "học"] },
  { forms: "-p, -t, -c", how: "Not released: stop the sound without a puff of air. Only the sắc and nặng tones can go with these endings.", words: ["một", "đẹp", "biết", "được"] },
];

function soundTable(id, title, note, rows) {
  const find = (w) => words.find((word) => word.vi === w);
  return [
    h("h2", { id }, title),
    note && h("p", { class: "group-note" }, note),
    rows.map((row) => h("div", { class: "sound-row" },
      h("p", { class: "sound-forms", lang: "vi" }, row.forms),
      h("p", {}, row.how),
      h("p", { class: "letter-word" }, row.words.map((w, i) => [i ? " · " : "", h("b", { lang: "vi" }, w), find(w) ? ` ${find(w).en.split(";")[0]}` : ""])))),
  ];
}

function northernExtras() {
  return [
    soundTable("sec-groups", "Vowel groups", "Two or three vowels that glide into each other in one syllable.", VOWEL_GROUPS),
    soundTable("sec-endings", "Endings", "How syllable endings sound in the north.", ENDINGS),
  ];
}

let syllableIndex = null;
// Every syllable in the 1000 words, filed under initial + rime.
function syllablesInWords() {
  if (syllableIndex) return syllableIndex;
  syllableIndex = new Map();
  for (const word of words) {
    for (const part of Check.words(word.vi)) {
      const parsed = Syllables.parse(part);
      if (!parsed || !Syllables.RIMES.has(parsed.rime)) continue;
      const key = `${parsed.initial}|${parsed.rime}`;
      if (!syllableIndex.has(key)) syllableIndex.set(key, []);
      const list = syllableIndex.get(key);
      if (!list.includes(word)) list.push(word);
    }
  }
  return syllableIndex;
}

function syllableBuilder() {
  const box = h("section", { id: "sec-syllables", class: "syllable-builder" });
  const ui = state.syllableUi;
  const index = syllablesInWords();

  function draw() {
    const group = Syllables.RIME_GROUPS.find((g) => g.id === ui.group) || Syllables.RIME_GROUPS[0];
    if (!group.rimes.includes(ui.rime)) ui.rime = group.rimes[0];
    const set = (patch) => { Object.assign(ui, patch); save(); draw(); };

    const initials = h("div", { class: "chip-picker", role: "radiogroup", "aria-label": "First letter" },
      Syllables.INITIALS.map((initial) => h("button", {
        class: `pick ${ui.initial === initial ? "on" : ""}`, type: "button", lang: "vi",
        "aria-pressed": ui.initial === initial ? "true" : "false", onclick: () => set({ initial }),
      }, initial || "none")));
    const groups = h("div", { class: "segments", role: "radiogroup", "aria-label": "Rime group" },
      Syllables.RIME_GROUPS.map((g) => h("label", {},
        h("input", { type: "radio", name: "rime-group", value: g.id, checked: g.id === group.id, onchange: () => set({ group: g.id }) }),
        g.label)));
    const cells = h("div", { class: "syl-grid" }, group.rimes.map((rime) => {
      const ok = Syllables.check(ui.initial, rime).ok;
      const known = index.has(`${ui.initial}|${rime}`);
      return h("button", {
        class: `syl ${ok ? "" : "is-invalid"} ${known ? "is-known" : ""} ${rime === ui.rime ? "on" : ""}`,
        type: "button", lang: "vi", onclick: () => set({ rime }),
        "aria-label": `${Syllables.join(ui.initial, rime)}${ok ? "" : ", not a valid spelling"}${known ? ", in your words" : ""}`,
      }, Syllables.join(ui.initial, rime));
    }));

    box.replaceChildren(
      h("h2", {}, "Syllable builder"),
      h("p", { class: "group-note" }, "Every syllable is a first letter, a rime and a tone. Pick them to see the spelling, where the tone mark goes and real words that use it. Highlighted cells are in your top 1000 words; crossed-out ones break a spelling rule."),
      h("p", { class: "line-label" }, "First letter"),
      initials,
      h("p", { class: "line-label" }, "Rime"),
      groups,
      cells,
      syllablePanel(ui.initial, ui.rime, index),
    );
  }

  draw();
  return box;
}

function syllablePanel(initial, rime, index) {
  const rule = Syllables.check(initial, rime);
  const plain = Syllables.join(initial, rime);
  if (!rule.ok) {
    return h("div", { class: "syl-panel" },
      h("p", { class: "syl-big is-invalid", lang: "vi" }, plain),
      h("p", { class: "verdict wrong" }, "Not a valid spelling"),
      h("p", {}, rule.reason));
  }
  const at = Syllables.markIndex(rime);
  const carrier = [...rime][at];
  const styles = Syllables.write(initial, rime, "huyền", "new") !== Syllables.write(initial, rime, "huyền", "old");
  const examples = (index.get(`${initial}|${rime}`) || []).slice(0, 8);
  const notes = Syllables.rimeNotes(rime);
  const consonant = initial && Visuals.placeStrip(initial);
  return h("div", { class: "syl-panel" },
    h("p", { class: "syl-big", lang: "vi" }, plain),
    h("div", { class: "syl-tones" }, Syllables.TONE_ORDER.map((tone) => {
      const possible = Syllables.validTone(rime, tone);
      return h("div", { class: `syl-tone ${possible ? "" : "is-invalid"}` },
        Visuals.contour(tone, { size: "tiny" }),
        h("span", { class: "tone-chip-word", lang: "vi" }, possible ? Syllables.write(initial, rime, tone) : "–"),
        h("span", { class: "tone-chip-name", lang: "vi" }, tone));
    })),
    h("p", {}, "The tone mark goes on ", h("b", { lang: "vi" }, carrier), "."),
    styles && h("p", { class: "sub small" }, `Both ${Syllables.write(initial, rime, "huyền", "new")} and ${Syllables.write(initial, rime, "huyền", "old")} are used; the app's notes write the mark on the second vowel.`),
    Syllables.isChecked(rime) && h("p", { class: "sub small" }, "Ends in p, t, c or ch, so only sắc and nặng are possible."),
    notes.length > 0 && h("ul", { class: "plain-list syl-notes" }, notes.map((n) => h("li", {}, n))),
    consonant && h("div", { class: "syl-place" }, h("p", { class: "line-label" }, `Where ${initial} is made`), consonant),
    h("p", { class: "line-label" }, "In your top 1000 words"),
    examples.length
      ? h("p", { class: "syl-examples" }, examples.map((w, i) => [i ? " · " : "", h("b", { lang: "vi" }, w.vi), ` ${w.en.split(";")[0]}`]))
      : h("p", { class: "sub small" }, "None of your top 1000 words use this syllable. It may still be a real word."),
  );
}

function similarQuestions() {
  return shuffle(content.soundPairs).slice(0, QUIZ_SIZE).map((pair) => {
    const target = pick([pair.a, pair.b]);
    return {
      instruction: "Which word means this?", prompt: target.meaning, optionsLang: "vi",
      options: shuffle([pair.a.word, pair.b.word]), right: target.word,
      explain: `${pair.a.word} = ${pair.a.meaning}, ${pair.b.word} = ${pair.b.meaning}`,
    };
  });
}

function toneQuestions() {
  const names = content.tones.map((tone) => tone.name);
  const words = [...new Set(content.items.flatMap((item) => Check.words(item.vi)).map((w) => w.toLowerCase()))]
    .filter((word) => /^\p{L}+$/u.test(word) && !/[øf]|iphone|isaac/.test(word));
  const makers = [
    () => {
      const heard = pick(pick(content.toneFamilies));
      const family = content.toneFamilies.find((f) => f.includes(heard));
      return {
        instruction: "Which word means this?", prompt: heard.meaning, optionsLang: "vi",
        options: family.map((w) => w.word), right: heard.word,
        explain: `${heard.word} = ${heard.meaning}, the ${heard.tone} tone.`,
      };
    },
    () => {
      const word = pick(words);
      const name = toneName(word);
      return {
        instruction: "Which tone is on this word?", prompt: word, promptLang: "vi", optionsLang: "vi",
        options: names, right: name,
        explain: `${word} has the ${name} tone.`,
      };
    },
    () => {
      const tone = pick(content.tones);
      return {
        instruction: "Which tone is this?", prompt: tone.how, optionsLang: "vi",
        options: names, right: tone.name,
        explain: `${tone.name}, written ${tone.mark}, as in ${tone.word} = ${tone.meaning}.`,
        explainVisual: Visuals.contour(tone.name, { size: "medium" }),
      };
    },
    () => {
      const tone = pick(content.tones);
      return {
        instruction: "Which tone has this pitch line?",
        visual: Visuals.contour(tone.name, { size: "large", label: "Pitch line for a tone" }),
        optionsLang: "vi", options: names, right: tone.name,
        explain: `${tone.name}: ${tone.how}`,
      };
    },
  ];
  return Array.from({ length: QUIZ_SIZE }, (_, i) => makers[i % makers.length]());
}

function soundQuestions() {
  const all = content.letterGroups.flatMap((group) => group.letters);
  return shuffle(all).slice(0, QUIZ_SIZE).map((entry) => {
    // Letters that share a sound in the north can't be told apart here.
    const others = shuffle(all.filter((o) => o !== entry && (!entry.same || o.same !== entry.same)));
    const wrong = [];
    for (const other of others) {
      if (wrong.length === 3) break;
      if (!wrong.some((w) => w.same && w.same === other.same)) wrong.push(other);
    }
    return {
      instruction: "Which letter makes this sound?", prompt: entry.sound, optionsLang: "vi",
      options: shuffle([entry, ...wrong]).map((o) => o.letter), right: entry.letter,
      explain: `${entry.letter}, as in ${entry.word} = ${entry.meaning}`,
      explainVisual: letterVisual(entry.letter),
    };
  });
}

function startQuiz(questions) {
  let index = 0;
  let score = 0;

  function ask() {
    const q = questions[index];
    if (!q) return showEnd();
    const buttons = q.options.map((text, i) =>
      h("button", { class: "option", type: "button", lang: q.optionsLang, onclick: () => choose(i) },
        h("span", { class: "key", "aria-hidden": "true" }, i + 1), h("span", {}, text)));

    function choose(i) {
      if (buttons[0].disabled) return;
      const correct = q.options[i] === q.right;
      if (correct) score += 1;
      buttons.forEach((button, b) => {
        button.disabled = true;
        if (q.options[b] === q.right) button.classList.add("is-right");
        else if (b === i) button.classList.add("is-wrong");
      });
      onKey = null;
      index += 1;
      const nextButton = h("button", { class: "btn primary", type: "button", onclick: ask }, index < questions.length ? "Next" : "See results");
      app.append(
        h("section", { class: "feedback", "aria-live": "polite" },
          h("strong", { class: `verdict ${correct ? "right" : "wrong"}` }, correct ? "Correct" : "Not quite"),
          h("p", { lang: "vi" }, q.explain),
          q.explainVisual && h("div", { class: "explain-picture" }, q.explainVisual)),
        h("div", { class: "actions" }, nextButton));
      nextButton.focus();
    }

    const fill = h("div", { class: "progress-fill", style: `width:${(index / questions.length) * 100}%` });
    show(
      h("div", { class: "progress-row" },
        h("div", { class: "progress-track" }, fill),
        h("span", {}, `${index + 1} of ${questions.length}`),
        h("a", { href: "#/sounds", class: "small" }, "End")),
      h("p", { class: "instruction" }, q.instruction),
      q.visual ? h("div", { class: "quiz-picture" }, q.visual) : h("p", { class: "prompt", lang: q.promptLang }, q.prompt),
      h("div", { class: "options big" }, buttons),
    );
    onKey = (event) => {
      const i = Number(event.key) - 1;
      if (i >= 0 && i < q.options.length) choose(i);
    };
  }

  function showEnd() {
    show(
      h("h1", {}, `${score} of ${questions.length} right`),
      h("div", { class: "actions" },
        h("a", { class: "btn primary as-link", href: "#/sounds" }, "Back to sounds")),
    );
  }

  ask();
}

// ---------- Grammar ----------

const QUESTION_LABELS = {
  choice: "Pick the right answer",
  translate: "Write it in Vietnamese (no marks needed)",
  fix: "Correct this sentence",
  truefalse: "Is this right?",
};

const pointById = (id) => grammar.find((p) => p.id === id);
const pointsForTopic = (topic) => grammar.filter((p) => p.topics?.includes(topic));
const pointsForWord = (vi) => grammar.filter((p) => p.words?.includes(vi));
const grammarKey = (id, n) => `${id}|${n}`;

function grammarScore(point) {
  const right = point.practice.filter((_, n) => state.grammar.right[grammarKey(point.id, n)]).length;
  return { right, total: point.practice.length };
}

function recordGrammar(point, n, correct, typed) {
  const key = grammarKey(point.id, n);
  const miss = state.grammar.misses[key];
  if (correct) {
    state.grammar.right[key] = true;
    if (miss) miss.open = false;
  } else {
    delete state.grammar.right[key];
    state.grammar.misses[key] = { count: (miss?.count || 0) + 1, typed: typed ?? "", open: true, at: Date.now() };
  }
  save();
}

const openGrammarMisses = () => Object.entries(state.grammar.misses)
  .filter(([key, miss]) => miss.open && pointById(key.split("|")[0]))
  .map(([key, miss]) => {
    const [id, n] = key.split("|");
    const point = pointById(id);
    return { point, question: point.practice[Number(n)], miss };
  })
  .filter((entry) => entry.question);

// A compact version of a grammar point, shown under a wrong answer in Practice.
function grammarPeek(point) {
  return h("details", { class: "rule-peek" },
    h("summary", {}, `Grammar: ${point.form}`),
    h("p", { class: "rule-body" }, point.summary),
    h("p", { class: "pattern small" }, point.pattern),
    h("dl", { class: "examples" }, point.examples.slice(0, 2).map((example) => [
      h("dt", { lang: "vi" }, example.vi),
      h("dd", {}, example.en),
    ])),
    h("a", { href: `#/grammar/${point.id}`, class: "small" }, "Open the full explanation"));
}

function grammarRow(point) {
  const score = grammarScore(point);
  const progress = score.right === score.total ? "all right" : score.right ? `${score.right}/${score.total} right` : "";
  return h("a", { class: "gp-row", href: `#/grammar/${point.id}` },
    h("span", { class: "gp-form", lang: "vi" }, point.form),
    h("span", { class: "gp-meaning" }, point.meaning),
    h("span", { class: `gp-meta ${score.right === score.total ? "is-done" : ""}` }, [point.level, progress].filter(Boolean).join(" · ")));
}

function renderGrammarList() {
  const ui = state.grammarUi;
  const categories = [...new Set(grammar.map((p) => p.category))];
  const list = h("div", { "aria-live": "polite" });
  const search = h("input", {
    class: "answer-input", type: "search", lang: "vi", "aria-label": "Search grammar and sentences",
    autocomplete: "off", autocapitalize: "off", autocorrect: "off", spellcheck: "false",
    placeholder: "Search Vietnamese or English", oninput: () => draw(),
  });
  const levels = h("div", { class: "segments", role: "radiogroup", "aria-label": "Level" },
    ["All", "A1", "A2"].map((level) => h("label", {},
      h("input", { type: "radio", name: "level", value: level, checked: ui.level === level, onchange: () => { ui.level = level; save(); draw(); } }),
      level === "All" ? "All levels" : level)));
  const category = h("select", { class: "select", "aria-label": "Category", onchange: (event) => { ui.category = event.target.value; save(); draw(); } },
    h("option", { value: "All" }, "All categories"),
    categories.map((c) => h("option", { value: c, selected: ui.category === c }, c)));

  // Compare word by word, without marks or punctuation, so "co khong" finds "có … không".
  const searchable = (text) => Check.words(text).map(Check.plain).join(" ");

  function draw() {
    const query = searchable(search.value);
    const matchesQuery = (p) => !query || [p.form, p.meaning, p.summary, p.pattern, ...p.examples.flatMap((e) => [e.vi, e.en])].some((text) => searchable(text).includes(query));
    const shown = grammar.filter((p) => (ui.level === "All" || p.level === ui.level) && (ui.category === "All" || p.category === ui.category) && matchesQuery(p));
    const groups = categories.filter((c) => shown.some((p) => p.category === c));
    const sentences = query ? content.items.filter((item, i, all) =>
      (searchable(item.vi).includes(query) || searchable(item.en).includes(query)) && all.findIndex((o) => o.vi === item.vi) === i) : [];
    list.replaceChildren(...clean([
      shown.length === 0 && h("p", { class: "sub search-empty" }, "No grammar point matches that."),
      groups.map((group) => [h("h2", {}, group), shown.filter((p) => p.category === group).map(grammarRow)]),
      sentences.length > 0 && [
        h("h2", {}, "In your sentences"),
        sentences.slice(0, SEARCH_LIMIT).map((item) => h("div", { class: "review-item" },
          h("p", { class: "mistake-vi", lang: "vi" }, item.vi),
          h("p", { class: "mistake-en" }, item.en))),
      ],
    ]));
  }

  const done = grammar.filter((p) => { const s = grammarScore(p); return s.right === s.total; }).length;
  show(
    h("h1", {}, "Grammar"),
    h("p", { class: "sub" }, `${grammar.length} patterns for beginners (A1–A2), in northern Vietnamese. Each has examples, common mistakes and practice. ${done} fully practised.`),
    h("div", { class: "search" }, search),
    h("div", { class: "grammar-filters" }, levels, category),
    list,
  );
  draw();
}

function renderGrammarPoint(id) {
  const point = pointById(id);
  if (!point) return renderGrammarList();
  const related = (point.related || []).map(pointById).filter(Boolean);
  const linkedWords = (point.words || []).map((w) => words.find((word) => word.vi === w)).filter(Boolean);

  show(
    h("a", { href: "#/grammar", class: "back-link small" }, "← All grammar"),
    h("h1", { lang: "vi" }, point.form),
    h("p", { class: "sub" }, `${point.meaning} · ${point.level} · ${point.category}`),
    h("p", { class: "pattern" }, point.pattern),
    h("p", { class: "gp-summary" }, point.summary),
    h("h2", {}, "Examples"),
    h("dl", { class: "examples" }, point.examples.map((example) => [h("dt", { lang: "vi" }, example.vi), h("dd", {}, example.en)])),
    point.howTo?.length > 0 && [h("h2", {}, "How to use it"), h("ul", { class: "plain-list" }, point.howTo.map((line) => h("li", {}, line)))],
    h("h2", {}, "Compared with English"),
    h("p", {}, point.english),
    point.mistakes?.length > 0 && [
      h("h2", {}, "Common mistakes"),
      point.mistakes.map((m) => h("div", { class: "mistake-pair" },
        h("p", { class: "pair-wrong", lang: "vi" }, h("span", { class: "sr-only" }, "Wrong: "), m.wrong),
        h("p", { class: "pair-right", lang: "vi" }, h("span", { class: "sr-only" }, "Right: "), m.right),
        h("p", { class: "sub small" }, m.why))),
    ],
    h("h2", {}, "Practice"),
    point.practice.map((question, n) => practiceQuestion(point, question, n)),
    related.length > 0 && [h("h2", {}, "Related"), h("div", { class: "chips" }, related.map((p) => h("a", { class: "chip", href: `#/grammar/${p.id}`, lang: "vi" }, p.form)))],
    linkedWords.length > 0 && [h("h2", {}, "In the top 1000 words"), h("p", { class: "sub" }, linkedWords.map((w) => `${w.vi} (#${w.rank})`).join(" · "))],
  );
}

function practiceQuestion(point, q, n) {
  const box = h("section", { class: "practice-q" });
  const done = state.grammar.right[grammarKey(point.id, n)];

  function draw() {
    const head = [
      h("p", { class: "instruction" }, `${n + 1}. ${QUESTION_LABELS[q.type]}${done ? " · answered right before" : ""}`),
      h("p", { class: "pq-prompt", lang: q.type === "fix" || q.type === "truefalse" ? "vi" : null }, q.q),
    ];
    if (q.type === "choice" || q.type === "truefalse") {
      const options = q.type === "choice" ? q.options : ["Right", "Wrong"];
      const right = q.type === "choice" ? q.answer : q.answer ? "Right" : "Wrong";
      const buttons = options.map((text) => h("button", {
        class: "option", type: "button", lang: q.type === "choice" ? "vi" : null,
        onclick: (clicked) => {
          const correct = text === right;
          buttons.forEach((b, i) => {
            b.disabled = true;
            if (options[i] === right) b.classList.add("is-right");
            else if (b === clicked.currentTarget) b.classList.add("is-wrong");
          });
          recordGrammar(point, n, correct, text);
          box.append(h("div", { class: "pq-feedback" },
            h("strong", { class: `verdict ${correct ? "right" : "wrong"}` }, correct ? "Correct" : "Not quite"),
            q.why && h("p", {}, q.why),
            h("button", { class: "btn link", type: "button", onclick: draw }, "Try again")));
        },
      }, text));
      box.replaceChildren(...head, h("div", { class: "options" }, buttons));
      return;
    }
    const accepted = [q.answer, ...(q.alt || [])];
    const input = h("input", {
      class: "answer-input", type: "text", lang: "vi", "aria-label": "Your answer",
      autocomplete: "off", autocapitalize: "off", autocorrect: "off", spellcheck: "false",
      placeholder: "Type here, no marks needed",
    });
    const check = (typed) => {
      const result = { ...Check.checkAnswer(typed, accepted, { tips: content.tips }), typed };
      recordGrammar(point, n, result.correct, typed);
      const typedWrong = !result.correct && !result.kinds.skipped;
      const lines = typedWrong ? explainMistakes(result) : [];
      box.replaceChildren(...head, h("div", { class: "pq-feedback" },
        verdictFor(result),
        typedWrong && [h("p", { class: "line-label" }, "You wrote"), h("p", { class: "words", lang: "vi" }, typedLine(result))],
        h("p", { class: "line-label" }, "Correct answer"),
        h("p", { class: "words", lang: "vi" }, typedWrong ? expectedLine(result) : result.answer),
        lines.length > 0 && h("ul", { class: "mistake-list" }, lines.map((line) => h("li", {}, line))),
        result.tips.length > 0 && h("div", { class: "tip" }, result.tips.map((tip) => h("p", {}, tip))),
        h("div", { class: "actions" },
          h("button", { class: "btn", type: "button", onclick: draw }, "Try again"),
          typedWrong && h("button", { class: "btn link", type: "button", onclick: () => { recordGrammar(point, n, true, typed); draw(); } }, "My answer was fine"))));
    };
    box.replaceChildren(...head,
      h("form", { onsubmit: (event) => { event.preventDefault(); check(input.value); } },
        input,
        h("div", { class: "actions" },
          h("button", { class: "btn primary", type: "submit" }, "Check"),
          h("button", { class: "btn link", type: "button", onclick: () => check("") }, "Show answer"))));
  }

  draw();
  return box;
}

// ---------- Words (spaced repetition) ----------

const NEW_PER_DAY_OPTIONS = [3, 5, 10];
const GRADES = [
  { id: "again", label: "Again", key: "1" },
  { id: "hard", label: "Hard", key: "2" },
  { id: "good", label: "Good", key: "3" },
  { id: "easy", label: "Easy", key: "4" },
];

const today = () => SRS.dayKey(Date.now());

function newLeft() {
  const w = state.words;
  const bonus = w.bonus.day === today() ? w.bonus.count : 0;
  return Math.max(0, w.newPerDay + bonus - (w.introduced[today()] || 0));
}

const wordByRank = (rank) => words.find((w) => w.rank === rank);

// Sentences from the lesson notes that contain the word, as a whole word.
function examplesFor(word) {
  const target = Check.words(word.vi).map((w) => w.toLowerCase());
  const seen = new Set();
  return content.items.filter((item) => {
    const list = Check.words(item.vi).map((w) => w.toLowerCase());
    const found = list.some((_, i) => target.every((t, k) => list[i + k] === t));
    if (!found || seen.has(item.vi) || list.length < 2) return false;
    seen.add(item.vi);
    return true;
  }).slice(0, 2);
}

function toneChips(text) {
  return h("div", { class: "tone-chips" }, Check.words(text).map((syllable) => {
    const name = toneName(syllable);
    return h("div", { class: "tone-chip" },
      Visuals.contour(name, { size: "tiny", label: `${syllable}: ${name} tone` }),
      h("span", { class: "tone-chip-word", lang: "vi" }, syllable),
      h("span", { class: "tone-chip-name", lang: "vi" }, name));
  }));
}

function wordDetails(word) {
  const examples = examplesFor(word);
  const points = pointsForWord(word.vi).slice(0, 3);
  return [
    h("p", { class: "card-meaning" }, word.en),
    toneChips(word.vi),
    points.length > 0 && h("p", { class: "card-grammar small" }, "Grammar: ",
      points.map((p, i) => [i ? " · " : "", h("a", { href: `#/grammar/${p.id}`, lang: "vi" }, p.form)])),
    examples.length > 0 && h("div", { class: "card-examples" },
      h("p", { class: "line-label" }, "In your notes"),
      examples.map((item) => h("p", {}, vi(item.vi, { class: "example-vi" }), h("span", { class: "sub small" }, ` ${item.en}`)))),
  ];
}

function wordStatus(word, now) {
  const card = state.words.cards[`${word.rank}:r`];
  if (!card) return { text: "not started", cls: "" };
  if (card.state !== "review") return { text: "learning", cls: "is-learning" };
  if (card.due <= now) return { text: "due", cls: "is-due" };
  return { text: `next in ${SRS.formatWait(card.due - now)}`, cls: "is-known" };
}

function renderWords() {
  const now = Date.now();
  const w = state.words;
  const c = SRS.counts(w.cards, words, { now, newLeft: newLeft() });
  const total = c.new + c.learning + c.review;
  const started = words.filter((word) => w.cards[`${word.rank}:r`]).length;
  const inReview = words.filter((word) => w.cards[`${word.rank}:r`]?.state === "review").length;
  const upcoming = Object.values(w.cards).map((card) => card.due).filter((due) => due > now).sort((a, b) => a - b)[0];

  const perDay = h("div", { class: "segments", role: "radiogroup", "aria-label": "New words per day" },
    NEW_PER_DAY_OPTIONS.map((n) =>
      h("label", {},
        h("input", { type: "radio", name: "per-day", value: n, checked: w.newPerDay === n, onchange: () => { w.newPerDay = n; save(); renderWords(); } }),
        `${n} a day`)));

  const study = total > 0
    ? [
        h("p", { class: "due-line" }, `${c.new} new · ${c.learning} learning · ${c.review} to review`),
        h("div", { class: "actions" }, h("button", { class: "btn primary", type: "button", onclick: () => studyWords() }, "Study now")),
      ]
    : [
        h("p", { class: "due-line" }, started === words.length && !upcoming
          ? "You've started all 100 words."
          : upcoming ? `Done for now. Next card in ${SRS.formatWait(upcoming - now)}.` : "Done for now."),
        started < words.length && h("div", { class: "actions" },
          h("button", {
            class: "btn", type: "button",
            onclick: () => {
              const count = (w.bonus.day === today() ? w.bonus.count : 0) + w.newPerDay;
              w.bonus = { day: today(), count };
              save();
              studyWords();
            },
          }, `Learn ${w.newPerDay} more new words`)),
      ];

  show(
    h("h1", {}, "Words"),
    h("p", { class: "sub" }, "The 1000 most common Vietnamese words, most common first, a few new ones each day. Cards come back just before you'd forget them."),
    h("div", { class: "word-study" }, study),
    h("h2", {}, "New words per day"),
    perDay,
    h("h2", {}, "All words"),
    h("p", { class: "sub" }, `${started} of ${words.length} started · ${inReview} past the learning stage`),
    wordBrowser(now),
    h("div", { class: "actions" },
      h("button", { class: "btn", type: "button", onclick: exportForAnki }, "Download for Anki")),
    h("p", { class: "sub small" }, "Imports into the Anki app as Basic (and reversed card) notes. Progress here and in Anki is separate."),
  );
}

const TIERS = [
  { id: 100, label: "1–100", from: 1, to: 100 },
  { id: 500, label: "101–500", from: 101, to: 500 },
  { id: 1000, label: "501–1000", from: 501, to: 1000 },
];
const tierOf = (rank) => TIERS.find((t) => rank >= t.from && rank <= t.to).id;

// Shows one tier at a time, or search results across all 1000 words.
function wordBrowser(now) {
  const list = h("div", { class: "word-list", "aria-live": "polite" });
  const search = h("input", {
    class: "answer-input", type: "search", lang: "vi", "aria-label": "Search the 1000 words",
    autocomplete: "off", autocapitalize: "off", autocorrect: "off", spellcheck: "false",
    placeholder: "Search Vietnamese or English", oninput: () => draw(),
  });
  const tiers = h("div", { class: "segments", role: "radiogroup", "aria-label": "Word range" },
    TIERS.map((tier) => h("label", {},
      h("input", {
        type: "radio", name: "tier", value: tier.id, checked: (state.words.tier || 100) === tier.id,
        onchange: () => { state.words.tier = tier.id; save(); draw(); },
      }),
      tier.label)));

  function row(word) {
    const status = wordStatus(word, now);
    return h("div", { class: "word-row" },
      h("span", { class: "word-rank" }, word.rank),
      h("span", { class: "word-vi", lang: "vi" }, word.vi),
      h("span", { class: "word-en" }, word.en),
      h("span", { class: `word-status ${status.cls}` }, status.text));
  }

  function draw() {
    const query = Check.plain(search.value.trim());
    tiers.hidden = query.length > 0;
    if (query) {
      const hits = words.filter((w) => Check.plain(w.vi).includes(query) || w.en.toLowerCase().includes(query));
      list.replaceChildren(...(hits.length ? hits.slice(0, 100).map(row) : [h("p", { class: "sub search-empty" }, "No word matches that.")]));
      return;
    }
    const tier = TIERS.find((t) => t.id === (state.words.tier || 100));
    list.replaceChildren(...words.filter((w) => w.rank >= tier.from && w.rank <= tier.to).map(row));
  }

  draw();
  return h("div", {}, h("div", { class: "search" }, search), h("div", { class: "tier-picker" }, tiers), list);
}

function studyWords(session = { done: 0 }) {
  const now = Date.now();
  const w = state.words;
  const next = SRS.pickNext(w.cards, words, { now, newLeft: newLeft() });
  if (!next) {
    show(
      h("h1", {}, session.done ? `Done for now, ${session.done} ${session.done === 1 ? "card" : "cards"}` : "Nothing to study right now"),
      h("p", { class: "sub" }, "New words and reviews come back on their own. Check in tomorrow."),
      h("div", { class: "actions" }, h("a", { class: "btn primary as-link", href: "#/words" }, "Back to words")),
    );
    return;
  }

  const c = SRS.counts(w.cards, words, { now, newLeft: newLeft() });
  const header = h("div", { class: "progress-row" },
    h("span", { class: "study-counts" },
      h("span", { class: "count-new" }, `${c.new} new`), " · ",
      h("span", {}, `${c.learning} learning`), " · ",
      h("span", {}, `${c.review} review`)),
    h("a", { href: "#/words", class: "small end-link" }, "End"));

  if (next.introduce) {
    const word = next.introduce;
    const meet = () => {
      w.cards[`${word.rank}:r`] = { ...SRS.newCard(`${word.rank}:r`), due: Date.now() + SRS.MINUTE };
      w.introduced[today()] = (w.introduced[today()] || 0) + 1;
      save();
      studyWords(session);
    };
    show(header,
      h("section", { class: "flashcard", tabindex: "-1" },
        h("p", { class: "card-meta" }, `New word · #${word.rank} most common`),
        h("p", { class: "flash-word", lang: "vi" }, word.vi),
        wordDetails(word)),
      h("div", { class: "actions" }, h("button", { class: "btn primary", type: "button", onclick: meet }, "Got it")),
      h("p", { class: "sub small" }, "You'll be asked about it again in a minute."));
    onKey = (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); meet(); } };
    app.querySelector(".flashcard").focus();
    return;
  }

  const card = next.card;
  const [rank, side] = card.id.split(":");
  const word = wordByRank(Number(rank));
  const reverse = side === "p";
  const front = reverse
    ? [h("p", { class: "card-meta" }, "In Vietnamese?"), h("p", { class: "flash-word flash-en" }, word.en)]
    : [h("p", { class: "card-meta" }, `#${word.rank} · What does it mean?`), h("p", { class: "flash-word", lang: "vi" }, word.vi)];
  // Focus sits on the card, not a button, so space and Enter only do what the key handler says.
  const cardBox = h("section", { class: "flashcard", tabindex: "-1" }, front);
  const actions = h("div", { class: "actions" });

  const grade = (id) => {
    const updated = SRS.schedule(card, id, Date.now());
    w.cards[card.id] = updated;
    const reverseId = `${word.rank}:p`;
    if (SRS.shouldUnlockReverse(card, updated) && !w.cards[reverseId]) {
      w.cards[reverseId] = { ...SRS.newCard(reverseId), due: Date.now() };
    }
    session.done += 1;
    save();
    studyWords(session);
  };

  const reveal = () => {
    if (reverse) cardBox.append(h("p", { class: "flash-word answer", lang: "vi" }, word.vi), toneChips(word.vi), h("p", { class: "sub small" }, `#${word.rank} most common`));
    else cardBox.append(...clean([wordDetails(word)]));
    const at = Date.now();
    actions.replaceChildren(h("div", { class: "grades" }, GRADES.map((g) =>
      h("button", { class: `btn grade ${g.id === "good" ? "primary" : ""}`, type: "button", onclick: () => grade(g.id) },
        h("span", {}, g.label),
        h("span", { class: "grade-wait" }, SRS.preview(card, g.id, at))))));
    cardBox.focus();
    onKey = (event) => {
      const chosen = GRADES.find((g) => g.key === event.key);
      if (chosen) grade(chosen.id);
      else if (event.key === " ") { event.preventDefault(); grade("good"); }
    };
  };

  actions.append(h("button", { class: "btn primary", type: "button", onclick: reveal }, "Show answer"));
  show(header, cardBox, actions,
    h("p", { class: "sub small key-help" }, "Keys: space shows the answer, then 1–4 to grade."));
  onKey = (event) => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); reveal(); } };
  cardBox.focus();
}

function exportForAnki() {
  const clean = (text) => text.replace(/[\t\n]/g, " ");
  const lines = ["#separator:tab", "#html:true", "#notetype:Basic (and reversed card)", "#tags column:3"];
  for (const word of words) {
    const examples = examplesFor(word).map((item) => `<br><i>${clean(item.vi)}</i> = ${clean(item.en)}`).join("");
    lines.push([clean(word.vi), `${clean(word.en)}${examples}`, `vietnamese top${tierOf(word.rank)} rank${String(word.rank).padStart(4, "0")}`].join("\t"));
  }
  const blob = new Blob([lines.join("\n") + "\n"], { type: "text/plain;charset=utf-8" });
  const link = h("a", { href: URL.createObjectURL(blob), download: "vietnamese-top-1000.txt" });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

// ---------- Mistakes ----------

function grammarMistakes() {
  const misses = openGrammarMisses().sort((a, b) => b.miss.at - a.miss.at);
  if (misses.length === 0) return null;
  return [
    h("h2", {}, "Grammar"),
    h("p", { class: "sub small" }, "Practice questions from the grammar guide. They leave this list once you answer them right."),
    misses.map(({ point, question, miss }) => h("div", { class: "mistake" },
      h("p", { class: "mistake-vi", lang: question.type === "fix" || question.type === "truefalse" ? "vi" : null }, question.q),
      h("p", { class: "mistake-en" }, "Answer: ",
        vi(question.type === "truefalse" ? (question.answer ? "right" : "wrong") : question.answer)),
      miss.typed ? h("p", { class: "mistake-typed" }, "Last answer: ", vi(miss.typed)) : null,
      h("a", { href: `#/grammar/${point.id}`, class: "small" }, `Practise ${point.form}`))),
  ];
}

function renderMistakes() {
  const items = openMistakes().sort((a, b) => state.progress[itemKey(b)].misses - state.progress[itemKey(a)].misses);
  const grammarPart = grammarMistakes();
  if (items.length === 0 && grammarPart) {
    show(h("h1", {}, "Mistakes"), grammarPart);
    return;
  }
  if (items.length === 0) {
    show(
      h("h1", {}, "Mistakes"),
      h("div", { class: "empty" },
        h("p", {}, "Nothing to review right now."),
        h("p", { class: "sub small" }, "Anything you get wrong lands here until you get it right twice in a row."),
        h("a", { class: "btn primary as-link", href: "#/practice" }, "Go to practice")),
    );
    return;
  }
  const totals = {};
  for (const item of items) {
    for (const [kind, n] of Object.entries(state.progress[itemKey(item)].kinds)) {
      totals[kind] = (totals[kind] || 0) + n;
    }
  }
  const tally = Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([kind, n]) => `${KIND_LABELS[kind] || kind}: ${n}`).join(" · ");

  show(
    h("h1", {}, "Mistakes"),
    h("p", { class: "sub" }, "Sentences stay here until you get them right twice in a row."),
    tally ? h("p", { class: "tally small" }, tally) : null,
    h("div", { class: "actions" },
      h("button", { class: "btn primary", type: "button", onclick: () => startSession(items, "mix") }, `Practise these (${Math.min(items.length, SESSION_SIZE)})`)),
    h("div", { class: "mistake-items" }, items.map((item) => {
      const p = state.progress[itemKey(item)];
      return h("div", { class: "mistake" },
        h("p", { class: "mistake-vi", lang: "vi" }, item.vi),
        h("p", { class: "mistake-en" }, item.en),
        p.lastTyped ? h("p", { class: "mistake-typed" }, "Last answer: ", vi(p.lastTyped)) : null,
        p.misses > 1 ? h("p", { class: "mistake-typed" }, `Wrong ${p.misses} times`) : null);
    })),
    grammarPart,
  );
}

// ---------- Routing and startup ----------

const routes = {
  practice: renderPractice,
  words: renderWords,
  sounds: renderLetters,
  grammar: (id) => (id ? renderGrammarPoint(decodeURIComponent(id)) : renderGrammarList()),
  mistakes: renderMistakes,
};
// Old addresses from before the rename.
const ROUTE_ALIASES = { letters: "sounds", notes: "grammar" };

function route() {
  const [raw, param] = location.hash.replace(/^#\/?/, "").split("/");
  const name = ROUTE_ALIASES[raw] || raw || "practice";
  const render = routes[name] || renderPractice;
  document.querySelectorAll("nav a").forEach((link) => {
    if (link.dataset.route === name) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  render(param);
}

document.addEventListener("keydown", (event) => {
  if (onKey && !event.ctrlKey && !event.metaKey && !event.altKey) onKey(event);
});

async function start() {
  try {
    const responses = await Promise.all(["content", "words", "grammar"].map((name) => fetch(`data/${name}.json`)));
    const failed = responses.find((r) => !r.ok);
    if (failed) throw new Error(`${failed.url}: ${failed.status}`);
    [content, words, grammar] = await Promise.all(responses.map((r) => r.json()));
  } catch (error) {
    app.replaceChildren(h("p", {}, "The lessons couldn't load. If you opened this file directly, run it through a local server: python -m http.server"));
    console.error(error);
    return;
  }
  topicById = Object.fromEntries(content.topics.map((topic) => [topic.id, topic]));
  updateMistakeCount();
  window.addEventListener("hashchange", route);
  route();
}

start();

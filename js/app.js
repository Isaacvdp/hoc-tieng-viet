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
let topicById = {};
let state = load();
let onKey = null;

// ---------- Storage ----------

function load() {
  const empty = { progress: {}, mode: "mix", topics: null };
  try {
    const saved = { ...empty, ...JSON.parse(localStorage.getItem(STORAGE_KEY)) };
    if (!MODES.some((mode) => mode.id === saved.mode)) saved.mode = "mix";
    return saved;
  } catch {
    return empty;
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
  const count = openMistakes().length;
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

function renderRule(rule) {
  return [
    rule.body.map((text) => h("p", { class: "rule-body" }, text)),
    rule.examples?.length > 0 && h("dl", { class: "examples" },
      rule.examples.map((example) => [
        h("dt", { lang: "vi" }, example.vi),
        h("dd", {}, example.en),
      ])),
  ];
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
  const rule = content.rules.find((r) => r.topics?.includes(item.topic));

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
    rule && !result.correct && h("details", { class: "rule-peek" },
      h("summary", {}, `Rule: ${rule.title}`),
      renderRule(rule)),
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

function renderLetters() {
  const rows = (letters) => letters.map((entry) =>
    h("div", { class: "letter-row" },
      h("span", { class: "letter-glyph", lang: "vi" }, entry.letter),
      h("div", {},
        h("p", {}, entry.sound),
        h("p", { class: "letter-word" }, h("b", { lang: "vi" }, entry.word), ` = ${entry.meaning}`))));

  show(
    h("h1", {}, "Letters and tones"),
    h("p", { class: "sub" }, "How each letter sounds in the north, described in English."),
    h("div", { class: "quiz-buttons" },
      h("button", { class: "btn primary", type: "button", onclick: () => startQuiz(soundQuestions()) }, "Letter sounds"),
      h("button", { class: "btn", type: "button", onclick: () => startQuiz(toneQuestions()) }, "Tones"),
      h("button", { class: "btn", type: "button", onclick: () => startQuiz(similarQuestions()) }, "Similar words")),
    h("h2", {}, "Tones"),
    h("p", { class: "group-note" }, "Six tones. The mark changes the word completely."),
    content.tones.map((tone) =>
      h("div", { class: "letter-row" },
        h("span", { class: "letter-glyph", lang: "vi" }, tone.mark),
        h("div", {},
          h("p", {}, h("b", { lang: "vi" }, tone.name), `. ${tone.how}`),
          h("p", { class: "letter-word" }, h("b", { lang: "vi" }, tone.word), ` = ${tone.meaning}`)))),
    content.letterGroups.map((group) => [
      h("h2", {}, group.title),
      group.note ? h("p", { class: "group-note" }, group.note) : null,
      rows(group.letters),
    ]),
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
          h("p", { lang: "vi" }, q.explain)),
        h("div", { class: "actions" }, nextButton));
      nextButton.focus();
    }

    const fill = h("div", { class: "progress-fill", style: `width:${(index / questions.length) * 100}%` });
    show(
      h("div", { class: "progress-row" },
        h("div", { class: "progress-track" }, fill),
        h("span", {}, `${index + 1} of ${questions.length}`),
        h("a", { href: "#/letters", class: "small" }, "End")),
      h("p", { class: "instruction" }, q.instruction),
      h("p", { class: "prompt", lang: q.promptLang }, q.prompt),
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
        h("a", { class: "btn primary as-link", href: "#/letters" }, "Back to letters")),
    );
  }

  ask();
}

// ---------- Notes ----------

function renderNotes() {
  const results = h("div", { "aria-live": "polite" });
  const search = h("input", {
    class: "answer-input", type: "search", lang: "vi", "aria-label": "Search words and sentences",
    autocomplete: "off", autocapitalize: "off", autocorrect: "off", spellcheck: "false",
    placeholder: "Search Vietnamese or English",
    oninput: () => drawResults(),
  });
  const rules = h("div", {}, content.rules.map((rule) =>
    h("section", { class: "rule" }, h("h2", {}, rule.title), renderRule(rule))));

  function drawResults() {
    const query = Check.plain(search.value.trim());
    rules.hidden = query.length > 0;
    if (!query) return results.replaceChildren();
    const seen = new Set();
    const matches = content.items.filter((item) => {
      if (seen.has(item.vi)) return false;
      const hit = Check.plain(item.vi).includes(query) || Check.plain(item.en).includes(query);
      if (hit) seen.add(item.vi);
      return hit;
    });
    results.replaceChildren(
      ...(matches.length === 0
        ? [h("p", { class: "sub search-empty" }, "Nothing in your notes matches that.")]
        : clean([
            matches.slice(0, SEARCH_LIMIT).map((item) =>
              h("div", { class: "review-item" },
                h("p", { class: "mistake-vi", lang: "vi" }, item.vi),
                h("p", { class: "mistake-en" }, item.en))),
            matches.length > SEARCH_LIMIT && h("p", { class: "sub small search-empty" }, `Showing the first ${SEARCH_LIMIT} of ${matches.length}.`),
          ])),
    );
  }

  show(
    h("h1", {}, "Notes"),
    h("p", { class: "sub" }, "The rules from your lessons, and every word and sentence in the app."),
    h("div", { class: "search" }, search),
    results,
    rules,
  );
}

// ---------- Mistakes ----------

function renderMistakes() {
  const items = openMistakes().sort((a, b) => state.progress[itemKey(b)].misses - state.progress[itemKey(a)].misses);
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
  );
}

// ---------- Routing and startup ----------

const routes = { practice: renderPractice, letters: renderLetters, notes: renderNotes, mistakes: renderMistakes };

function route() {
  const name = location.hash.replace("#/", "") || "practice";
  const render = routes[name] || renderPractice;
  document.querySelectorAll("nav a").forEach((link) => {
    if (link.dataset.route === name) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  render();
}

document.addEventListener("keydown", (event) => {
  if (onKey && !event.ctrlKey && !event.metaKey && !event.altKey) onKey(event);
});

async function start() {
  try {
    const response = await fetch("data/content.json");
    if (!response.ok) throw new Error(`content: ${response.status}`);
    content = await response.json();
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

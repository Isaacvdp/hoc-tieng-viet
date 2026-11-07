"use strict";

const SESSION_SIZE = 10;
const QUIZ_SIZE = 10;
const DAY = 24 * 60 * 60 * 1000;
const REVIEW_AFTER_DAYS = [0, 1, 3, 7, 21];
const STORAGE_KEY = "hoc-tieng-viet";

const MODES = [
  { id: "mix", label: "Mix" },
  { id: "translate", label: "Translate" },
  { id: "build", label: "Build" },
  { id: "listen", label: "Listen" },
  { id: "dictation", label: "Dictation" },
];

const KIND_LABELS = {
  order: "word order",
  missing: "missing words",
  extra: "extra words",
  spelling: "spelling",
  skipped: "didn't know",
  meaning: "meaning",
};

const PROPER_FIRST_WORDS = new Set(["Isaac", "Tết", "Na"]);

const app = document.getElementById("app");
const audio = new Audio();
let content;
let audioFiles = {};
let topicById = {};
let state = load();
let onKey = null;

// ---------- Storage ----------

function load() {
  const empty = { progress: {}, mode: "mix", topics: null, speakAnswers: true };
  try {
    return { ...empty, ...JSON.parse(localStorage.getItem(STORAGE_KEY)) };
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

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const pick = (list) => list[Math.floor(Math.random() * list.length)];

const PLAY_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11a.5.5 0 0 0 .77.42l8.5-5.5a.5.5 0 0 0 0-.84l-8.5-5.5A.5.5 0 0 0 4 2.5z"/></svg>';

function hasAudio(text) {
  return Boolean(audioFiles[text]);
}

function play(text, slow = false) {
  if (!hasAudio(text)) return;
  audio.src = `audio/${audioFiles[text]}`;
  audio.playbackRate = slow ? 0.7 : 1;
  audio.play().catch(() => {
    // Browsers may block sound until the first tap. The play button still works.
  });
}

function iconPlayButton(text, label) {
  if (!hasAudio(text)) return null;
  const button = h("button", { class: "icon-btn", type: "button", "aria-label": label || `Play ${text}`, onclick: () => play(text) });
  button.innerHTML = PLAY_ICON;
  return button;
}

function audioControls(text) {
  if (!hasAudio(text)) return h("p", { class: "sub small" }, "No audio for this one yet.");
  const normal = h("button", { class: "btn audio-btn", type: "button", onclick: () => play(text) });
  normal.innerHTML = PLAY_ICON;
  normal.append("Play");
  const slow = h("button", { class: "btn", type: "button", onclick: () => play(text, true) }, "Slow");
  return h("div", { class: "audio-row" }, normal, slow);
}

// "Tôi muốn đi **Na Uy**." becomes text with the keyword emphasised.
function withBold(text) {
  return text.split("**").map((part, i) => (i % 2 ? h("strong", {}, part) : part));
}

function allowedModes(item) {
  if (item.from) return ["translate", "build"];
  if (Check.words(item.vi).length < 3) return ["translate", "listen", "dictation"];
  return ["translate", "build", "listen", "dictation"];
}

const acceptedAnswers = (item) => [item.vi, ...(item.alt || [])];

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
    const pool = poolFor();
    startButton.disabled = pool.length === 0;
    startButton.textContent = `Start ${Math.min(SESSION_SIZE, pool.length) || ""} questions`.replace("  ", " ");
    message.textContent = pool.length === 0 ? "Pick at least one topic that works with this exercise." : "";
    message.hidden = pool.length > 0;
    for (const box of topicBoxes) box.checked = selected.has(box.value);
  }

  const modeHints = {
    mix: "A bit of everything.",
    translate: "Read the English and type the Vietnamese.",
    build: "Tap the words into the right order.",
    listen: "Hear a sentence and pick what it means.",
    dictation: "Hear a sentence and type what you heard.",
  };
  const modeHint = h("p", { class: "sub small", style: "margin-top:8px" }, modeHints[state.mode]);
  const modes = h("div", { class: "segments", role: "radiogroup", "aria-label": "Exercise" },
    MODES.map((mode) =>
      h("label", {},
        h("input", {
          type: "radio", name: "mode", value: mode.id, checked: state.mode === mode.id,
          onchange: () => { state.mode = mode.id; modeHint.textContent = modeHints[mode.id]; refresh(); },
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

  const speak = h("label", { class: "check-line" },
    h("input", {
      type: "checkbox", checked: state.speakAnswers,
      onchange: (event) => { state.speakAnswers = event.target.checked; save(); },
    }),
    "Read answers aloud");

  show(
    h("h1", {}, "Practice"),
    h("p", { class: "sub" }, "You don't need tone marks yet. The correct spelling is always shown afterwards."),
    h("h2", {}, "Exercise"),
    modes, modeHint, speak,
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
  runSession({
    queue: chooseItems(pool).map((item) => ({ item, retry: false })),
    mode,
    total: 0,
    done: 0,
    firstTryRight: 0,
    missed: [],
    pool,
  });
}

// ---------- Practice session ----------

function runSession(session) {
  session.total = session.queue.length;
  nextQuestion(session);
}

function nextQuestion(session) {
  const entry = session.queue.shift();
  if (!entry) return renderSummary(session);
  const options = allowedModes(entry.item);
  const mode = session.mode === "mix" ? pick(options) : options.includes(session.mode) ? session.mode : "translate";
  const render = { translate: askTyped, dictation: askTyped, build: askBuild, listen: askListen }[mode];
  render(session, entry, mode);
}

function progressRow(session, retry) {
  const fill = h("div", { class: "progress-fill", style: `width:${(session.done / session.total) * 100}%` });
  return h("div", { class: "progress-row" },
    h("div", { class: "progress-track", role: "progressbar", "aria-valuenow": session.done, "aria-valuemin": 0, "aria-valuemax": session.total }, fill),
    h("span", {}, retry ? "Second try" : `${session.done + 1} of ${session.total}`),
    h("button", { class: "btn link small", type: "button", style: "min-height:auto;padding:0", onclick: () => renderSummary(session) }, "End"));
}

function promptFor(item, mode) {
  if (item.from) {
    return [
      h("p", { class: "instruction" }, "Ask about the highlighted word"),
      h("p", { class: "prompt", lang: "vi" }, withBold(item.from)),
    ];
  }
  if (mode === "dictation") {
    return [h("p", { class: "instruction" }, "Type what you hear"), audioControls(item.vi)];
  }
  return [h("p", { class: "instruction" }, "In Vietnamese"), h("p", { class: "prompt" }, item.en)];
}

function askTyped(session, entry, mode) {
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
  show(progressRow(session, entry.retry), promptFor(item, mode), form);
  input.focus();
  if (mode === "dictation") play(item.vi);
}

function gradeTyped(item, typed) {
  const check = Check.checkAnswer(typed, acceptedAnswers(item), {
    tips: content.tips,
    flexiblePronouns: !topicById[item.topic].strictPronouns,
  });
  return { ...check, typed, showDiff: true };
}

function tileWords(item) {
  const list = Check.words(item.vi);
  if (!PROPER_FIRST_WORDS.has(list[0])) list[0] = list[0].toLowerCase();
  return list;
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
    item.from ? promptFor(item, "build") : [h("p", { class: "instruction" }, "Put the words in order"), h("p", { class: "prompt" }, item.en)],
    builtTray, bankTray,
    h("div", { class: "actions" }, checkButton,
      h("button", { class: "btn link", type: "button", onclick: () => finish(session, entry, gradeTyped(item, "")) }, "I don't know")),
  );
  draw();
}

function askListen(session, entry) {
  const { item } = entry;
  const others = shuffle(content.items.filter((other) => other.en !== item.en && !other.from));
  // Same-topic options are harder to tell apart, so they come first.
  const distractors = [...others.filter((o) => o.topic === item.topic), ...others.filter((o) => o.topic !== item.topic)];
  const texts = [];
  for (const other of distractors) {
    if (texts.length === 3) break;
    if (!texts.includes(other.en)) texts.push(other.en);
  }
  const options = shuffle([item.en, ...texts]);

  const buttons = options.map((text, i) =>
    h("button", {
      class: "option", type: "button",
      onclick: () => choose(i),
    }, h("span", { class: "key", "aria-hidden": "true" }, i + 1), h("span", {}, text)));

  function choose(i) {
    if (buttons[0].disabled) return;
    const correct = options[i] === item.en;
    buttons.forEach((button, b) => {
      button.disabled = true;
      if (options[b] === item.en) button.classList.add("is-right");
      else if (b === i) button.classList.add("is-wrong");
    });
    onKey = null;
    finish(session, entry, {
      correct, answer: item.vi, typed: options[i], kinds: correct ? {} : { meaning: 1 }, tips: [],
      showDiff: false, keep: true,
    });
  }

  show(
    progressRow(session, entry.retry),
    h("p", { class: "instruction" }, "What does this mean?"),
    audioControls(item.vi),
    h("div", { class: "options" }, buttons),
  );
  onKey = (event) => {
    const index = Number(event.key) - 1;
    if (index >= 0 && index < options.length) choose(index);
  };
  play(item.vi);
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
  }
  if (!result.correct && !entry.retry) session.queue.push({ item, retry: true });
  if (!entry.retry) session.done += 1;

  const next = () => nextQuestion(session);
  const nextButton = h("button", { class: "btn primary", type: "button", onclick: next },
    session.queue.length ? "Next" : "See results");
  const actions = h("div", { class: "actions" }, nextButton);

  // The checker only knows the answers in the notes, so a wrong call can be overruled.
  if (!result.correct && !result.kinds?.skipped && result.showDiff) {
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

  const answerText = result.answer;
  const lines = result.showDiff && !result.correct && !result.kinds?.skipped ? explainMistakes(result) : [];
  const notes = [...(result.tips || []), ...(item.note ? [item.note] : [])];
  const spoken = hasAudio(answerText) ? answerText : item.vi;

  const panel = h("section", { class: "feedback", "aria-live": "polite" },
    verdictFor(result),
    result.showDiff && !result.correct && !result.kinds?.skipped && [
      h("p", { class: "line-label" }, "You wrote"),
      h("p", { class: "words", lang: "vi" }, typedLine(result)),
    ],
    h("p", { class: "line-label" }, result.correct && result.showDiff ? "With marks" : "Correct answer"),
    h("div", { class: "answer-row" },
      h("p", { class: "words", lang: "vi" }, result.showDiff && !result.correct && !result.kinds?.skipped ? expectedLine(result) : answerText),
      iconPlayButton(spoken, "Play the answer")),
    (result.keep || item.from) && h("p", { class: "sub small" }, item.en),
    lines.length > 0 && h("ul", { class: "mistake-list" }, lines.map((line) => h("li", {}, line))),
    notes.length > 0 && h("div", { class: "tip" }, notes.map((note) => h("p", {}, note))),
  );

  if (result.keep) {
    // Keep the answer options on screen so the right one can be compared.
    app.append(panel, actions);
    onKey = null;
  } else {
    show(progressRow(session, entry.retry),
      item.from ? h("p", { class: "prompt", lang: "vi" }, withBold(item.from)) : h("p", { class: "prompt" }, item.en),
      panel, actions);
  }
  nextButton.focus();
  if (state.speakAnswers && !result.keep) play(spoken);
}

function renderSummary(session) {
  const answered = session.done;
  show(
    h("h1", {}, answered ? `${session.firstTryRight} of ${answered} right first time` : "Session ended"),
    session.missed.length > 0
      ? [h("h2", {}, "Worth another look"),
         session.missed.map(({ item, typed }) =>
           h("div", { class: "review-item" },
             h("div", { class: "mistake-head" },
               h("div", {},
                 h("p", { class: "mistake-vi", lang: "vi" }, item.vi),
                 h("p", { class: "mistake-en" }, item.en),
                 typed ? h("p", { class: "mistake-typed" }, "You answered: ", vi(typed)) : null),
               iconPlayButton(item.vi))))]
      : answered ? h("p", { class: "sub" }, "No mistakes in this session.") : null,
    h("div", { class: "actions" },
      h("button", { class: "btn primary", type: "button", onclick: () => startSession(session.pool, session.mode) }, "Keep going"),
      h("a", { class: "btn", href: "#/practice", style: "display:inline-flex;align-items:center;text-decoration:none;color:inherit" }, "Change topics")),
  );
}

// ---------- Letters ----------

function renderLetters() {
  const rows = (letters) => letters.map((entry) =>
    h("div", { class: "letter-row" },
      h("span", { class: "letter-glyph", lang: "vi" }, entry.letter),
      h("div", {},
        h("p", {}, entry.sound),
        h("p", { class: "letter-word" }, h("b", { lang: "vi" }, entry.word), ` = ${entry.meaning}`)),
      iconPlayButton(entry.word)));

  show(
    h("h1", {}, "Letters and tones"),
    h("p", { class: "sub" }, "Northern pronunciation. Tap play to hear each sound in a word."),
    h("div", { class: "quiz-buttons" },
      h("button", { class: "btn primary", type: "button", onclick: () => startQuiz(pairQuestions()) }, "Hear the difference"),
      h("button", { class: "btn", type: "button", onclick: () => startQuiz(toneQuestions()) }, "Tone quiz"),
      h("button", { class: "btn", type: "button", onclick: () => startQuiz(soundQuestions()) }, "Letter sounds")),
    h("h2", {}, "Tones"),
    h("p", { class: "group-note" }, "Six tones. The mark changes the word completely."),
    content.tones.map((tone) =>
      h("div", { class: "letter-row" },
        h("span", { class: "letter-glyph", lang: "vi" }, tone.mark),
        h("div", {},
          h("p", {}, h("b", { lang: "vi" }, tone.name), `. ${tone.how}`),
          h("p", { class: "letter-word" }, h("b", { lang: "vi" }, tone.word), ` = ${tone.meaning}`)),
        iconPlayButton(tone.word))),
    content.letterGroups.map((group) => [
      h("h2", {}, group.title),
      group.note ? h("p", { class: "group-note" }, group.note) : null,
      rows(group.letters),
    ]),
  );
}

function pairQuestions() {
  return shuffle(content.soundPairs).slice(0, QUIZ_SIZE).map((pair) => {
    const heard = pick([pair.a, pair.b]);
    const words = shuffle([pair.a, pair.b]);
    return {
      instruction: "Which word did you hear?", audio: heard.word, big: true,
      options: words.map((w) => w.word), right: heard.word,
      explain: `${pair.label}: ${pair.a.word} = ${pair.a.meaning}, ${pair.b.word} = ${pair.b.meaning}`,
    };
  });
}

function toneQuestions() {
  return Array.from({ length: QUIZ_SIZE }, () => {
    const family = pick(content.toneFamilies);
    const heard = pick(family);
    return {
      instruction: "Which tone did you hear?", audio: heard.word, big: true,
      options: family.map((w) => w.word), right: heard.word,
      explain: `${heard.word} = ${heard.meaning}, the ${heard.tone} tone.`,
    };
  });
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
      instruction: "Which letter makes this sound?", prompt: entry.sound, big: true,
      options: shuffle([entry, ...wrong]).map((o) => o.letter), right: entry.letter,
      explain: `${entry.letter}, as in ${entry.word} = ${entry.meaning}`, afterAudio: entry.word,
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
      h("button", { class: "option", type: "button", lang: "vi", onclick: () => choose(i) },
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
          h("div", { class: "answer-row" },
            h("p", { lang: "vi" }, q.explain),
            iconPlayButton(q.audio || q.afterAudio))),
        h("div", { class: "actions" }, nextButton));
      nextButton.focus();
      if (q.afterAudio) play(q.afterAudio);
    }

    const fill = h("div", { class: "progress-fill", style: `width:${(index / questions.length) * 100}%` });
    show(
      h("div", { class: "progress-row" },
        h("div", { class: "progress-track" }, fill),
        h("span", {}, `${index + 1} of ${questions.length}`),
        h("a", { href: "#/letters", class: "small" }, "End")),
      h("p", { class: "instruction" }, q.instruction),
      q.prompt ? h("p", { class: "prompt" }, q.prompt) : audioControls(q.audio),
      h("div", { class: "options big" }, buttons),
    );
    onKey = (event) => {
      const i = Number(event.key) - 1;
      if (i >= 0 && i < q.options.length) choose(i);
    };
    if (q.audio) play(q.audio);
  }

  function showEnd() {
    show(
      h("h1", {}, `${score} of ${questions.length} right`),
      h("div", { class: "actions" },
        h("a", { class: "btn primary", href: "#/letters", style: "display:inline-flex;align-items:center;text-decoration:none" }, "Back to letters")),
    );
  }

  ask();
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
        h("a", { class: "btn primary", href: "#/practice", style: "display:inline-flex;align-items:center;text-decoration:none" }, "Go to practice")),
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
    h("div", { style: "margin-top:16px" }, items.map((item) => {
      const p = state.progress[itemKey(item)];
      return h("div", { class: "mistake" },
        h("div", { class: "mistake-head" },
          h("div", {},
            h("p", { class: "mistake-vi", lang: "vi" }, item.vi),
            h("p", { class: "mistake-en" }, item.en),
            p.lastTyped ? h("p", { class: "mistake-typed" }, "Last answer: ", vi(p.lastTyped)) : null,
            p.misses > 1 ? h("p", { class: "mistake-typed" }, `Wrong ${p.misses} times`) : null),
          iconPlayButton(item.vi)));
    })),
  );
}

// ---------- Routing and startup ----------

const routes = { practice: renderPractice, letters: renderLetters, mistakes: renderMistakes };

function route() {
  const name = location.hash.replace("#/", "") || "practice";
  const render = routes[name] || renderPractice;
  document.querySelectorAll("nav a").forEach((link) => {
    if (link.dataset.route === name) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  audio.pause();
  render();
}

document.addEventListener("keydown", (event) => {
  if (onKey && !event.ctrlKey && !event.metaKey && !event.altKey) onKey(event);
});

async function start() {
  try {
    const [contentResponse, audioResponse] = await Promise.all([fetch("data/content.json"), fetch("data/audio.json")]);
    if (!contentResponse.ok) throw new Error(`content: ${contentResponse.status}`);
    content = await contentResponse.json();
    audioFiles = audioResponse.ok ? await audioResponse.json() : {};
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

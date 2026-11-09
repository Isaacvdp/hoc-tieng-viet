// Drawings for the Letters page: tone pitch lines, a vowel mouth map and where consonants are made.
(function (root) {
  const SVG = "http://www.w3.org/2000/svg";

  // Northern (Hanoi) pitch on a 1 (low) to 5 (high) scale, over the length of the word.
  // ngã breaks in the middle and nặng is cut off short in the throat.
  const TONE_SHAPES = {
    ngang: { segments: [[[0, 3], [1, 3]]] },
    "huyền": { segments: [[[0, 2], [1, 1]]] },
    "sắc": { segments: [[[0, 3], [1, 5]]] },
    "hỏi": { segments: [[[0, 3], [0.6, 1], [1, 2]]] },
    "ngã": { segments: [[[0, 3], [0.38, 3.5]], [[0.62, 3.6], [1, 5]]], broken: true },
    "nặng": { segments: [[[0, 2], [0.55, 1]]], stopped: true },
  };

  // Positions on the vowel map: left is the front of the mouth, top is a closed mouth.
  const VOWELS = {
    i: { x: 54, y: 36, tongue: "front", lips: "spread", mouth: "nearly closed" },
    y: { x: 54, y: 36, tongue: "front", lips: "spread", mouth: "nearly closed" },
    "ê": { x: 78, y: 86, tongue: "front", lips: "spread", mouth: "half closed" },
    e: { x: 106, y: 144, tongue: "front", lips: "spread", mouth: "half open" },
    a: { x: 170, y: 190, tongue: "middle", lips: "relaxed", mouth: "wide open", length: "long" },
    "ă": { x: 170, y: 190, tongue: "middle", lips: "relaxed", mouth: "wide open", length: "short" },
    "ư": { x: 238, y: 36, tongue: "back", lips: "spread", mouth: "nearly closed" },
    "ơ": { x: 238, y: 86, tongue: "back", lips: "relaxed", mouth: "half closed", length: "long" },
    "â": { x: 238, y: 86, tongue: "back", lips: "relaxed", mouth: "half closed", length: "short" },
    u: { x: 280, y: 36, tongue: "back", lips: "rounded", mouth: "nearly closed" },
    "ô": { x: 280, y: 86, tongue: "back", lips: "rounded", mouth: "half closed" },
    o: { x: 280, y: 144, tongue: "back", lips: "rounded", mouth: "half open" },
  };

  const MAP_LABELS = [
    { text: "i y", x: 54, y: 36 }, { text: "ê", x: 78, y: 86 }, { text: "e", x: 106, y: 144 },
    { text: "a ă", x: 170, y: 190 }, { text: "ư", x: 238, y: 36 }, { text: "ơ â", x: 238, y: 86 },
    { text: "u", x: 280, y: 36, round: true }, { text: "ô", x: 280, y: 86, round: true }, { text: "o", x: 280, y: 144, round: true },
  ];

  const PLACES = [
    { id: "lips", label: "Lips" },
    { id: "tip", label: "Tip" },
    { id: "roof", label: "Roof" },
    { id: "back", label: "Back" },
    { id: "throat", label: "Throat" },
  ];
  const PLACE_NAMES = { lips: "the lips", tip: "the tongue tip", roof: "the tongue on the roof of the mouth", back: "the back of the tongue", throat: "the throat" };

  const CONSONANTS = {
    b: { place: "lips" },
    c: { place: "back", air: "no puff of air" },
    d: { place: "tip", air: "buzzing, like z" },
    "đ": { place: "tip" },
    g: { place: "back", air: "soft and buzzing" },
    h: { place: "throat", air: "breath" },
    k: { place: "back", air: "no puff of air" },
    l: { place: "tip" },
    m: { place: "lips", air: "through the nose" },
    n: { place: "tip", air: "through the nose" },
    p: { place: "lips", air: "held, not released" },
    q: { place: "back", air: "then round the lips" },
    r: { place: "tip", air: "buzzing, like z" },
    s: { place: "tip", air: "hissing" },
    t: { place: "tip", air: "no puff of air" },
    v: { place: "lips", air: "top teeth on lower lip" },
    x: { place: "tip", air: "hissing" },
    ch: { place: "roof", air: "no puff of air" },
    tr: { place: "roof", air: "no puff of air" },
    gi: { place: "tip", air: "buzzing, like z" },
    gh: { place: "back", air: "soft and buzzing" },
    kh: { place: "back", air: "rough, scraping air" },
    ng: { place: "back", air: "through the nose" },
    ngh: { place: "back", air: "through the nose" },
    nh: { place: "roof", air: "through the nose" },
    ph: { place: "lips", air: "top teeth on lower lip" },
    th: { place: "tip", air: "a puff of air" },
  };

  function el(name, attrs = {}, ...children) {
    const node = document.createElementNS(SVG, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    node.append(...children);
    return node;
  }

  const px = (t) => 10 + t * 80;
  const py = (level) => 52 - (level - 1) * 11;

  function contour(toneName, { size = "small", label } = {}) {
    const shape = TONE_SHAPES[toneName];
    const svg = el("svg", {
      viewBox: "0 0 100 60", class: `contour contour-${size}`, role: "img",
      "aria-label": label || `Pitch line for the ${toneName} tone`,
    });
    for (let level = 1; level <= 5; level++) {
      svg.append(el("line", { x1: 6, x2: 94, y1: py(level), y2: py(level), class: level === 3 ? "contour-mid" : "contour-grid" }));
    }
    if (!shape) return svg;
    shape.segments.forEach((points) => {
      svg.append(el("polyline", { points: points.map(([t, l]) => `${px(t)},${py(l)}`).join(" "), class: "contour-line" }));
    });
    const [[t0, l0]] = shape.segments[0];
    svg.append(el("circle", { cx: px(t0), cy: py(l0), r: 3, class: "contour-start" }));

    const last = shape.segments[shape.segments.length - 1];
    const [ax, ay] = [px(last[last.length - 2][0]), py(last[last.length - 2][1])];
    const [bx, by] = [px(last[last.length - 1][0]), py(last[last.length - 1][1])];
    if (shape.stopped) {
      // A hard stop in the throat.
      svg.append(el("line", { x1: bx + 3, x2: bx + 3, y1: by - 7, y2: by + 7, class: "contour-stop" }));
    } else {
      const angle = Math.atan2(by - ay, bx - ax);
      const tip = (a, r) => `${bx + Math.cos(angle + a) * r},${by + Math.sin(angle + a) * r}`;
      svg.append(el("polygon", { points: `${tip(0, 4)} ${tip(2.5, 7)} ${tip(-2.5, 7)}`, class: "contour-arrow" }));
    }
    if (shape.broken) {
      const [gx, gy] = [px(0.5), py(3.55)];
      svg.append(el("line", { x1: gx, x2: gx, y1: gy - 6, y2: gy + 6, class: "contour-break" }));
    }
    return svg;
  }

  function vowelMap(highlight, size = "small") {
    const svg = el("svg", { viewBox: "0 0 320 222", class: `vowel-map vowel-map-${size}`, role: "img" });
    const outline = "40,16 300,16 300,206 120,206";
    svg.append(el("polygon", { points: outline, class: "vm-outline" }));
    for (const y of [66, 116, 166]) {
      const left = 40 + ((y - 16) / 190) * 80;
      svg.append(el("line", { x1: left, x2: 300, y1: y, y2: y, class: "vm-grid" }));
    }
    if (size === "large") {
      svg.setAttribute("aria-label", "Vowel map. Front vowels i, ê and e are on the left; ư, ơ and â are at the back with spread or relaxed lips; u, ô and o are at the back with rounded lips; a and ă are low with the mouth open.");
      for (const label of MAP_LABELS) {
        if (label.round) svg.append(el("circle", { cx: label.x, cy: label.y, r: 17, class: "vm-round" }));
        const text = el("text", { x: label.x, y: label.y, class: "vm-label", "text-anchor": "middle", "dominant-baseline": "central", lang: "vi" });
        text.textContent = label.text;
        svg.append(text);
      }
      return svg;
    }
    const spot = VOWELS[highlight];
    svg.setAttribute("aria-label", spot ? `Tongue ${spot.tongue}, lips ${spot.lips}, mouth ${spot.mouth}` : "Vowel map");
    if (spot) {
      if (spot.lips === "rounded") svg.append(el("circle", { cx: spot.x, cy: spot.y, r: 30, class: "vm-round-mini" }));
      svg.append(el("circle", { cx: spot.x, cy: spot.y, r: 19, class: "vm-dot" }));
    }
    return svg;
  }

  function vowelTags(letter) {
    const spot = VOWELS[letter];
    if (!spot) return null;
    return [`Tongue ${spot.tongue}`, `lips ${spot.lips}`, `mouth ${spot.mouth}`, spot.length].filter(Boolean).join(" · ");
  }

  function placeStrip(letter) {
    const info = CONSONANTS[letter];
    if (!info) return null;
    const strip = document.createElement("div");
    strip.className = "place-strip";
    strip.setAttribute("role", "img");
    strip.setAttribute("aria-label", `Made with ${PLACE_NAMES[info.place]}${info.air ? `, ${info.air}` : ""}`);
    for (const place of PLACES) {
      const cell = document.createElement("span");
      cell.className = place.id === info.place ? "place on" : "place";
      cell.textContent = place.label;
      strip.append(cell);
    }
    return strip;
  }

  const consonantAir = (letter) => CONSONANTS[letter]?.air || null;
  const isVowel = (letter) => Boolean(VOWELS[letter]);

  root.Visuals = { contour, vowelMap, vowelTags, placeStrip, consonantAir, isVowel, toneNames: Object.keys(TONE_SHAPES) };
})(this);

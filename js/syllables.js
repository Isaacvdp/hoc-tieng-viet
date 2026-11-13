// Vietnamese syllables: initial + rime + tone, the spelling rules that join them,
// and where the tone mark goes.
(function (root) {
  const INITIALS = ["", "b", "c", "ch", "d", "đ", "g", "gh", "gi", "h", "k", "kh", "l", "m", "n", "ng", "ngh", "nh", "p", "ph", "qu", "r", "s", "t", "th", "tr", "v", "x"];
  // Longest first, so "ngh" wins over "ng" and "n".
  const BY_LENGTH = [...INITIALS].filter(Boolean).sort((a, b) => b.length - a.length);

  const RIME_GROUPS = [
    { id: "vowels", label: "Single vowels", rimes: ["a", "ă", "â", "e", "ê", "i", "y", "o", "ô", "ơ", "u", "ư"] },
    { id: "pairs", label: "Vowel pairs", rimes: ["ai", "ao", "au", "ay", "âu", "ây", "eo", "êu", "ia", "iu", "oa", "oe", "oi", "ôi", "ơi", "ua", "uê", "ui", "uy", "ưa", "ưi", "ưu"] },
    { id: "triples", label: "Three vowels", rimes: ["iêu", "yêu", "oai", "oay", "uây", "uôi", "ươi", "ươu", "uya", "uyu"] },
    { id: "nasal", label: "Ending m, n, ng, nh", rimes: ["am", "an", "ang", "anh", "ăm", "ăn", "ăng", "âm", "ân", "âng", "em", "en", "eng", "êm", "ên", "ênh", "im", "in", "inh", "om", "on", "ong", "ôm", "ôn", "ông", "ơm", "ơn", "um", "un", "ung", "ưng", "iêm", "iên", "iêng", "yên", "uôn", "uông", "ươm", "ươn", "ương", "oan", "oang", "oanh", "oăn", "oăng", "uân", "uyên", "uynh"] },
    { id: "stops", label: "Ending p, t, c, ch", rimes: ["ap", "at", "ac", "ach", "ăp", "ăt", "ăc", "âp", "ât", "âc", "ep", "et", "êp", "êt", "êch", "ip", "it", "ich", "op", "ot", "oc", "ôp", "ôt", "ôc", "ơp", "ơt", "up", "ut", "uc", "ưt", "ưc", "iêp", "iêt", "iêc", "uôt", "uôc", "ươp", "ươt", "ươc", "oat", "oac", "oach", "oăc", "uât", "uyêt", "yêt", "uych"] },
  ];
  const RIMES = new Set(RIME_GROUPS.flatMap((g) => g.rimes));

  const TONES = { "": "ngang", "̀": "huyền", "́": "sắc", "̉": "hỏi", "̃": "ngã", "̣": "nặng" };
  const MARK_FOR = Object.fromEntries(Object.entries(TONES).map(([mark, name]) => [name, mark]));
  const TONE_ORDER = ["ngang", "huyền", "sắc", "hỏi", "ngã", "nặng"];
  const VOWELS = "aăâeêioôơuưy";
  const WITH_MARK = "ăâêôơư";
  const FRONT = "eêiy";

  function stripTone(syllable) {
    const decomposed = syllable.normalize("NFD");
    const mark = [...decomposed].find((c) => TONES[c] !== undefined && c !== "") || "";
    return { base: decomposed.replace(mark, "").normalize("NFC"), tone: TONES[mark] };
  }

  // "gì" is written g + ì but is the initial gi plus the rime i.
  function join(initial, rime) {
    return initial === "gi" && rime.startsWith("i") ? "g" + rime : initial + rime;
  }

  function parse(syllable) {
    const { base, tone } = stripTone(syllable.toLowerCase().normalize("NFC"));
    let initial = BY_LENGTH.find((i) => base.startsWith(i)) || "";
    let rime = base.slice(initial.length);
    if (initial === "gi" && ![...rime].some((c) => VOWELS.includes(c))) rime = "i" + rime;
    // "g" followed by "i" with nothing vowel-like after is really gi + i.
    if (!rime) return null;
    return { initial, rime, tone };
  }

  const isChecked = (rime) => /(p|t|c|ch)$/.test(rime);

  function validTone(rime, tone) {
    return !isChecked(rime) || tone === "sắc" || tone === "nặng";
  }

  // Whether this initial and rime may be written together, and why not if they can't.
  function check(initial, rime) {
    if (!RIMES.has(rime)) return { ok: false, reason: "Not a Vietnamese rime." };
    const first = rime[0];
    if ((rime === "ă" || rime === "â")) return { ok: false, reason: `${rime} never ends a syllable; it always has a letter after it, as in ăn or âm.` };
    if (["k", "gh", "ngh"].includes(initial) && !FRONT.includes(first)) {
      const plain = { k: "c", gh: "g", ngh: "ng" }[initial];
      return { ok: false, reason: `${initial} is only written before e, ê, i or y. Here it's ${plain}: ${join(plain, rime)}.` };
    }
    if (["c", "g", "ng"].includes(initial) && FRONT.includes(first)) {
      const front = { c: "k", g: "gh", ng: "ngh" }[initial];
      if (initial === "c" && first === "y") return { ok: false, reason: "c is never written before y. Use k: ky." };
      return { ok: false, reason: `Before e, ê, i and y, ${initial} is written ${front}: ${join(front, rime)}.` };
    }
    if (initial === "qu" && (first === "u" || first === "o")) return { ok: false, reason: "qu already has the w sound, so it isn't followed by u or o." };
    if (initial === "gi" && first === "y") return { ok: false, reason: "gi is not followed by y." };
    return { ok: true };
  }

  // Index (in the rime) of the vowel that carries the tone mark.
  // style "new" puts it on the second vowel of oa, oe, uy (hoà, khoẻ, thuý); "old" on the first (hòa, khỏe, thủy).
  function markIndex(rime, style = "new") {
    const chars = [...rime];
    const vowels = chars.map((c, i) => (VOWELS.includes(c) ? i : -1)).filter((i) => i >= 0);
    const marked = vowels.filter((i) => WITH_MARK.includes(chars[i]));
    if (marked.length) return marked[marked.length - 1];
    if (vowels.length === 1) return vowels[0];
    if (!VOWELS.includes(chars[chars.length - 1])) return vowels[vowels.length - 1];
    const cluster = vowels.map((i) => chars[i]).join("");
    if (["oa", "oe", "uy"].includes(cluster)) return style === "new" ? vowels[1] : vowels[0];
    if (vowels.length === 3) return vowels[1];
    return vowels[0];
  }

  function write(initial, rime, tone, style = "new") {
    const mark = MARK_FOR[tone] || "";
    if (!mark) return join(initial, rime);
    const chars = [...rime];
    const at = markIndex(rime, style);
    chars[at] = (chars[at].normalize("NFD") + mark).normalize("NFC");
    const marked = chars.join("");
    return initial === "gi" && rime.startsWith("i") ? "g" + marked : initial + marked;
  }

  // Notes on how the ending sounds in the north.
  function rimeNotes(rime) {
    const notes = [];
    if (/^(iê|ia|yê|ya)/.test(rime) || /^(iê|yê)/.test(rime)) notes.push("iê / ia / yê: say 'ee' and glide into 'uh', like 'ear'. Written ia or ya with no ending, iê or yê before one.");
    else if (/^(uô|ua)/.test(rime) && rime !== "uân") notes.push("uô / ua: 'oo' gliding into 'uh'. Written ua with no ending, uô before one.");
    else if (/^(ươ|ưa)/.test(rime)) notes.push("ươ / ưa: ư gliding into ơ. Written ưa with no ending, ươ before one.");
    if (/^(oa|oă|oe|uy|uê|uâ)/.test(rime)) notes.push("Starts with a quick w sound: oa ≈ 'wa', oe ≈ 'weh', uy ≈ 'wee', uê ≈ 'way'.");
    if (/anh$/.test(rime)) notes.push("-anh sounds like 'ayn' in the north: anh ≈ 'ayn'.");
    else if (/(ênh|inh)$/.test(rime)) notes.push("-nh after ê or i is a soft ng, said with the tongue forward.");
    if (/ach$/.test(rime)) notes.push("-ach sounds like 'ayk', short and cut off: sách ≈ 'sayk'.");
    else if (/ch$/.test(rime)) notes.push("-ch is a short k-like stop with the tongue forward.");
    if (/(ong|ông|ung|oc|ôc|uc)$/.test(rime)) notes.push("After o, ô and u, the lips close at the end: ông almost sounds like 'om' with puffed cheeks.");
    if (/(p|t|c|ch)$/.test(rime)) notes.push("The final stop is not released: close off the sound and stop, no puff of air. Only the sắc and nặng tones are possible here.");
    if (/^(ă|â)/.test(rime) || rime === "ay" || rime === "ây" || rime === "âu") notes.push("ă and â are short vowels; keep them quick.");
    return notes;
  }

  const api = { INITIALS, RIME_GROUPS, RIMES, TONE_ORDER, parse, check, validTone, isChecked, markIndex, write, join, stripTone, rimeNotes };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Syllables = api;
})(this);

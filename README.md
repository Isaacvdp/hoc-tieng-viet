# Học tiếng Việt

A small personal app for learning northern Vietnamese from my own lesson notes. It is written only: reading and typing, with no sound. Speaking practice happens elsewhere.

Live at https://isaacvdp.github.io/hoc-tieng-viet/

## Pages

- **Practice:** sentences from my lessons in six exercises (Translate, Build, Fill in, Meaning, Right sentence, Right marks). Typing is checked without tone marks; the correct spelling is always shown.
- **Words:** the 1000 most common words as spaced-repetition cards, a few new ones a day, with tone lines and example sentences. Exports to Anki.
- **Sounds:** tones as pitch lines, the vowel map, consonants, vowel groups, northern endings, and a syllable builder that shows spelling rules and where the tone mark goes.
- **Grammar:** 96 A1–A2 points with patterns, examples, common mistakes and practice. Search works without marks.
- **Mistakes:** wrong answers from Practice and Grammar, until they're answered right.

## Run it

It is a static site with no build step:

```
python -m http.server
```

Then open http://localhost:8000. Progress is saved in the browser, separately on each device.

## Content

- `data/content.json`: lesson sentences, letters and tones. Each sentence needs `topic`, `vi` and `en`; `alt` and `note` are optional.
- `data/words.json`: the 1000-word frequency list.
- `data/grammar.json`: the grammar guide.

Check everything after editing:

```
node tests/check.test.js
node tests/srs.test.js
node tests/grammar.test.js
node tests/syllables.test.js
```

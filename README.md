# Học tiếng Việt

A small personal app for learning northern Vietnamese from my own lesson notes. It is written only: reading and typing, with no sound. Speaking practice happens elsewhere.

Live at https://isaacvdp.github.io/hoc-tieng-viet/

## Exercises

- **Translate:** read the English and type the Vietnamese.
- **Build:** tap the words into the right order.
- **Fill in:** pick the word that completes the sentence.
- **Meaning:** read the Vietnamese and pick what it means.
- **Right sentence:** pick the sentence with the correct word order.
- **Right marks:** pick the correct spelling. Only appears when chosen, not in Mix.

Other pages:

- **Letters:** the alphabet, tones and letter combinations described in English, with three quizzes.
- **Notes:** the rules from my lessons, and a search across every word and sentence.
- **Mistakes:** everything I got wrong stays listed until I get it right twice in a row.

Typing is checked without tone or vowel marks, and the correct spelling is always shown afterwards.

## Run it

It is a static site with no build step:

```
python -m http.server
```

Then open http://localhost:8000. Progress is saved in the browser, separately on each device.

## Add lessons

Add sentences to `data/content.json`. Each one needs `topic`, `vi` and `en`. `alt` (other accepted answers) and `note` (shown with the answer) are optional. Rules for the Notes page go under `rules`.

Then check the content and the exercises:

```
node tests/check.test.js
```

# Học tiếng Việt

A small personal app for learning northern Vietnamese from my own lesson notes. It covers reading, listening and typing. Speaking practice happens elsewhere.

## Exercises

- **Translate:** read the English and type the Vietnamese.
- **Build:** tap the words into the right order.
- **Listen:** hear a sentence and pick what it means.
- **Dictation:** hear a sentence and type it.
- **Letters:** the alphabet, tones and letter combinations with audio, plus three listening and sound quizzes.
- **Mistakes:** everything you got wrong stays listed until you get it right twice in a row.

Typing is checked without tone or vowel marks, and the correct spelling is always shown afterwards.

## Run it

It is a static site with no build step:

```
python -m http.server
```

Then open http://localhost:8000. Progress is saved in the browser, separately on each device.

## Add lessons

1. Add sentences to `data/content.json`. Each one needs `topic`, `vi` and `en`. `alt` (other accepted answers) and `note` (shown with the answer) are optional.
2. Generate audio for the new sentences:

   ```
   pip install edge-tts
   python tools/generate_audio.py
   ```

3. Check the content and the answer checker:

   ```
   node tests/check.test.js
   ```

The audio is Microsoft's `vi-VN-HoaiMyNeural` voice through edge-tts. The text of each new sentence is sent to Microsoft to generate its clip.

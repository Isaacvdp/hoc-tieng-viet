# Design

A polished, familiar study app in the spirit of modern learning apps. It has no theme of its own, and the Vietnamese being learned is always the most prominent thing on screen.

## Structure

- **Today** is home: a plan for the day (words due, mistakes to fix, practice, the next grammar point, a tone warm-up), each row with one action, then progress.
- **Five tabs:** Today · Practice · Words · Sounds · Grammar. On phones (≤720px) they sit in a fixed bottom bar with icons above labels; on desktop they sit in the sticky header. Mistakes lives under Today, and its count is a badge on the Today tab.
- **Sub-tabs** split long pages: Words (Study / All 1000 words), Sounds (Tones / Letters / Combinations / Syllables).
- **Practice** leads with one start card; exercise and topic choices fold away under "Change exercise and topics".

## Foundations

- **Type:** the system font stack, so Vietnamese marks render with each device's native font. h1 28px/700 (24px on phones), h2 18px/650, body 16px. Inputs are at least 16px so phones don't zoom.
- **Colour:** a cool grey page (`--bg`), white cards (`--card`), one indigo accent (`--accent`) for actions, the active tab and selection, with `--accent-soft` for the start cards and icon tiles. Green, red and amber only carry feedback. All colours are tokens on `:root` in `styles.css`, redefined for dark mode.
- **Surfaces:** cards have a 12px radius, a 1px line and a soft offset shadow. Lists inside cards carry dividers between rows, not around them.
- **Icons:** drawn inline SVG, 1.8 stroke, round caps, the same set in the tab bar and the Today plan.
- **Layout:** one centred column, 760px at most, 16px gutter. Touch targets are at least 40px; buttons 44px.

## Feedback marking

| Mark | Meaning |
| --- | --- |
| Strikethrough in red | A word you typed that isn't needed |
| Red highlight | A word you left out |
| Amber highlight | A spelling slip, or a word in the wrong place |

Marks are never highlighted as errors while the app is checking without them.

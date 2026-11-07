# Design

A plain, familiar study tool. It deliberately has no theme of its own, and the words being learned are the most prominent thing on screen.

## Foundations

- **Type:** the system font stack, so Vietnamese marks render with each device's native font. Prompts are 24px at weight 600, body text is 16px, and inputs are at least 16px so phones don't zoom in.
- **Colour:** neutral surfaces plus one blue accent (`--accent`) used for actions, focus and selection. Green, red and amber only ever carry feedback: right, wrong, and spelling or word order.
- **Light and dark:** follows the system setting. All colours are tokens on `:root` in `styles.css`.
- **Layout:** one centred column, 680px at most, with a 16px gutter. Below 480px the nav moves under the app name.
- **Touch:** buttons are at least 44px tall. Option rows are 48px.

## Feedback marking

| Mark | Meaning |
| --- | --- |
| Strikethrough in red | A word you typed that isn't needed |
| Red highlight | A word you left out |
| Amber highlight | A spelling slip, or a word in the wrong place |

Marks are never highlighted as errors while the app is checking without them.

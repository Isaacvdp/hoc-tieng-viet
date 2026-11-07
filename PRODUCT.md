# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Delegated: static HTML, CSS and vanilla JS with no build step, hosted on GitHub Pages.

## Users

One person: Isaac, a beginner in Vietnamese who has had some lessons and speaks with his Vietnamese wife. He studies on both laptop and phone, in short sessions.

## Product Purpose

A personal study app for northern (Hanoi) Vietnamese, built from his own lesson notes. It helps him learn the letters and tones, and get sentences right in writing, with clear feedback on what was wrong. Success means he comes back to it and his recurring mistakes go away.

## Positioning

The content is his own lessons, and the feedback explains the mistake (missing word, wrong order, spelling, grammar rule from his notes) instead of only marking right or wrong.

## Operating Context

Speaking practice happens privately with his wife, so the app does not record or grade speech. The app is written only: reading and typing.

## Capabilities and Constraints

- Northern dialect only: sound descriptions, vocabulary and audio follow Hanoi usage.
- Typing is checked without tone or vowel marks for now. He is not typing with marks yet, so the app must not correct them, but it always shows the correct marked spelling.
- Progress is stored on the device, with no accounts or backend.
- No audio. Microsoft's neural voices were tried and removed: a native speaker found the ngã and nặng tones identical, and bánh was mispronounced. The generator and clips are in the git history (commit 4de7e3b).

## Evidence on Hand

Lesson notes in `data/content.json`. Nothing beyond these notes and basic alphabet facts should be presented as coming from his lessons.

## Product Principles

- Simple and clean over feature-rich. One person, no gamification.
- Every wrong answer teaches something specific.
- A strict checker can be wrong, so he can always overrule it.

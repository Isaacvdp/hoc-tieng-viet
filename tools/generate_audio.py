"""Generates one MP3 per Vietnamese word or sentence in data/content.json.

Existing files are kept, so rerun this after adding content.

    pip install edge-tts
    python tools/generate_audio.py
"""

import asyncio
import hashlib
import json
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent.parent
VOICE = "vi-VN-HoaiMyNeural"
RATE = "-10%"
PARALLEL = 4


def collect_texts(content):
    texts = {item["vi"] for item in content["items"]}
    for group in content["letterGroups"]:
        texts.update(letter["word"] for letter in group["letters"])
    texts.update(tone["word"] for tone in content["tones"])
    for family in content["toneFamilies"]:
        texts.update(entry["word"] for entry in family)
    for pair in content["soundPairs"]:
        texts.update((pair["a"]["word"], pair["b"]["word"]))
    return sorted(texts)


def file_name(text):
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:12] + ".mp3"


async def generate(text, limit, audio_dir):
    target = audio_dir / file_name(text)
    if target.exists():
        return
    async with limit:
        await edge_tts.Communicate(text, VOICE, rate=RATE).save(str(target))
    print(text)


async def main():
    content = json.loads((ROOT / "data" / "content.json").read_text(encoding="utf-8"))
    audio_dir = ROOT / "audio"
    audio_dir.mkdir(exist_ok=True)
    texts = collect_texts(content)
    limit = asyncio.Semaphore(PARALLEL)
    await asyncio.gather(*(generate(text, limit, audio_dir) for text in texts))

    manifest = {text: file_name(text) for text in texts}
    (ROOT / "data" / "audio.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=0), encoding="utf-8"
    )

    keep = set(manifest.values())
    for stale in audio_dir.glob("*.mp3"):
        if stale.name not in keep:
            stale.unlink()
    print(f"{len(texts)} clips in {audio_dir}")


if __name__ == "__main__":
    asyncio.run(main())

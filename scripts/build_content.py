#!/usr/bin/env python3
"""Build server-only JSON from the editorial Markdown, without a database."""
import json
from pathlib import Path

from card_content import CATS, INTERP, parse

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "content" / "server" / "donald.json"


def main():
    version, cards = parse((ROOT / "docs/DONALD_DECK_CANDIDATES.md").read_text())
    numbers = [c["n"] for c in cards]
    if not cards or len(numbers) != len(set(numbers)):
        raise ValueError("Expected nonempty cards with unique card numbers")
    for card in cards:
        if not card["front"] or any(not 1 <= v <= 100 for v in card["scores"].values()):
            raise ValueError(f"Invalid text or scores for card {card['n']}")
        card["id"] = f"donald-{card['n']:02d}"
        card["speaker"] = "Donald Trump"
    payload = {
        "schema_version": 1,
        "deck": {"slug": "donald", "name": "The Donald Deck", "document_version": version},
        "publication_status": "draft",
        "categories": [{"slug": c.lower(), "name": c, "interpretation": INTERP[c]} for c in CATS],
        "cards": cards,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    print(f"Built {OUT.relative_to(ROOT)}: {len(cards)} cards, {sum(c['status'] == 'hold' for c in cards)} on hold")


if __name__ == "__main__":
    main()

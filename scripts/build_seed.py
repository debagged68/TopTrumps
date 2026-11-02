#!/usr/bin/env python3
"""Generate supabase/seed.sql from docs/DONALD_DECK_CANDIDATES.md.

Usage: python3 scripts/build_seed.py
The markdown stays the editorial source of truth; re-run this after editing it.
Fails loudly if the per-card scores disagree with the score matrix.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOC = ROOT / "docs" / "DONALD_DECK_CANDIDATES.md"
OUT = ROOT / "supabase" / "seed.sql"

CATS = ["Pride", "Greed", "Lust", "Envy", "Wrath", "Stupidity"]
INTERP = {
    "Pride": "Boasting, vanity, self-importance or personal infallibility.",
    "Greed": "Desire for wealth, possessions or advantage; absorbs Gluttony (excessive acquisition or consumption).",
    "Lust": "Desire for power, office, control or attraction; the reading must be explicit.",
    "Envy": "Resentment of another person's success, popularity or status; needs an expressed comparison.",
    "Wrath": "Anger, threats, revenge or expressed contempt.",
    "Stupidity": "Absurd claims, poor reasoning or lazy thinking; physical inactivity alone does not count.",
}
# From the "Publication holds" paragraph plus the (HOLD) headings in the document.
HOLDS = {11, 19, 27, 36, 40, 41, 42, 44}


def q(s):
    """SQL string literal via dollar-quoting; NULL for None."""
    if s is None:
        return "null"
    tag = "q"
    while f"${tag}$" in s:
        tag += "x"
    return f"${tag}${s}${tag}$"


def parse(text):
    m = re.search(r"^Version (\S+)", text, re.M)
    version = m.group(1) if m else None

    # Score matrix, used only to cross-check the per-card lines.
    matrix = {}
    for row in re.finditer(r"^\| Donald #(\d+)[^|]*\|((?:[^|]*\|){6})\s*$", text, re.M):
        matrix[int(row.group(1))] = [int(x) for x in re.findall(r"\d+", row.group(2))]

    cards = []
    sections = re.split(r"^(?=### Donald #)", text, flags=re.M)
    for sec in sections:
        h = re.match(r"### Donald #(\d+)([^\n]*)", sec)
        if not h:
            continue
        # Cut at the next level-2 heading so the last card does not swallow the tail of the file.
        sec = re.split(r"^## ", sec, maxsplit=1, flags=re.M)[0].rstrip() + "\n"
        n = int(h.group(1))
        lines = sec.splitlines()

        # Quote(s) and the italic attribution note directly under them.
        quotes, notes, cur = [], [], []
        for ln in lines:
            if ln.startswith("> "):
                cur.append(ln[2:])
            else:
                if cur:
                    quotes.append(" ".join(cur))
                    cur = []
                if re.match(r"^\*[^*].*[^*]\*$", ln.strip()):
                    notes.append(ln.strip().strip("*"))
        if cur:
            quotes.append(" ".join(cur))
        front = "\n\n".join(quotes)

        who = re.search(r"^\*\*Who it is about:\*\*\s*(.+)$", sec, re.M)
        if who:
            notes.append("Who it is about: " + who.group(1).strip())

        sm = re.search(r"Hidden scores[^:\n]*:\*\*\s*(.+)", sec)
        scores = {c: int(v) for c, v in re.findall(r"(" + "|".join(CATS) + r") (\d+)", sm.group(1))}
        if list(scores) != CATS:
            sys.exit(f"#{n}: expected six scores in order, got {scores}")
        if n in matrix and [scores[c] for c in CATS] != matrix[n]:
            sys.exit(f"#{n}: card scores {list(scores.values())} != matrix {matrix[n]}")

        # Reveal overlaps: "- Category: text" bullets up to the next bold heading.
        ov = re.search(r"\*\*Reveal overlaps:\*\*\n(.*?)(?=\n\*\*|\Z)", sec, re.S)
        rationale, other, desc = {}, [], []
        for b in re.findall(r"^- (.+)$", ov.group(1) if ov else "", re.M):
            desc.append(b)
            mm = re.match(r"(" + "|".join(CATS) + r")\b[^:]*:\s*(.+)$", b)
            if mm and mm.group(1) not in rationale:
                rationale[mm.group(1)] = mm.group(2)
            else:
                other.append(b)

        # Source record bullets: "- **Label:** value" (possibly several records, e.g. paired card #27).
        fields = {}
        for label, val in re.findall(r"^- \*\*([^*]+?):\*\*\s*(.+)$", sec, re.M):
            fields[label] = (fields[label] + "\n" + val) if label in fields else val

        links, seen = [], set()
        for label, val in re.findall(r"^- \*\*([^*]+?):\*\*\s*(.+)$", sec, re.M):
            for title, url in re.findall(r"\[([^\]]+)\]\((https?://[^)\s]+)\)", val):
                if url not in seen:
                    seen.add(url)
                    links.append((title, url, label))

        def pick(*names):
            vals = [fields.pop(k) for k in names if k in fields]
            return "\n".join(vals) if vals else None

        setting = pick("Date / original setting")
        evidence = pick("Evidence type")
        verif = pick("Verification / wording notes", "Verification / context notes")
        release = pick("Release status")
        attrib_bullet = pick("Attribution")
        attribution = "\n".join(x for x in [attrib_bullet] + notes if x) or None
        if not attribution and setting:
            # Older cards record attribution only as date/setting; the speaker column carries the name.
            attribution = f"Donald Trump. {setting}"
        fields.pop("Source links", None)

        status = "hold" if (n in HOLDS or "(HOLD)" in h.group(2)) else "candidate"
        cards.append(dict(
            n=n, label=f"Donald #{n:02d}", status=status, front=front, attribution=attribution,
            description="\n".join(desc) or None, reveal_notes="\n".join(other) or None,
            setting=setting, evidence=evidence, verif=verif, release=release, extra=fields,
            scores=scores, rationale=rationale, links=links, md=sec.strip(),
        ))
    return version, cards


def jsonb(d):
    import json
    return q(json.dumps(d, ensure_ascii=False)) + "::jsonb"


def main():
    version, cards = parse(DOC.read_text(encoding="utf-8"))
    out = [
        "-- GENERATED by scripts/build_seed.py from docs/DONALD_DECK_CANDIDATES.md. Do not edit by hand.",
        "-- Idempotent: safe to re-run; cards are upserted on (deck, card_number).",
        "begin;",
        f"insert into public.decks (slug, name, description, document_version) values "
        f"('donald', 'The Donald Deck', 'Six-category candidate cards. Editorial working draft, not publication-ready.', {q(version)}) "
        f"on conflict (slug) do update set document_version = excluded.document_version;",
    ]
    for i, c in enumerate(CATS, 1):
        out.append(
            f"insert into public.categories (slug, name, sort_order, interpretation) values "
            f"({q(c.lower())}, {q(c)}, {i}, {q(INTERP[c])}) "
            f"on conflict (slug) do update set interpretation = excluded.interpretation;")
    for c in cards:
        deck = "(select id from public.decks where slug = 'donald')"
        out.append(
            "insert into public.cards (deck_id, card_number, label, status, front_text, attribution, description, "
            "reveal_notes, setting, evidence_type, verification_notes, release_status, extra_source_fields, source_markdown) values ("
            f"{deck}, {c['n']}, {q(c['label'])}, '{c['status']}', {q(c['front'])}, {q(c['attribution'])}, {q(c['description'])}, "
            f"{q(c['reveal_notes'])}, {q(c['setting'])}, {q(c['evidence'])}, {q(c['verif'])}, {q(c['release'])}, "
            f"{jsonb(c['extra'])}, {q(c['md'])}) "
            "on conflict (deck_id, card_number) do update set label = excluded.label, status = excluded.status, "
            "front_text = excluded.front_text, attribution = excluded.attribution, description = excluded.description, "
            "reveal_notes = excluded.reveal_notes, setting = excluded.setting, evidence_type = excluded.evidence_type, "
            "verification_notes = excluded.verification_notes, release_status = excluded.release_status, "
            "extra_source_fields = excluded.extra_source_fields, source_markdown = excluded.source_markdown;")
        cid = f"(select id from public.cards where deck_id = {deck} and card_number = {c['n']})"
        for cat in CATS:
            out.append(
                f"insert into public.card_scores (card_id, category, score, rationale) values "
                f"({cid}, {q(cat.lower())}, {c['scores'][cat]}, {q(c['rationale'].get(cat))}) "
                f"on conflict (card_id, category) do update set score = excluded.score, rationale = excluded.rationale;")
        for k, (title, url, role) in enumerate(c["links"]):
            out.append(
                f"insert into public.card_sources (card_id, sort_order, title, url, role) values "
                f"({cid}, {k}, {q(title)}, {q(url)}, {q(role)}) "
                f"on conflict (card_id, url) do update set title = excluded.title, role = excluded.role, sort_order = excluded.sort_order;")
    out.append("commit;")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(out) + "\n", encoding="utf-8")

    holds = sum(c["status"] == "hold" for c in cards)
    print(f"version {version}: {len(cards)} cards ({holds} hold), "
          f"{sum(len(c['links']) for c in cards)} source links, "
          f"{sum(1 for c in cards if not c['attribution'])} without an attribution note")
    print(f"wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

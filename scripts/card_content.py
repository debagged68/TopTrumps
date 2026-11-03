"""Shared Markdown parser for JSON content and optional SQL export."""
import re
import sys

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
        if not sm:
            sys.exit(f"#{n}: missing a 'Hidden scores:' line")
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
        bullets = re.findall(r"^- \*\*([^*]+?):\*\*\s*(.+)$", sec, re.M)
        fields = {}
        for label, val in bullets:
            fields[label] = (fields[label] + "\n" + val) if label in fields else val

        links, seen = [], set()
        for label, val in bullets:
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


"""Grounding check: every number in the AI text must come from the data we gave it."""
from __future__ import annotations

import json
import re
import unicodedata

NUM = re.compile(r"(?<![\w.])\d+(?:[.,]\d+)*")
# Numbers that are allowed without appearing in the data (list markers, clock words, helplines).
ALWAYS_OK = {"1", "2", "3", "4", "5", "112", "1533"}


def _norm(tok: str) -> str:
    # Kannada (೦-೯) and other Unicode digits -> ASCII
    t = "".join(str(unicodedata.digit(ch)) if ch.isdigit() else ch for ch in tok).replace(",", "")
    if "." in t:
        t = t.rstrip("0").rstrip(".")
    return t


def numbers_in(text: str) -> set[str]:
    return {_norm(m) for m in NUM.findall(text)}


def check(output_texts: list[str], source: dict) -> dict:
    allowed = numbers_in(json.dumps(source, ensure_ascii=False)) | ALWAYS_OK
    found: set[str] = set()
    for t in output_texts:
        found |= numbers_in(t)
    unverified = sorted(found - allowed, key=lambda s: float(s) if s.replace(".", "").isdigit() else 0)
    return {"numbers_checked": len(found), "unverified": unverified, "ok": not unverified}

#!/usr/bin/env python3
# scripts/extract-transcripts.py — pdfminer.six fallback for transcripts pdf2json mangles.
# Usage: python scripts/extract-transcripts.py <input.pdf>
# Prints extracted text to stdout (UTF-8, handles ₹ and other Unicode chars).

import sys
import io
from pdfminer.high_level import extract_text

if len(sys.argv) != 2:
    print("usage: extract-transcripts.py <pdf>", file=sys.stderr)
    sys.exit(2)

# Force stdout to UTF-8 so ₹ and other non-cp1252 chars don't crash on Windows
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

print(extract_text(sys.argv[1]))

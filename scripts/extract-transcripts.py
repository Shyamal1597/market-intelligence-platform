#!/usr/bin/env python3
# scripts/extract-transcripts.py — pdfminer.six fallback for transcripts pdf2json mangles.
# Usage: python scripts/extract-transcripts.py <input.pdf>
# Prints extracted text to stdout.

import sys
from pdfminer.high_level import extract_text

if len(sys.argv) != 2:
    print("usage: extract-transcripts.py <pdf>", file=sys.stderr)
    sys.exit(2)

print(extract_text(sys.argv[1]))

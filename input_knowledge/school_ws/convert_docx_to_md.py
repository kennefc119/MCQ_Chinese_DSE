"""
Convert all .docx files in 'original word doc' folder to .md files.
Output is placed in the parent 'school_ws' directory.
Run: python convert_docx_to_md.py
"""

import os
import sys
import mammoth
import markdownify

SRC_DIR = os.path.join(os.path.dirname(__file__), "original word doc")
OUT_DIR = os.path.dirname(__file__)


def convert_docx_to_md(docx_path: str, md_path: str) -> None:
    with open(docx_path, "rb") as f:
        result = mammoth.convert_to_html(f)
    html = result.value
    md = markdownify.markdownify(html, heading_style="ATX", bullets="-")
    # Collapse excessive blank lines (mammoth can produce many)
    lines = md.splitlines()
    cleaned: list[str] = []
    blank_count = 0
    for line in lines:
        if line.strip() == "":
            blank_count += 1
            if blank_count <= 2:
                cleaned.append(line)
        else:
            blank_count = 0
            cleaned.append(line)
    with open(md_path, "w", encoding="utf-8") as f:
        f.write("\n".join(cleaned))


def main() -> None:
    if not os.path.isdir(SRC_DIR):
        print(f"Source directory not found: {SRC_DIR}")
        sys.exit(1)

    docx_files = [f for f in os.listdir(SRC_DIR) if f.lower().endswith(".docx")]
    if not docx_files:
        print("No .docx files found.")
        return

    print(f"Found {len(docx_files)} file(s). Converting...")
    success, failed = 0, 0

    for filename in sorted(docx_files):
        stem = os.path.splitext(filename)[0]
        src = os.path.join(SRC_DIR, filename)
        dst = os.path.join(OUT_DIR, stem + ".md")
        try:
            convert_docx_to_md(src, dst)
            print(f"  ✓  {filename}  →  {stem}.md")
            success += 1
        except Exception as e:
            print(f"  ✗  {filename}  ERROR: {e}")
            failed += 1

    print(f"\nDone: {success} converted, {failed} failed.")


if __name__ == "__main__":
    main()

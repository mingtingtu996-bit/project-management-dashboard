from __future__ import annotations

import sys
from pathlib import Path

import win32com.client  # type: ignore
from pdf2image import convert_from_path


def main() -> None:
    if len(sys.argv) < 3:
        raise SystemExit("usage: render_docx_with_word_com.py input.docx output_dir")

    docx_path = Path(sys.argv[1]).resolve()
    out_dir = Path(sys.argv[2]).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    pdf_path = out_dir / (docx_path.stem + ".pdf")

    word = win32com.client.DispatchEx("Word.Application")
    word.Visible = False
    word.DisplayAlerts = 0
    try:
        doc = word.Documents.Open(str(docx_path), ReadOnly=True)
        try:
            doc.ExportAsFixedFormat(
                OutputFileName=str(pdf_path),
                ExportFormat=17,  # wdExportFormatPDF
                OpenAfterExport=False,
                OptimizeFor=0,
                Range=0,
                Item=0,
                IncludeDocProps=True,
                KeepIRM=True,
                CreateBookmarks=1,
                DocStructureTags=True,
                BitmapMissingFonts=True,
                UseISO19005_1=False,
            )
        finally:
            doc.Close(False)
    finally:
        word.Quit()

    pages = convert_from_path(str(pdf_path), dpi=140)
    for idx, page in enumerate(pages, start=1):
        page.save(out_dir / f"page-{idx}.png", "PNG")
    print(pdf_path)
    print(f"pages={len(pages)}")


if __name__ == "__main__":
    main()

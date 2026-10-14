"""One isolated conversion per process: native PDF libraries never share threads."""
import contextlib
import json
from pathlib import Path
import subprocess
import sys
import time
import zipfile


class ConversionError(Exception):
    def __init__(self, status, detail):
        self.status = status
        self.detail = detail
        super().__init__(detail)


NO_TEXT = (
    "這份 PDF 沒有可擷取的文字，內容可能是掃描圖片或已轉成輪廓的字形。"
    "目前 Word／Excel 轉換不支援 OCR，請使用保留文字的原始 PDF，或先進行 OCR。"
)


def convert(kind, source, directory, page=None, level="ebook"):
    import fitz

    directory = Path(directory)
    source = str(source)
    try:
        pdf = fitz.open(source)
    except Exception:
        raise ConversionError(400, "無法讀取 PDF，請確認檔案完整且格式正確")
    with pdf:
        if pdf.needs_pass:
            raise ConversionError(400, "PDF 有密碼保護，請先解鎖")
        if not pdf.page_count:
            raise ConversionError(400, "PDF 沒有頁面")
        pages = pdf.page_count
        text_pages = None
        if kind in ("docx", "xlsx"):
            text_pages = [i for i in range(pages) if pdf[i].get_text("text").strip()]
            if not text_pages:
                raise ConversionError(422, NO_TEXT)
        if kind == "svg":
            if page is not None and not 1 <= page <= pages:
                raise ConversionError(400, f"頁碼 {page} 超出範圍（共 {pages} 頁）")
            if page is not None:
                output = directory / "converted.svg"
                output.write_text(pdf[page - 1].get_svg_image(text_as_path=True), encoding="utf-8")
                return {"filename": output.name, "media_type": "image/svg+xml", "pages": pages}
            output = directory / "pages-svg.zip"
            # Open the PDF only once, write each page directly into an on-disk ZIP.
            with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED, compresslevel=1) as archive:
                for i in range(pages):
                    archive.writestr(f"page-{i + 1:03d}.svg", pdf[i].get_svg_image(text_as_path=True))
            return {"filename": output.name, "media_type": "application/zip", "pages": pages}

    if kind == "docx":
        from pdf2docx import Converter

        output = directory / "converted.docx"
        converter = Converter(source)
        try:
            converter.convert(str(output), multi_processing=False)
        finally:
            converter.close()
        return {
            "filename": output.name,
            "media_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "pages": pages,
        }
    if kind == "xlsx":
        import pdfplumber
        from openpyxl import Workbook

        workbook = Workbook(write_only=True)
        sheets = 0
        with pdfplumber.open(source) as pdf:
            # Pages without text cannot contribute editable table cells.
            for index in text_pages:
                pdf_page = pdf.pages[index]
                try:
                    for number, table in enumerate(pdf_page.extract_tables(), 1):
                        if not any(cell and cell.strip() for row in table for cell in row):
                            continue
                        sheet = workbook.create_sheet(f"P{index + 1}-{number}")
                        for row in table:
                            sheet.append(["" if cell is None else cell for cell in row])
                        sheets += 1
                finally:
                    pdf_page.close()
        if not sheets:
            raise ConversionError(422, "沒有偵測到含文字的表格，請使用有明確表格線的 PDF")
        output = directory / "converted.xlsx"
        workbook.save(output)
        return {
            "filename": output.name,
            "media_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "pages": pages,
        }
    if kind == "compress":
        if level not in ("screen", "ebook", "printer"):
            raise ConversionError(400, "level 必須是 screen / ebook / printer 其中之一")
        output = directory / "compressed.pdf"
        try:
            result = subprocess.run(
                ["gs", "-sDEVICE=pdfwrite", "-dCompatibilityLevel=1.4",
                 f"-dPDFSETTINGS=/{level}", "-dNOPAUSE", "-dQUIET", "-dBATCH",
                 f"-sOutputFile={output}", source], capture_output=True, text=True, timeout=120,
            )
        except FileNotFoundError:
            raise ConversionError(500, "系統缺少 Ghostscript")
        except subprocess.TimeoutExpired:
            raise ConversionError(504, "壓縮超過 120 秒，請減少頁數或檔案大小")
        if result.returncode or not output.exists() or not output.stat().st_size:
            raise ConversionError(500, "Ghostscript 壓縮失敗，請確認 PDF 可以正常開啟")
        return {"filename": output.name, "media_type": "application/pdf", "pages": pages,
                "headers": {"X-Original-Size": str(Path(source).stat().st_size),
                            "X-Compressed-Size": str(output.stat().st_size)}}
    raise ConversionError(400, "不支援的轉換功能")


def main():
    started = time.perf_counter()
    try:
        # pdf2docx and other libraries may print; reserve stdout for the protocol.
        with contextlib.redirect_stdout(sys.stderr):
            result = convert(**json.loads(sys.argv[1]))
        result["seconds"] = round(time.perf_counter() - started, 3)
    except ConversionError as error:
        result = {"status": error.status, "detail": error.detail}
    except Exception:
        import traceback
        traceback.print_exc(file=sys.stderr)
        result = {"status": 500, "detail": "轉換失敗，請確認 PDF 格式或改用較小的檔案"}
    print(json.dumps(result, ensure_ascii=True))


if __name__ == "__main__":
    main()

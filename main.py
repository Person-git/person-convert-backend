"""
博申轉檔平台 - 後端服務 (Render 部署用)
負責前端無法用純 JS 處理的重量級轉檔功能:
  - PDF -> Word (.docx)          使用 pdf2docx 還原版面
  - PDF -> Excel (.xlsx)         使用 pdfplumber 擷取表格,效果依原始 PDF 表格結構而定
  - PDF -> SVG (向量圖,可全部頁或單頁)  使用系統的 mutool(見 Dockerfile 安裝 mupdf-tools)

之後要加新功能,依樣式加一個 /convert/xxx 端點即可。
"""

import io
import os
import shutil
import subprocess
import tempfile
import uuid
import zipfile

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse

app = FastAPI(title="博申轉檔平台 API", version="0.2.0")

# 開發階段先全開,正式上線建議改成你的 Cloudflare Pages 網域,例如:
# allow_origins=["https://convert-bench.pages.dev"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_FILE_SIZE_MB = 25


def _check_pdf(file: UploadFile):
    if file.content_type != "application/pdf":
        raise HTTPException(400, "只接受 PDF 檔案")


def _save_upload(file: UploadFile, dest_dir: str) -> str:
    path = os.path.join(dest_dir, f"{uuid.uuid4().hex}.pdf")
    with open(path, "wb") as f:
        content = file.file.read()
        if len(content) > MAX_FILE_SIZE_MB * 1024 * 1024:
            raise HTTPException(413, f"檔案超過 {MAX_FILE_SIZE_MB}MB 限制")
        f.write(content)
    return path


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/debug/mutool")
def debug_mutool():
    """暫時性除錯端點:檢查 mutool 是否存在、PATH 設定、能否實際執行。確認問題後可以移除。"""
    result = {"PATH": os.environ.get("PATH", "(未設定)")}
    try:
        which = subprocess.run(["which", "mutool"], capture_output=True, text=True, timeout=10)
        result["which_mutool_stdout"] = which.stdout.strip()
        result["which_mutool_stderr"] = which.stderr.strip()
        result["which_returncode"] = which.returncode
    except Exception as e:
        result["which_error"] = str(e)
    try:
        ver = subprocess.run(["mutool", "-v"], capture_output=True, text=True, timeout=10)
        result["mutool_stdout"] = ver.stdout.strip()
        result["mutool_stderr"] = ver.stderr.strip()
        result["mutool_returncode"] = ver.returncode
    except FileNotFoundError as e:
        result["mutool_exec_error"] = f"FileNotFoundError: {e}"
    except Exception as e:
        result["mutool_exec_error"] = f"{type(e).__name__}: {e}"
    return result


@app.post("/convert/pdf-to-docx")
async def pdf_to_docx(file: UploadFile = File(...)):
    """PDF 轉 Word,使用 pdf2docx 套件還原版面與表格。"""
    _check_pdf(file)
    from pdf2docx import Converter  # 延遲載入,避免冷啟動變慢

    with tempfile.TemporaryDirectory() as tmp:
        src_path = _save_upload(file, tmp)
        out_path = os.path.join(tmp, "output.docx")
        try:
            cv = Converter(src_path)
            cv.convert(out_path)
            cv.close()
        except Exception as e:
            raise HTTPException(500, f"轉換失敗: {e}")

        final_path = f"/tmp/{uuid.uuid4().hex}.docx"
        shutil.copy(out_path, final_path)
        return FileResponse(
            final_path,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            filename="converted.docx",
        )


@app.post("/convert/pdf-to-svg")
async def pdf_to_svg(file: UploadFile = File(...), page: int | None = None):
    """
    PDF 轉 SVG 向量圖,呼叫系統的 mutool。
    - 有帶 page 參數(1-based):只轉那一頁,回傳單一 .svg 檔
    - 沒帶 page 參數:轉全部頁面,打包成 .zip
    """
    _check_pdf(file)

    with tempfile.TemporaryDirectory() as tmp:
        src_path = _save_upload(file, tmp)

        # 用 pdfplumber 直接讀頁數,比解析 mutool 文字輸出可靠
        import pdfplumber
        try:
            with pdfplumber.open(src_path) as pdf:
                total_pages = len(pdf.pages)
        except Exception as e:
            raise HTTPException(500, f"無法讀取 PDF: {e}")

        target_pages = [page] if page else list(range(1, total_pages + 1))
        for p in target_pages:
            if p < 1 or p > total_pages:
                raise HTTPException(400, f"頁碼 {p} 超出範圍(共 {total_pages} 頁)")

        try:
            if page:
                out_path = os.path.join(tmp, "output.svg")
                subprocess.run(
                    ["mutool", "draw", "-o", out_path, "-F", "svg", src_path, str(page)],
                    check=True, capture_output=True, timeout=60,
                )
                final_path = f"/tmp/{uuid.uuid4().hex}.svg"
                shutil.copy(out_path, final_path)
                return FileResponse(final_path, media_type="image/svg+xml", filename="converted.svg")
            else:
                zip_buf = io.BytesIO()
                with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
                    for p in target_pages:
                        out_path = os.path.join(tmp, f"page-{p:03d}.svg")
                        subprocess.run(
                            ["mutool", "draw", "-o", out_path, "-F", "svg", src_path, str(p)],
                            check=True, capture_output=True, timeout=60,
                        )
                        zf.write(out_path, arcname=f"page-{p:03d}.svg")
                zip_buf.seek(0)
                return StreamingResponse(
                    zip_buf,
                    media_type="application/zip",
                    headers={"Content-Disposition": "attachment; filename=pages-svg.zip"},
                )
        except subprocess.CalledProcessError as e:
            raise HTTPException(500, f"轉換失敗: {e.stderr.decode(errors='ignore')}")
        except FileNotFoundError:
            raise HTTPException(500, "系統缺少 mutool,請確認 Dockerfile 有安裝 mupdf-tools")


@app.post("/convert/pdf-to-xlsx")
async def pdf_to_xlsx(file: UploadFile = File(...)):
    """
    PDF 轉 Excel,使用 pdfplumber 擷取每頁的表格,每個表格各自寫成一個工作表。
    效果依原始 PDF 的表格線條/排版而定 —— 掃描圖檔或無明確表格線的 PDF 抓不到表格。
    """
    _check_pdf(file)
    import pdfplumber
    from openpyxl import Workbook

    with tempfile.TemporaryDirectory() as tmp:
        src_path = _save_upload(file, tmp)

        wb = Workbook()
        wb.remove(wb.active)  # 移除預設空白工作表
        sheet_count = 0

        try:
            with pdfplumber.open(src_path) as pdf:
                for page_idx, pdf_page in enumerate(pdf.pages, start=1):
                    tables = pdf_page.extract_tables()
                    for t_idx, table in enumerate(tables, start=1):
                        sheet_count += 1
                        ws = wb.create_sheet(title=f"P{page_idx}-{t_idx}"[:31])
                        for row in table:
                            ws.append(["" if cell is None else cell for cell in row])
        except Exception as e:
            raise HTTPException(500, f"轉換失敗: {e}")

        if sheet_count == 0:
            raise HTTPException(
                422,
                "沒有偵測到任何表格 —— 這份 PDF 可能是掃描圖檔,或沒有明確的表格線條",
            )

        out_path = f"/tmp/{uuid.uuid4().hex}.xlsx"
        wb.save(out_path)
        return FileResponse(
            out_path,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            filename="converted.xlsx",
        )

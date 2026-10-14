"""博申轉檔平台 API. Heavy conversions run in a bounded, isolated process."""
import asyncio
import json
import logging
import os
from pathlib import Path
import shutil
import signal
import sys
import tempfile
import time

from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

app = FastAPI(title="博申轉檔平台 API", version="0.3.0")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
    expose_headers=["Content-Disposition", "X-Original-Size", "X-Compressed-Size",
                    "X-Conversion-Seconds", "X-Queue-Seconds", "Server-Timing"],
)
MAX_FILE_SIZE_MB = 25
WORKER_PATH = Path(__file__).with_name("conversion_worker.py")
CONVERSION_TIMEOUT_SECONDS = 120
QUEUE_TIMEOUT_SECONDS = 30
# One conversion at a time protects the free instance's 512 MB memory budget.
conversion_slot = asyncio.Semaphore(1)
logger = logging.getLogger("uvicorn.error")


@app.get("/health")
async def health():
    return {"status": "ok", "version": app.version}


async def _save_upload(file: UploadFile, directory: str):
    if file.content_type != "application/pdf":
        raise HTTPException(400, "只接受 PDF 檔案")
    source = Path(directory) / "input.pdf"
    size = 0
    with source.open("wb") as output:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_FILE_SIZE_MB * 1024 * 1024:
                raise HTTPException(413, f"檔案超過 {MAX_FILE_SIZE_MB}MB 限制")
            output.write(chunk)
    if not size:
        raise HTTPException(400, "PDF 檔案是空的")
    return str(source)


async def _stop_process(process):
    if process.returncode is None:
        try:
            if os.name == "posix":
                # Also terminate Ghostscript if the compression worker is stopped.
                os.killpg(process.pid, signal.SIGKILL)
            else:
                process.kill()
        except ProcessLookupError:
            pass
    await process.communicate()


async def _execute_worker(payload):
    process = await asyncio.create_subprocess_exec(
        sys.executable, "-X", "utf8", str(WORKER_PATH), json.dumps(payload),
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        start_new_session=(os.name == "posix"),
    )
    try:
        stdout, _stderr = await asyncio.wait_for(
            process.communicate(), timeout=CONVERSION_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        await _stop_process(process)
        raise HTTPException(504, f"轉換超過 {CONVERSION_TIMEOUT_SECONDS} 秒，請減少頁數、降低 PDF 複雜度或稍後再試")
    except BaseException:
        await _stop_process(process)
        raise
    try:
        result = json.loads(stdout)
    except (ValueError, UnicodeDecodeError):
        # Avoid logging document contents or library diagnostics from private files.
        logger.error("Conversion worker failed: kind=%s exit=%s", payload["kind"], process.returncode)
        raise HTTPException(500, "轉換程序未能完成，可能是記憶體不足或 PDF 格式不支援")
    if "status" in result:
        raise HTTPException(result["status"], result["detail"])
    if process.returncode:
        raise HTTPException(500, "轉換程序異常結束")
    return result


async def _convert(kind, file, background_tasks, **options):
    directory = tempfile.mkdtemp(prefix="pdf-convert-")
    started = time.perf_counter()
    try:
        source = await _save_upload(file, directory)
        saved = time.perf_counter()
        try:
            await asyncio.wait_for(conversion_slot.acquire(), timeout=QUEUE_TIMEOUT_SECONDS)
        except asyncio.TimeoutError:
            raise HTTPException(503, "伺服器正在處理其他檔案，請稍後再試", headers={"Retry-After": "30"})
        acquired = time.perf_counter()
        try:
            result = await _execute_worker({"kind": kind, "source": source,
                                            "directory": directory, **options})
        finally:
            conversion_slot.release()
        finished = time.perf_counter()
        output = Path(directory) / result["filename"]
        if not output.is_file() or not output.stat().st_size:
            raise HTTPException(500, "轉換未產生輸出檔案")
        headers = result.get("headers", {})
        headers.update({
            "X-Conversion-Seconds": f"{finished - acquired:.3f}",
            "X-Queue-Seconds": f"{acquired - saved:.3f}",
            "Server-Timing": (f"save;dur={(saved - started) * 1000:.1f}, "
                              f"queue;dur={(acquired - saved) * 1000:.1f}, "
                              f"convert;dur={(finished - acquired) * 1000:.1f}"),
        })
        logger.info("conversion kind=%s pages=%s queue=%.3fs convert=%.3fs",
                    kind, result.get("pages"), acquired - saved, finished - acquired)
        background_tasks.add_task(shutil.rmtree, directory, ignore_errors=True)
        return FileResponse(output, media_type=result["media_type"], filename=result["filename"],
                            headers=headers, background=background_tasks)
    except BaseException:
        shutil.rmtree(directory, ignore_errors=True)
        raise
    finally:
        await file.close()


@app.post("/convert/pdf-to-docx")
async def pdf_to_docx(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    return await _convert("docx", file, background_tasks)


@app.post("/convert/pdf-to-xlsx")
async def pdf_to_xlsx(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    return await _convert("xlsx", file, background_tasks)


@app.post("/convert/pdf-to-svg")
async def pdf_to_svg(background_tasks: BackgroundTasks, file: UploadFile = File(...), page: int | None = None):
    return await _convert("svg", file, background_tasks, page=page)


@app.post("/convert/pdf-compress")
async def pdf_compress(background_tasks: BackgroundTasks, file: UploadFile = File(...), level: str = "ebook"):
    if level not in ("screen", "ebook", "printer"):
        raise HTTPException(400, "level 必須是 screen / ebook / printer 其中之一")
    return await _convert("compress", file, background_tasks, level=level)

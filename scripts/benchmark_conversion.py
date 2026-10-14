"""Local conversion measurements. Private inputs never leave this machine."""
import argparse
import concurrent.futures
import io
import json
from pathlib import Path
import subprocess
import sys
import time
import zipfile


def run_limited(command):
    """Keep the old pathological algorithms below a 512 MB/30 second test budget."""
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               text=True, encoding="utf-8")
    started = time.perf_counter()
    reason = None
    peak = 0
    import psutil
    parent = psutil.Process(process.pid)
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(process.communicate)
        while not future.done():
            memory = 0
            processes = []
            try:
                processes = parent.children(recursive=True) + [parent]
                for item in processes:
                    try:
                        memory += item.memory_info().rss
                    except psutil.NoSuchProcess:
                        pass
            except psutil.NoSuchProcess:
                pass
            peak = max(peak, memory)
            if memory > 512 * 1024 * 1024:
                reason = "memory_limit_512mb"
            elif time.perf_counter() - started > 30:
                reason = "timeout_30s"
            if reason:
                for item in processes:
                    try:
                        item.kill()
                    except psutil.NoSuchProcess:
                        pass
                break
            time.sleep(0.05)
        stdout, stderr = future.result()
    return subprocess.CompletedProcess(command, process.returncode, stdout, stderr), reason, round(peak / 1024 / 1024, 1)


def baseline(kind, source, output):
    if kind == "docx":
        from pdf2docx import Converter
        converter = Converter(source)
        try:
            converter.convert(str(Path(output) / "baseline.docx"))
        finally:
            converter.close()
    elif kind == "xlsx":
        import pdfplumber
        from openpyxl import Workbook
        workbook = Workbook()
        workbook.remove(workbook.active)
        count = 0
        with pdfplumber.open(source) as pdf:
            for index, page in enumerate(pdf.pages, 1):
                for number, table in enumerate(page.extract_tables(), 1):
                    count += 1
                    sheet = workbook.create_sheet(f"P{index}-{number}")
                    for row in table:
                        sheet.append(["" if cell is None else cell for cell in row])
        if count:
            workbook.save(str(Path(output) / "baseline.xlsx"))
        print(json.dumps({"table_count": count}))


def fixture(path):
    import fitz
    with fitz.open() as pdf:
        for n in range(6):
            page = pdf.new_page()
            page.insert_text((50, 50), f"Synthetic public benchmark page {n + 1}")
            for y in (100, 125, 150, 175):
                page.draw_line((50, y), (350, y))
            for x in (50, 200, 350):
                page.draw_line((x, 100), (x, 175))
            for row in range(3):
                page.insert_text((60, 116 + 25 * row), f"Row {row + 1}")
                page.insert_text((210, 116 + 25 * row), str(100 + row))
        pdf.save(path)


def measure(args):
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    if args.fixture:
        fixture(str(output / "synthetic-six-pages.pdf"))
        source = str(output / "synthetic-six-pages.pdf")
    else:
        source = str(Path(args.source).resolve())
    if args.baseline_worker:
        baseline(args.kind, source, output)
        return
    rows = []
    for kind in ("docx", "xlsx", "svg"):
        command = [sys.executable, "-X", "utf8", str(Path(__file__).resolve().parents[1] / "conversion_worker.py"),
                   json.dumps({"kind": kind, "source": source, "directory": str(output)})]
        started = time.perf_counter()
        try:
            process = subprocess.run(command, capture_output=True, timeout=30, text=True, encoding="utf-8")
            result = json.loads(process.stdout)
            rows.append({"implementation": "new", "kind": kind,
                         "wall_seconds": round(time.perf_counter() - started, 3),
                         "status": result.get("status", 200), "worker_seconds": result.get("seconds")})
        except subprocess.TimeoutExpired:
            rows.append({"implementation": "new", "kind": kind, "status": "timeout_30s"})
    if args.baseline:
        for kind in ("docx", "xlsx"):
            command = [sys.executable, "-X", "utf8", str(Path(__file__).resolve()),
                       "--source", source, "--output", str(output), "--baseline-worker", "--kind", kind]
            started = time.perf_counter()
            try:
                process, reason, peak_mb = run_limited(command)
                rows.append({"implementation": "baseline", "kind": kind,
                             "wall_seconds": round(time.perf_counter() - started, 3), "exit_code": process.returncode,
                             "limit": reason, "peak_rss_mb": peak_mb,
                             "table_count": json.loads(process.stdout.splitlines()[-1]).get("table_count") if kind == "xlsx" and process.returncode == 0 else None})
            except subprocess.TimeoutExpired:
                rows.append({"implementation": "baseline", "kind": kind, "status": "timeout_30s"})
    (output / "timings.json").write_text(json.dumps(rows, indent=2), encoding="utf-8")
    print(json.dumps(rows, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source")
    parser.add_argument("--fixture", action="store_true")
    parser.add_argument("--output", required=True)
    parser.add_argument("--baseline", action="store_true")
    parser.add_argument("--baseline-worker", action="store_true")
    parser.add_argument("--kind")
    args = parser.parse_args()
    if not args.source and not args.fixture:
        parser.error("--source or --fixture is required")
    measure(args)

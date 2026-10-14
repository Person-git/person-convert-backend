"""Only upload the hardcoded, generated synthetic fixture to the existing service."""
import json
from pathlib import Path
import time
import zipfile
import io

import httpx

source = Path("tmp/synthetic-benchmark/synthetic-six-pages.pdf")
data = source.read_bytes()
base = "https://person-convert-api.onrender.com"
rows = []
with httpx.Client(timeout=120) as client:
    started = time.perf_counter()
    health = client.get(base + "/health")
    health.raise_for_status()
    rows.append({"kind": "warm_health", "seconds": round(time.perf_counter() - started, 3), "result": health.json()})
    for kind in ("docx", "xlsx", "svg"):
        started = time.perf_counter()
        try:
            response = client.post(base + f"/convert/pdf-to-{kind}", files={"file": ("synthetic-six-pages.pdf", data, "application/pdf")})
            row = {"kind": kind, "seconds": round(time.perf_counter() - started, 3),
                   "status": response.status_code, "output_bytes": len(response.content)}
            if response.status_code == 200:
                assert zipfile.is_zipfile(io.BytesIO(response.content))
                if kind == "svg":
                    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
                        assert archive.namelist() == [f"page-{i:03d}.svg" for i in range(1, 7)]
            rows.append(row)
        except httpx.TimeoutException:
            rows.append({"kind": kind, "status": "timeout_120s"})
        print(json.dumps(rows[-1]), flush=True)
Path("tmp/synthetic-benchmark/live-original-timings.json").write_text(json.dumps(rows, indent=2), encoding="utf-8")

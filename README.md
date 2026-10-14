# 博申轉檔平台

Cloudflare Pages 靜態前端 + Render FastAPI 後端，所有轉換使用一般 PDF 工具，不呼叫 AI 模型、不消耗 AI token。

## 原始碼

- `frontend/index.html`：以 2026-10-14 正式站 HTML 快照為基礎建立的前端維護版本。
- `main.py`：上傳驗證、排隊、轉換程序管理、下載與清理。
- `conversion_worker.py`：Word、Excel、SVG、壓縮的轉換實作。
- `HANDOVER.md`、`PERFORMANCE.md`：本機接手與測試紀錄，不納入公開版本庫。

## 免費環境的處理方式

同時只執行一項轉換，避免 512 MB 記憶體下多項任務互相拖慢或當機。轉換在獨立程序執行，API 健康檢查仍可回應。
排隊最多 30 秒，超時回傳 503；實際轉換最多 120 秒，超時終止程序並回傳 504。檔案上限 25 MB。
SVG 使用現有 PyMuPDF 引擎，一次開啟 PDF；全部頁面直接寫入磁碟 ZIP，降低重複解析與記憶體使用。

Word、Excel 先以 PyMuPDF 檢查可擷取文字。若整份文件沒有文字（掃描檔或字形已轉成向量輪廓），立即回傳 422 與 OCR 說明。
這不是 OCR；看起來像文字不代表 PDF 仍有可編輯文字。Excel 仍需要明確表格線。

成功回應的 `Server-Timing`、`X-Queue-Seconds`、`X-Conversion-Seconds` 可區分伺服器排隊與轉換耗時。
轉換程序 stdout/stderr 不記錄文件內容；應用程式只記錄功能、頁數與耗時。

## 本機執行與測試

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt httpx pytest
.venv\Scripts\python -m uvicorn main:app --host 127.0.0.1 --port 8000
.venv\Scripts\python -m pytest -q
```

PDF 壓縮需要 `gs`（Ghostscript）；Dockerfile 已安裝。前端可用任意靜態 HTTP 服務供應 `frontend/`，在頁面底部將 API 位址設定成本機 API。
`scripts/benchmark_conversion.py --baseline` 的舊版比較測試另需安裝 `psutil`，用以限制測試程序的記憶體。

## 部署

後端：Render 連接 GitHub main，使用 Dockerfile。推送 main 會觸發既有自動部署。
前端：Cloudflare Pages `convert-bench` 目前未連接 Git；部署內容應為 `frontend/`，不能上傳整個後端 repo。
前端原始碼與後端一同版本管理；Cloudflare 仍使用既有的直接上傳部署方式。原始線上快照保留在本機 `reference/`。
進度顯示涵蓋 Word、Excel、SVG、壓縮：上傳與可計算長度的下載顯示實際百分比，轉換中顯示不定進度條與等待秒數，完成後顯示 100%。現有同步 API 不提供轉換階段的百分比。
本機前端可直接連接 https://person-convert-api.onrender.com ，不需要另外執行本機後端；亦可在底部欄位改用本機 API。
健康檢查會回傳 API 版本，頁面「測試連線」可確認目前连接的後端版本。

機密測試文件與轉換結果只在本機 `tmp/`，不納入 Git，不上傳到第三方服務。

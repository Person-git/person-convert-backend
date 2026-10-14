# 博申轉檔平台

Cloudflare Pages 靜態前端 + Render FastAPI 後端，所有轉換使用一般 PDF 工具，不呼叫 AI 模型、不消耗 AI token。

## 原始碼

- `frontend/index.html`：以 2026-10-14 正式站 HTML 快照為基礎建立的前端維護版本。
- `frontend/ocr-word.js`：瀏覽器中英文 OCR 與可編輯 DOCX 輸出。
- `main.py`：上傳驗證、排隊、轉換程序管理、下載與清理。
- `conversion_worker.py`：Word、Excel、SVG、壓縮的轉換實作。
- `HANDOVER.md`、`PERFORMANCE.md`：本機接手與測試紀錄，不納入公開版本庫。

## 免費環境的處理方式

11「免費 OCR → Word」：PDF.js 在瀏覽器逐頁渲染，Tesseract.js 6.0.1（繁體＋英文、簡體＋英文或英文）辨識，再由既有 JSZip 打包成含可編輯文字的 DOCX。文件不傳到 Render 或 OCR API，不使用 AI token。
首次使用需下載固定版本的引擎、WebAssembly 與所選語言資料（jsDelivr CDN），語言資料由辨識套件在瀏覽器快取。逐頁釋放 canvas／PDF 頁面記憶體，並支援取消與辨識進度。
輸出保留來源分頁邊界，採文字段落與換行；不保證還原原始表格、字型或複雜排版。使用固定 commit 的 tessdata_fast 整數語言模型；需人工校對 OCR 錯字、數字與單位。
此功能與原有 Render Word／Excel／SVG 功能分開；原有後端轉換仍保留。

原「分割 PDF」與「09 頁面管理」已合併為「05 頁面管理」，共用檔案與可換行縮圖，保留區間擷取、指定順序下載、單頁 ZIP，並新增「擷取單頁（圖片 PDF）」：使用起始頁選擇頁面，PDF.js 在本機開啟／渲染（若有開啟密碼則需正確密碼），再另存一頁 PDF。可處理能正常開啟的標準權限保護 PDF；不修改原檔、不上傳文件或密碼。輸出為圖片，失去可選取文字、向量、表單與簽章語意。若需完整保留原始物件，仍需未加密來源。
一般分割／合併使用 pdf-lib，遇到加密／權限保護 PDF 會提示此替代方式；沒有設定 ignoreEncryption 略過檢查。

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
上傳前端時需包含 frontend/ 的全部 HTML 與 JS 檔案，均放在網站根目錄。
前端原始碼與後端一同版本管理；Cloudflare 仍使用既有的直接上傳部署方式。原始線上快照保留在本機 `reference/`。
進度顯示涵蓋 Word、Excel、SVG、壓縮：上傳與可計算長度的下載顯示實際百分比，轉換中顯示不定進度條與等待秒數，完成後顯示 100%。現有同步 API 不提供轉換階段的百分比。
本機前端可直接連接 https://person-convert-api.onrender.com ，不需要另外執行本機後端；亦可在底部欄位改用本機 API。
健康檢查會回傳 API 版本，頁面「測試連線」可確認目前连接的後端版本。

機密測試文件與轉換結果只在本機 `tmp/`，不納入 Git，不上傳到第三方服務。

## 瀏覽器 Excel 與 SVG

Excel 使用 PDF.js 文字座標整理列欄，每頁一個工作表，SheetJS 0.20.3 產生 XLSX；不含 OCR、不還原合併儲存格，數值以文字保留避免誤判。複雜排版需校對。
SVG 使用現有 PDF.js 3.11 SVGGraphics，內嵌字型與圖片使用 data URL，不依賴暫時 blob URL；逐頁匯出或 ZIP。原有向量保留、圖片不會向量化，特殊圖形效果需檢查。兩者文件不上傳，50 MB 上限，顯示處理百分比。
Render 保留可選的排版 Word 與 Ghostscript 壓縮服務。

## 解除 PDF 保護

09 使用固定版本 qpdf-wasm 0.3.0，在一次性 Web Worker 內解除標準 PDF 加密／權限限制，不上傳文件或密碼。無開啟密碼可留空，有密碼需正確開啟密碼。保留原 PDF 物件，另存副本；原簽章會失效，不支援憑證／DRM。50 MB 上限，可取消並終止 worker，完成後清除密碼。需以 HTTP(S) 開啟網站（Worker 不支援直接 file:// 開啟）。功能編號現為 01–15，Word 10／OCR 11／Excel 12／SVG 13／壓縮 14／放大 15。

## 預設本機模式

Word 預設從 PDF.js 擷取可選取文字，使用共用 DOCX 寫入器保留分頁，不還原原始表格／圖片／排版。可切換後端排版模式。無文字需改用 OCR。
壓縮預設使用 qpdf Worker 無損重壓 Flate 與物件串流，保留畫質。若檔案沒有變小，不下載較大的版本；可選後端降低圖片解析度模式。這些模式有不同品質與大小效果，所以保留 Render，沒有刪除服務。
繁體／簡體 OCR 可混合英文，語言資料固定於 tessdata_fast commit 87416418657359cb625c412a48b6e1d6d41c29bd；預設繁體＋英文，Word 指定 Microsoft JhengHei 東亞字型。

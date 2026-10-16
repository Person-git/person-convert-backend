# 博申轉檔平台

Cloudflare Pages 靜態前端 + Render FastAPI 後端，所有轉換使用一般 PDF 工具，不呼叫 AI 模型、不消耗 AI token。

## 原始碼

- `frontend/index.html`：以 2026-10-14 正式站 HTML 快照為基礎建立的前端維護版本。
- `frontend/ocr-word.js`：瀏覽器中英文 OCR 與可編輯 DOCX 輸出。
- `frontend/ocr-flow.js`：依 OCR 座標整理欄位閱讀順序與同段落換行。
- `main.py`：上傳驗證、排隊、轉換程序管理、下載與清理。
- `conversion_worker.py`：Word、Excel、SVG、壓縮的轉換實作。
- `HANDOVER.md`、`PERFORMANCE.md`：本機接手與測試紀錄，不納入公開版本庫。

## 免費環境的處理方式

10「PDF 轉 Word（含 OCR）」內的 OCR 模式：PDF.js 在瀏覽器逐頁渲染，Tesseract.js 6.0.1（繁體＋英文、簡體＋英文或英文）辨識，再由既有 JSZip 打包成含可編輯文字的 DOCX。文件不傳到 Render 或 OCR API，不使用 AI token。
首次使用需下載固定版本的引擎、WebAssembly 與所選語言資料（jsDelivr CDN），語言資料由辨識套件在瀏覽器快取。逐頁釋放 canvas／PDF 頁面記憶體，並支援取消與辨識進度。
輸出可選「可編輯文字版」（同段落換行整併與欄位閱讀順序）或「保留文字位置（實驗版）」。兩者保留來源分頁；排版模式依 OCR 座標重建可編輯文字框、估計字級與位置，並分開明顯的欄間空隙。使用替代字型，不還原原始圖片、表格線、精確字型或粗斜體；不同 Word 閱讀軟體與電腦字型仍可能影響顯示，複雜版面需人工調整。使用固定 commit 的 tessdata_fast 整數語言模型；需人工校對 OCR 錯字、數字與單位。
在單一 Word 入口選檔後，會在本機自動檢查文字層，提示適合文字版、OCR 或混合文件。30 頁以內檢查全部頁面，超過則均勻抽樣 30 頁並註明；初步判斷不保證圖片中文字、閱讀順序或文字品質。預設「自動判斷」：正常文字層直接擷取，無文字／混合文件走 OCR。也可手動選擇直接擷取、OCR 或後端排版；切換不需重選檔，不會自動開始轉換或上傳。檢查失敗時自動模式停用轉換，需處理檔案或手動選擇模式。混合文件目前整份 OCR，超過30頁為抽樣判斷，並非逐頁最佳化。
原有 Render 排版 Word 保留為明確標示會上傳的選項，不由自動模式選用。

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

09 使用固定版本 qpdf-wasm 0.3.0，在一次性 Web Worker 內解除標準 PDF 加密／權限限制，不上傳文件或密碼。無開啟密碼可留空，有密碼需正確開啟密碼。保留原 PDF 物件，另存副本；原簽章會失效，不支援憑證／DRM。50 MB 上限，可取消並終止 worker，完成後清除密碼。需以 HTTP(S) 開啟網站（Worker 不支援直接 file:// 開啟）。功能編號現為 01–14，Word（含 OCR）10／Excel 11／SVG 12／壓縮 13／放大 14。

## 預設本機模式

Word 預設自動判斷，有正常文字層時從 PDF.js 擷取可選取文字，使用共用 DOCX 寫入器保留分頁，不還原原始表格／圖片／排版。可切換後端排版模式。無文字需改用 OCR。
壓縮預設使用 qpdf Worker 無損重壓 Flate 與物件串流，保留畫質。若檔案沒有變小，不下載較大的版本；可選後端降低圖片解析度模式。這些模式有不同品質與大小效果，所以保留 Render，沒有刪除服務。
繁體／簡體 OCR 可混合英文，語言資料固定於 tessdata_fast commit 87416418657359cb625c412a48b6e1d6d41c29bd；預設繁體＋英文，Word 指定 Microsoft JhengHei 東亞字型。

## PWA：安裝與離線使用

原 OCR 錨點 `#ocr-word-section` 保留在合併區塊供舊書籤使用，PWA 捷徑已改為 `#convert-word`。

PWA 檔案包含 `manifest.json`、`sw.js` 與 `icons/` 的 192／512 圖示、maskable 圖示及 Apple touch 圖示。安裝採 standalone 獨立視窗，入口與範圍為 `/`；提供頁面管理與 OCR 捷徑。

安裝須由使用者主動選擇，不會自動安裝、啟動或隨開機執行。電腦 Chrome／Edge 與 Android 可用瀏覽器「安裝應用程式」；支援安裝提示時，頁首會出現「安裝 App」按鈕。iPhone／iPad 請以 Safari 分享選單「加入主畫面」。不同瀏覽器的名稱與支援略有差異，Codex 內建瀏覽器不一定提供作業系統安裝入口。

Service Worker 只快取固定清單的公開 HTML／JS／圖示及固定版本引擎，不快取上傳、密碼、PDF 或下載產物，也不攔截 Render API。網站本體與主要 PDF 套件在首次連線時快取；OCR、語言模型、Excel、qpdf 等大型引擎會在實際使用後快取。離線前需先連線開啟網站並使用相關功能一次；瀏覽器清除或回收快取後需重新連線。後端排版 Word／進階壓縮不支援離線。

同站程式檔使用 network-first，固定版本 CDN 引擎使用 cache-first。後續部署需包含整個 `frontend/`（包含 `icons/`），不可只上傳 HTML／JS。若修改 SW 快取結構，更新 `CACHE` 版本；只清除 `person-convert-pwa-` 名稱範圍的舊快取，不清除其他網站資料。首次部署可透過瀏覽器確認 manifest 有效、SW active/controller，以及 Cache Storage 的資源清單。真正離線與作業系統安裝仍須在支援的 Chrome／Edge／Safari 裝置驗證。

## Word 版面還原研究

研究結論與可行方案見 [WORD-FIDELITY.md](WORD-FIDELITY.md)。現有實驗模式只保留文字位置，不等同 Adobe 的段落、表格、圖片與字型重建；本次統一入口未增加大型模型或商業服務。

## OCR 段落與閱讀順序

可編輯文字版會要求 Tesseract 輸出逐頁座標，以明顯的欄間空白分出左右欄、再依垂直空白分隔跨欄標題與區段。同一 OCR 段落中高度與行距相近的連續行會整併，項目符號／編號開頭另起段落。中英文接行使用不同空白規則；可見連字號保留，不猜測原詞，軟連字號可移除。

此為橫排、由左至右文件的幾何推測，不是語意理解；複雜多欄、表格、直排及右至左語言仍需校對。保留來源分頁，長段落在 Word 中仍可能重新流動、增加頁數。可手動選「原始換行文字（不重排）」保留舊方式。無座標或座標無效時保留原 OCR 文字，避免因重排丟失內容；位置實驗版維持原有文字框方式。逐頁處理並釋放資源，未增加新模型或遠端服務。

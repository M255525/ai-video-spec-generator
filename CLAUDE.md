# ai-video-spec-generator — AI 影片規格產生器

依使用者提供的「萬用AI影片引擎_設計規格表.xlsx」（三層架構＋6 核心滑桿＋結構模板庫＋素材角色＋鏡頭骨架＋配方試算＋生成模組）做成的單頁工具。2026-11-08 建立。**本工具只產生規格／分鏡／AI 指令，不生成影片。**

- 純靜態：`index.html`（CSS）＋`data.js`（規格資料）＋`engine.js`（規則式引擎，Node 可跑）＋`app.js`（介面）＋`manual.html`＋PWA。
- 本機預覽 port **8867**（`python -m http.server 8867`）。尚未上線；`.github/workflows/pages.yml` 已備好（push master 自動部署），預計網址 <https://m255525.github.io/ai-video-spec-generator/>，visitor-badge `m255525.aivideospecgenerator`。

## 規格對應（改 `data.js` 就好）
- `SPEC.SLIDERS`：S1–S6，0–33 低／34–66 中／67–100 高，`ins[等級]` 是送給 AI 的指令。
- `SPEC.TEMPLATES`：6 個模板（段落、S1–S6 預設、建議長度）；使用者可「存成我的模板」（localStorage `vsg.tpls`）。
- `SPEC.ROLES`：事實依據／必用素材／風格參考／靈感來源與建議權重範圍。
- `SPEC.MODULES`：腳本分鏡／配音／畫面／字幕／合成輸出。
- `SPEC.EXAMPLES`：5 個範例，第一個＝規格表示範（政策型、S3 自訂 60、5 鏡 24 秒）。範例內容全虛構。

## 引擎重點（engine.js）
- `E.prompt()` 第一段**必須和規格表「配方試算」A20 的句型逐字一致**（測試有比對），後面才附加素材規則、進階設定、輸出格式（JSON 或 Markdown 表格）。
- `E.draftShots()`：節奏 → 每鏡秒數（各等級區間內插）→ 鏡頭數；頭尾段落權重 0.6；S5 決定畫面來源；S6 高且無行動呼籲段落會補一段；必用素材保證出現（logo 放最後一鏡，且不參與一般輪播）；秒數微調到總長＝採用長度。旁白以 `【草稿】` 開頭＝未寫，不進 SRT、不算字數。
- `E.parseShots()`：吃 JSON 陣列／物件（shots）、```json 圍欄、Markdown 表格、Excel Tab 表格；中英文欄位名都認，fade/zoom 等會轉成選項。
- `E.recipe()`：配方 JSON，schema `ai-video-recipe/1`。
- 改引擎一定要跑 `node tools/test_engine.mjs`。

## 標準配備
跑馬燈（工作區公告 GAS，滑鼠移入暫停）、⚙ 常用設定（收合式：新專案預設值、AI 金鑰 BYOK、介面、資料備份、關於本工具）、首訪警語＋頁面入口、`manual.html#creator`、PWA、訪客計數器。
`manual.html` 由 `tools/build_manual.py` 組出，改手冊改 `tools/manual_body.html` 再重跑。圖示 `tools/make_icons.py`。上線改版要升 `service-worker.js` 的 `CACHE_NAME`。
儲存鍵前綴 `vsg.`；測試掛鉤 `window._vsg`。

## 未驗證
BYOK AI 直接排分鏡（Gemini／OpenAI／Claude／OpenRouter／自訂端點）沒有用真金鑰實測；列印規格書會開新視窗，被擋時提示改下載 Markdown。

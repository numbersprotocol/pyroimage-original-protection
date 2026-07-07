# TTD MVP 優化計畫 (improvement.md)

> 目標：把目前的 `ttd-mvp` dashboard 從「工程內部驗收頁」改造成 **7/9 可直接展示給導師看、且真的能為 PyroImage 巡檢盜用並提供警報的客戶級 MVP**。
>
> 版本：v1（2026-06-25，由 harness-dev loop iteration 1 產出）
> 線上位置：<https://numbersprotocol.io/ttd-mvp/>
> 程式位置：`numbers-website/ttd-mvp/`

---

## 1. 背景與目標

Sofia 的回饋（2026-06-25）歸納為五個核心問題：

1. **看不出這個頁面能做什麼** — 一進來是 7 個分頁的工程儀表板，沒有「這頁在解決什麼問題」的敘事。
2. **太多技術名詞** — `local similarity`、`specified-source monitoring`、`combined distance`、`C2PA`、`provenance_status`、`threshold` 等直接出現在 UI。
3. **介面殘留內部討論用語** — `actual / sample / simulated / TBD` 標籤、`P0 assets to sign`、`counts_toward_market_validation`、`Phase 6 artifact-backed local demo`、`approved_for_public_demo_report_deck_per_sofia_2026_06_18` 等。
4. **資料沒串好、影像庫全是破圖** — 已驗證根因：CDN 圖片 URL 的簽章 query 被 redact，回傳 HTTP 403。
5. **還不是能直接展示、且不能真的用** — 目前所有監測 / 警報 / 案件都是靜態 fixture，`suspected_events_actual = 0`，無法真的對 PyroImage 影像「巡檢盜用、發警報」。

### 成功標準（7/9 驗收）

| # | 驗收項目 | 現況 | 目標 |
|---|----------|------|------|
| A | 5 秒內看懂「這頁在幹嘛」 | ✗（工程儀表板） | ✓ 首屏一句話價值主張 + 一個主流程 |
| B | 全中文、零工程黑話 | ✗ | ✓ 客戶語言，技術細節收進「進階」 |
| C | 無內部標籤 / phase 字樣 | ✗ | ✓ 內部標籤移除或轉成客戶可懂的狀態 |
| D | 影像庫正常顯示縮圖 | ✗ 全破圖 | ✓ 真實 PyroImage 縮圖 |
| E | 真的能跑一次「巡檢→發現→警報→證據」 | ✗ 靜態 | ✓ 可互動、可重現的真實比對 demo |

---

## 2. 現況診斷（含證據）

### 2.1 影像破圖 — 根因已定位

`ttd-mvp/public/ttd-mvp/demo-assets.json` 內每筆 `media_refs` 的圖片連結被標記
`original_url_query_redacted: true` / `snapshot_url_query_redacted: true`，
也就是把 CloudFront 簽章 query string 砍掉了。實測：

```text
GET https://dia-cdn.numbersprotocol.io/files/2025/08/31/.../JjtgzcUomnHDXbl6dpQc_1.jpg
→ HTTP 403 | content-type: text/xml | size: 146   (AccessDenied)
```

App.tsx 直接把這個 URL 餵給 `<img src>`（`src/App.tsx:456`、`:486`），所以全部破圖。

**修復路徑（已驗證可行）**：改用 DIA 公開 API 重新抓「長效簽章」的縮圖。

```text
GET https://dia-backend.numbersprotocol.io/api/v3/assets/?owner_service_name=Pyro%20Image
→ HTTP 200, count = 4329
  每筆 result 有：
    asset_file_thumbnail  → Expires=4934080585（約西元 2126，等同永久）
    sharable_copy         → 同為長效縮圖
```

實測 `asset_file_thumbnail`：`HTTP 200 | image/jpeg | 30017 bytes` ✓

> 結論：只要在 ingest 腳本改抓 `asset_file_thumbnail` / `sharable_copy`（長效簽章），
> 並**保留完整 query string**（不要 redact），破圖即可全數修復。

### 2.2 技術黑話清單（UI 直接出現）

| 位置 | 現有文字 | 問題 |
|------|----------|------|
| Header eyebrow | `TTD MVP / original-image proactive protection` | 內部代號 + 英文 |
| Header 副標 | `從 PyroImage 原作庫、local similarity、specified-source monitoring、suspected match alert 到 evidence report，保留 actual / sample / simulated / TBD 標籤。` | 中英夾雜、全是黑話 |
| 左側導覽標題 | `seven-screen flow` | 工程語言 |
| 分頁標籤 | `01 Library`…`07 Impact`、`suspected match`、`Evidence report` | 用 build phase 編號當資訊架構 |
| 區塊標題 | `Protected asset detail / metadata / provenance`、`Local index / similarity result`、`Self-match smoke results` | 工程描述 |
| 相似度卡 | `indexed rows`、`failed fetches`、`threshold`、`combined distance` | 演算法術語 |
| Footer | `Phase 6 artifact-backed local demo / paid APIs disabled / simulated cases excluded from market validation` | 純內部備註 |

### 2.3 內部標籤 / PM 用語洩漏

來自 `dashboard-metrics.json` 的 metric 文案：

- `actual until real case exists`、`actual / outreach pending`、`actual PM candidate list`、`actual PM demo subset`
- `P0 assets to sign` / `TBD`
- `counts_toward_market_validation`、`deck_use_rule`、`suspected_events_actual`
- `approved_for_public_demo_report_deck_per_sofia_2026_06_18`（rights_status，雖未顯示但在資料中）

這些是給內部對齊用的，**客戶 / 導師看到會混淆甚至減分**。

### 2.4 「不能真的用」

目前 `monitoring-run.json`、`alerts.json`、`cases.json` 全是手工 fixture，
`suspected_events_actual = 0`，沒有任何真實反向圖片搜尋 / 網路巡檢能力。
這是 demo 與「真的能用」之間最大的落差。

---

## 3. 重新定位：MVP 要講的故事

把「7 個工程分頁」換成**一條客戶聽得懂的因果線**：

> 「PyroImage 的每一張原創影像都有數位指紋。我們持續到指定通路巡檢，
> 一旦在外部發現高度相似的影像，就自動發出警報，並產生一份可直接交給法務 / 品牌方的證據報告。」

對應四步主流程（取代 01–07 工程編號）：

1. **受保護的影像** — 我有哪些原創影像、誰是創作者、是否已具備可驗證來源。
2. **巡檢中** — 我們正在盯哪些通路（社群、電商、新聞）。
3. **疑似盜用警報** — 在哪裡發現了什麼、相似到什麼程度、目前處理狀態。
4. **證據報告** — 一鍵生成可交付的盜用證據（原作 vs 疑似來源 + 相似度 + 來源截圖 + 憑證連結）。

「台灣大哥大價值」與「相似度演算法細節」改為**次要 / 進階**內容，不擋在客戶面前。

---

## 4. 新架構提案

### 4.1 資訊架構（IA）

```
首屏 Hero：一句價值主張 + 關鍵數字（受保護影像數、巡檢通路數、本月警報數）
  │
  ├─ ① 受保護的影像庫        (真實縮圖 grid，可點開看單張詳情)
  ├─ ② 巡檢中的通路          (監測來源清單 + 巡檢狀態)
  ├─ ③ 疑似盜用警報          (警報卡：原作 vs 疑似來源並排比對 + 相似度條 + 狀態)
  └─ ④ 證據報告              (可預覽 / 下載的盜用證據)

進階（收合）：相似度技術說明、資料來源與限制、台哥大商業價值
```

### 4.2 與現有元件的對應

| 新區塊 | 重用現有 | 改造重點 |
|--------|----------|----------|
| ① 影像庫 | `LibraryScreen` | 修圖 + 移除 asset_id 黑話、改顯示標題/創作者/「已保護」狀態 |
| ② 巡檢通路 | `MonitoringScreen` + `monitored-sources.json` | 改成「通路名稱 + 類型 + 最近巡檢時間 + 狀態燈號」 |
| ③ 警報 | `AlertScreen` + `alerts.json` | **原作 vs 疑似來源並排圖片比對**（核心賣點），相似度用百分比進度條，狀態用中文 |
| ④ 證據報告 | `EvidenceReportScreen` | 套版面，移除 `evidence_label` 等內部欄位，可下載 |

### 4.3 標籤系統改造

把 `actual / sample / simulated / target / TBD` 五級工程標籤，對客戶端收斂為：

- **真實資料**（來自 PyroImage 正式 API 的影像、創作者、憑證）
- **示範案例**（為了 demo 編排的疑似盜用情境，明確標示「示範」）

「示範」標示仍要誠實保留（避免誤導導師），但用詞改成中性的「示範案例 / Demo」而非 `simulated / counts_toward_market_validation`。

---

## 5. 「真的能用」的技術路線（巡檢 + 警報）

> 限制：本站是 GitHub Pages 純靜態 SPA，**無後端、無 serverless**（見 memory）。
> 「真的能對全網巡檢」需要後端排程；在不破壞靜態架構的前提下，提供三段式落地路線。

### 路線 A（7/9 demo 必達，純前端可重現的真實比對）
- 在瀏覽器端對「使用者上傳 / 選取的一張圖」計算感知雜湊（aHash/dHash，可純 JS canvas 實作），
  與已索引的 PyroImage 影像指紋（`image-index.jsonl`）比對，**即時回傳最相似的原作 + 相似度**。
- 效果：導師可以「拿一張改過的圖丟進來 → 系統當場指出它對應到哪張 PyroImage 原作」，
  這是**真的在運算、不是假資料**，且零成本、零後端。
- 同時把現有 self-match 測試結果（10/10 PASS）轉成客戶可懂的「準確度展示」。

### 路線 B（短期，半自動真實巡檢）
- 用一個可手動 / 排程觸發的腳本（Node script，在開發機或 GitHub Actions 跑），
  對指定通路做反向圖片搜尋（評估免費 / 低成本 API，例如 TinEye 試用、或自建關鍵字 + 圖片爬取），
  把命中的疑似來源寫回 `alerts.json` → 前端就能顯示「真實警報」。
- 這條讓「巡檢 → 警報」變成真資料流，但仍維持靜態前端。

### 路線 C（中期，全自動）
- 將路線 B 的腳本掛上排程（GitHub Actions cron 或既有 harness loop），
  定期巡檢 → 產生警報 → commit 回 repo → Pages 自動部署。
- 需與 Sofia 確認成本上限（目前 paid spend = NT$0，任何付費 API 需先核准）。

> **本計畫建議 7/9 至少完成路線 A**（真實、可互動、零成本），
> 並把路線 B/C 寫進「下一步藍圖」對導師說明可擴展性。

---

## 6. 實作計畫（對應 loop 迭代）

| 階段 | 內容 | 產出 | 對應迭代 |
|------|------|------|----------|
| P0 | 診斷 + 本計畫 | `improvement.md` ✅ | iteration 1（已完成） |
| P1 | **修破圖** ✅：新增 `scripts/enrichDemoThumbnails.js`（`npm run ttd:thumbs`），自 DIA API 抓 `asset_file_thumbnail` 寫入 `media_refs.thumbnail_url`，App.tsx 改用縮圖；瀏覽器實測影像庫 6/6、原作詳情 1/1 全部正常載入、0 破圖 | 可顯示真圖的影像庫 | iteration 2（已完成） |
| P2 | **文案 / 架構改造**：四步主流程 IA、移除黑話與內部標籤、全中文（保留 en 切換） | 客戶級 UI | iteration 3 |
| P3 | **真實比對**（路線 A）：前端感知雜湊即時比對 + 原作 vs 疑似來源並排 | 可互動 demo | iteration 3 / 後續 PR |
| P4 | 驗收：lint / build / 瀏覽器煙霧測試 / 部署 PR | 通過驗收的 PR | iteration 3 / 後續 PR |

### P2 進度 + i18n 重整紀錄（2026-06-25, iteration 3）

⚠️ 重大發現：本工作分支 `omni/4ef90e87/numbers-website` 的 `App.tsx` 是 **i18n 之前** 的版本（908 行），但 production `main`（PR #408）已含 i18n（1418 行）且仍是破圖（用被 redact 的 `snapshot_url_ref`）。若直接以本分支開 PR，會把 production 的 en/zh-TW 切換 **退回**。

處置（已完成並驗證）：

- 採用 `origin/main` 的 i18n `App.tsx` 作為基底（保住 production 的語系切換），再把 iteration 2 的縮圖修法重新套上（`media_refs.thumbnail_url` + 影像庫/原作詳情 `<img>` 優先使用縮圖）。結果 = i18n + 修好破圖 的「超集」，PR diff 只新增縮圖與資料，不會退回 i18n。
- 客戶級文案清理（en + zh-TW 同步）：移除 `TTD MVP` 內部代號、`seven-screen flow / 七段展示流程`、footer 的 `Phase 6 artifact-backed local demo / 模擬案件不計入市場驗證`；header 改為一句話價值主張（建立數位指紋 → 指定通路巡檢 → 自動警報 → 存證報告）；section 標題去黑話（如 `Local index / similarity result` → 影像相似度比對；`... / metadata / provenance` → 受保護原作與來源證明）。
- 驗證：`npm run lint` 乾淨、`npm run build:pages` 成功（CSS hash `index-sP9ZiUek.css` 與 production i18n 一致）、瀏覽器實測：影像 6/6 載入 0 破圖、EN/繁中切換正常（`localStorage=ttd-mvp-locale`）、頁面已無 `Phase 6 / seven-screen / TTD MVP` 字樣。

### 2026-06-25（整頁產品化調整完成）

本輪依照 `improvement.md` 重新檢查整個 MVP 頁面，補齊上一輪仍殘留的「工程驗收頁」問題，並把可見 UI、dashboard 公開資料與瀏覽器視覺驗證同步收斂到客戶展示狀態。

- **首屏產品化完成**：
  - 首屏加入四步流程概覽：原創入庫 → 通路巡檢 → 警報分流 → 存證交付。
  - Header 右側不再顯示 route / monitoring wording，改為「目前保護狀態、保護流程、巡檢範圍」。
  - 首屏 KPI 從 9 張工程指標卡收斂為 5 張關鍵指標卡，讓 5 秒內能理解「這頁在做什麼」。

- **可見文案再清理完成**：
  - `App.tsx` 已移除畫面上的 `Hamming`、`aHash`、`dHash`、`C2PA`、`fixture`、`smoke test`、`specified-source`、`渠道`、`全網` 等殘留詞。
  - 互動掃描器改名為「數位指紋即時盜用辨識」，技術輸出改成「指紋碼、相似度、特徵差距、原創憑證狀態」。
  - 監測頁不再直接顯示 `run_mode`，改用「待人工複審、搜尋候選中、示範警報演練」等展示用狀態。

- **公開資料層清理完成**：
  - `buildImpactDashboard.js` 已將 `dashboard-metrics.json` 的 metrics、screens、limitations、Taiwan Mobile value 改成客戶/AI-agent 可讀語言。
  - `dashboard-metrics.json` 的 `report_sections` 不再直接 spread 原始內部欄位，而是輸出白名單公開版：疑似來源、相似度、人工複審、示範案例與限制說明。
  - 移除 `p0_assets_to_sign` 額外顯示指標，避免 `TBD` 佇列出現在成效頁。

- **繁中文字型修復完成**：
  - `index.css` 新增 zh-TW 專用 CJK webfont fallback；`App.tsx` 在 `<main>` 設定 `lang={locale}`。
  - 瀏覽器截圖確認繁中不再顯示成方塊；英文版仍優先使用品牌字體 stack。

- **驗證結果**：
  - `npm run ttd:dashboard` 通過，輸出 `metric_count=9`、`protected_originals=4329`、`monitored_sources=14`、`suspected_events=0`、`evidence_reports=1`、`tool_spend_twd=0`。
  - `npm run lint` 通過。
  - `npm run build:pages` 通過，並同步至 `docs/static/ttd-mvp`。
  - Browser smoke：STEP 01-05 全部可切換；禁用詞檢查 0；破圖數 0；繁中與英文切換正常。
  - 互動掃描器 B 情境驗證：顯示 98.44% 相似度、特徵差距 2、原創憑證遺失警示；禁用詞 0、破圖 0。

### 未來展望（下一步藍圖）

1. **路線 B/C（自動化後端巡檢）**：與 Sofia 進一步確認期望常態巡檢之公開通路平台（如 Instagram、X、淘寶等）與相關 API 費用成本（目前付費額為 NT$0）。
2. **與 PyroImage 原生 API 雙向對接**：未來直接從 production API 自動同步最新原創著作入庫。

### P1 修復紀錄（2026-06-25, iteration 2）

- 新檔 `ttd-mvp/scripts/enrichDemoThumbnails.js` + npm script `ttd:thumbs`：對 `demo-assets.json` 前 48 筆，呼叫 `GET dia-backend.numbersprotocol.io/api/v3/assets/{id}/`，取 `asset_file_thumbnail`（長效簽章，保留 query string）寫入 `media_refs.thumbnail_url`，並輸出 `demo-thumbnail-enrichment.json`（48/48 成功、0 失敗、NT$0）。
- `App.tsx`：`DemoAsset.media_refs` 新增 `thumbnail_url`；影像庫與原作詳情的 `<img src>` 改為優先用 `thumbnail_url`。
- 驗證：`npm run lint` 乾淨、`npm run build:pages` 成功、`docs/static/ttd-mvp/demo-assets.json` 同步 48 筆縮圖；本地 server + 瀏覽器實測 0 破圖。

> 路線 A 已完成；路線 B/C 需要後端排程或外部通路/API 授權，不在本靜態頁面內假裝已完成。

---

## 7. 風險與取捨

- **誠實標示 vs 賣相**：demo 案例仍須標「示範」，避免讓導師誤以為已有大量真實盜用命中。
- **靜態架構限制**：全自動跨平台巡檢需後端 / 排程，7/9 前以路線 A（前端真實比對）作為「能用」的證明。
- **付費 API**：任何反向圖搜付費服務需 Sofia 事前核准（維持 NT$0 原則）。
- **簽章效期**：縮圖簽章雖長效（~2126），原圖簽章短效；UI 一律用縮圖避免再次破圖。

---

## 8. 下一步（本輪之後）

1. 與 Sofia 確認路線 B/C 的巡檢通路清單、授權方式與成本上限。
2. 評估是否用 GitHub Actions cron 產生真實候選警報，再寫回 `alerts.json` 形成靜態前端可讀資料流。
3. 規劃 PyroImage production API 的新原創影像同步策略，避免目前 demo seed 需要手動刷新。

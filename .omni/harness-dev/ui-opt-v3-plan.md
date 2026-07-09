# UI Optimisation v3 — 「原創偵測產品」重塑 + 改名 OriginRadar

Author: Lary (harness-dev Developer). Approved by Sofia 2026-07-09:
(a) 產品名照建議 = 原創雷達 / OriginRadar;(b) P0–P2 一次做完;照 harness-dev 實作。

Reference mockup: `.omni/uploads/Numbers 原創影像主動防護.html`(dc-runtime bundle,
設計元件 runtime 遠端載入無法離線完整還原;結構 = dark console topbar + nav rail +
dashboard/alerts/case/vault/channels/reports + cert modal + toast)。

Scope: 純前端 `src/App.tsx` + `index.html`。不動 backend、JSON 契約、巡檢 script。
與 PR #1/#3/#5/#6 相同做法。

---

## 現況診斷(為何不夠像偵測產品)
1. 首屏流程導向,非結果導向(dashboard 先看說明文 + 四步驟卡 + KPI)。
2. 「金畫面」原作 vs 疑似盜用並排比對藏在 case view 深處。
3. 偵測動作(巡檢)只是 topbar 小按鈕,沒有存在感。
4. 命名冗長無記憶點(原創影像主動防護 / Original-Image Protection)。
5. demo/示範 hedging 過多稀釋專業感。

## 命名決定
- 產品名:`原創雷達 / OriginRadar`(雷達=主動掃描偵測,好記、可當 logotype)。
- 副標:`原創影像盜用偵測 · Powered by Numbers`。
- 標語 `HUMAN TRUTH. MACHINE PROOF.` 不變(Space 硬規則)。

## P0 — 一眼就是原創偵測產品
- 改名:`T.brand`、`T.brandSub`(改 locale 物件 + 更新 render)、onboarding H2、
  dashboard hero title、`index.html` <title>/<meta>。
- 偵測狀態 hero:dashboard 開頭改「即時偵測狀態列」(監控中 N 原創 · 最近掃描 Y 來源/候選 ·
  疑似 Z 待複審 · 真實侵權 0)+ 明顯掃描 CTA;KPI 上移到偵測數字優先;四步驟卡降級。
- 金畫面上移:dashboard「最新偵測」卡顯示原作↔候選縮圖 + 相似度;0 命中時顯示能力預覽並標示。

## P1 — 資訊架構與導覽
- Nav 重排偵測動線:總覽 → 疑似盜用 → 原創庫 → 監控通路 → 存證報告 → 原創查驗。
- KPI 精煉,偵測相關數字優先。
- 原創查驗定位(PR #6 已澄清,維持並微調 nav 描述)。

## P2 — 視覺與語氣
- 掃描視覺:沿用 ScanOverlay + ttd-pulse,強化 dashboard 掃描 CTA。
- demo 語氣收斂:topbar badge / case action bar 統一「MVP 試營運 · 安全示範」一句。
- 品牌一致:字型 Roboto Mono / Instrument Sans、品牌色、標語不變。

## 驗證
- `npm run lint`、`npm run build:pages`、vite preview base `./` browser smoke
  (0 破圖 / 0 snake_case 外露 / EN 切換 / 無 Taiwan Mobile / 掃描+導覽可用)。

## 交付
- 分支 `feat/ui-opt-v3-originradar`(from origin/main),開 PR,人工 merge。
- Reviewer sub-loop claude-opus-4-7 審查。

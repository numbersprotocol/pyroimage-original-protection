# APPROVED (by Sofia via conversation on 2026-07-09)

## Original Request
「參考 mockup,UI 還是不清楚,調整成更像一個原創偵測產品,名稱也調整成好記的名稱,先給計畫。」
→ Sofia 核准:(a) 產品名 = 原創雷達 / OriginRadar;(b) P0–P2 一次做完;照 harness-dev 實作。

## Objective
把 PyroImage 原創影像主動防護 MVP 的前端重塑成「一眼就是原創偵測產品」,並改成好記的產品名
`原創雷達 / OriginRadar`。純前端(`src/App.tsx` + `index.html`),不動 backend/JSON 契約/巡檢 script。

## Scope
See `.omni/harness-dev/ui-opt-v3-plan.md` for the full P0/P1/P2 breakdown.

## Repository
- numbersprotocol/pyroimage-original-protection
- Branch: feat/ui-opt-v3-originradar (from origin/main @ 1cd843c)
- Deploy: ci-on-merge (Deploy Pages), human merges.

## Acceptance Criteria
- 產品全站更名為 原創雷達 / OriginRadar(topbar/onboarding/hero/title/meta),標語不變。
- Dashboard 首屏偵測結果導向(狀態列 + 掃描 CTA + 金畫面/最新偵測 + KPI 偵測優先)。
- Nav 依偵測動線重排。
- demo 語氣收斂但保留誠實邊界(真實侵權 0、安全示範)。
- lint + build:pages 綠;browser smoke 全過(0 破圖 / 無 Taiwan Mobile / 無 snake_case 外露)。

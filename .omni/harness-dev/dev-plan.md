# Development Plan — UI Optimisation v3 (OriginRadar)

Generated from plans.md on 2026-07-09

## Scoring Criteria (Max 5 Points)

| # | Criterion | Description | Points |
|---|-----------|-------------|--------|
| 1 | Rename complete | 全站更名 原創雷達/OriginRadar(topbar/onboarding/hero/title/meta),標語 HUMAN TRUTH. MACHINE PROOF. 不變 | 1 |
| 2 | Detection-first dashboard | 首屏偵測結果導向:狀態列 + 掃描 CTA + 最新偵測金畫面 + KPI 偵測優先;四步驟卡降級 | 1 |
| 3 | IA + honesty preserved | Nav 依偵測動線重排;真實侵權 0 / 安全示範邊界保留;無誤導文案 | 1 |
| 4 | Code quality / no regression | 純前端單檔;JSON 契約/backend/巡檢 script 未動;無 hardcoded secret;無 snake_case 外露;無 Taiwan Mobile | 1 |
| 5 | CI pipeline green | lint + build:pages 綠;browser smoke 全過;PR 開啟待人工 merge | 1 |

Approved by: Sofia via conversation on 2026-07-09 (criteria derived from plans.md).

## Project Config
- Deploy mode: ci-on-merge
- Deploy target: GitHub Pages (Deploy Pages workflow)
- Production URL: https://upgraded-adventure-r2go1ky.pages.github.io/ (private)
- Preview URL: local vite preview (base `./`)
- CI workflow: .github/workflows/deploy-pages.yml
- Test strategy: agent browser on vite preview + lint + build:pages
- Repository: pyroimage-original-protection, branch feat/ui-opt-v3-originradar

### Infrastructure Dependencies
None (pure frontend, no new external deps).

## Phase 1: P0 — Rename + detection-first hero + money-shot
### Sprint Contract
- **What will be built**: brand rename to OriginRadar across App.tsx + index.html; dashboard hero reframed detection-first (status strip, scan CTA, KPI-first, latest-detection comparison surfaced); onboarding heading updated.
- **Acceptance criteria**:
  - [ ] All product-name surfaces show 原創雷達 / OriginRadar; tagline unchanged
  - [ ] Dashboard leads with detection status + scan CTA + latest-detection card
  - [ ] index.html title/meta renamed
- **Status**: IN PROGRESS

## Phase 2: P1 — IA reorder + KPI refine + verify positioning
### Sprint Contract
- **What will be built**: nav order to detection narrative; KPI order detection-first; verify nav desc tweak.
- **Acceptance criteria**:
  - [ ] Nav order = 總覽 → 疑似盜用 → 原創庫 → 監控通路 → 存證報告 → 原創查驗
  - [ ] KPI leads with detection numbers
- **Status**: PENDING

## Phase 3: P2 — Scan visual + demo-tone consolidation + brand consistency
### Sprint Contract
- **What will be built**: strengthen scan CTA; consolidate demo/示範 wording to one honest line; keep fonts/colors/tagline compliant.
- **Acceptance criteria**:
  - [ ] Demo wording consolidated, honesty boundary intact
  - [ ] lint + build:pages green; browser smoke pass
- **Status**: PENDING

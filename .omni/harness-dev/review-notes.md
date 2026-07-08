# Review Notes — UI Optimization v2

## Review: Phase 1 — 2026-07-08 — Reviewer (claude-opus-4-7)

### Score: 5 / 5

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | P0 done: 查驗範例升主／輸入降級／nav 承諾精準／正向提示 + 歡迎彈窗現況一行且四步不重複 | 1 | src/App.tsx L1708 `PRIMARY action` 註釋、L1710 「範例查驗 · 點一下試跑」置於 L1743 「或手動輸入」之上；L382 nav `descZh: "查驗已收錄的原創（示範）"`；L1764 正向 unsupported 文案「示範版目前只認得已收錄的樣本…正式版可查驗任意圖片」；L1029–1032 OnboardingOverlay 新增 `channelsDisplay`+`suspectedActual` props；L1065–1067 三格現況快照（受保護原創/真實侵權/監控通路）；overlay 用 `flowLabels.map` (L1138) 精簡單行 vs dashboard `steps.map` (L1412) 可點四步 — 兩者互補不重複。 |
| 2 | P1 done: 信任錨 + 用戶關心 KPI + 白話巡檢狀態(無 raw adapter/dry_run) + 報告可驗證 + dashboard 主 CTA | 1 | L356 `brandSub: "由 Numbers 提供 · 來源巡檢"`；L1102 overlay「由 Numbers 提供 · 存證可上鏈驗證、可交付法務」；L1066/1350/1353 真實侵權 KPI 與 honesty 文案；L1386 巡檢中繼「巡檢模式：試跑示範（不計費）」（無 patrolAdapter/dry_run raw string）；L2399 `可驗證` 取代 hash 顯示；L2407 `匯出（示範）`；L965/1408 dashboard `執行一次巡檢` CTA 已 wire 到 `runPatrol()`。 |
| 3 | P2 done: 移除英文/程式碼外露 + 專業詞白話 + 卡片雜訊收斂 | 1 | L1548 `verdictCodeText` 與 L1564 `evidenceLabelText` helpers 建立；zh 對照表覆蓋 JSON 中所有 10 個 `evidence_label` 值（`actual`, `sample`, `simulated`, `simulated_fixture`, `actual_index_match`, `actual_controlled_transform`, `controlled_non_original`, `actual_source_configuration_pending_review`, `actual_pending_review`, `target`）；L528–531 timeline zh 已無 `SEALED/FINGERPRINTED/DETECTED/PENDING REVIEW` 尾綴；ALLCAPS `LATEST DETECTIONS`/`CHANNEL STATUS` 用 `!zh &&` 包住只對 EN 顯示；`combined distance` 與 `Fixture check` 僅在 EN 分支；vault 卡片指紋改「點看原創憑證 →」；判定線 → 判定門檻；公開主張 CLAIM → 對外宣稱狀態。 |
| 4 | 無回歸: 僅 src/App.tsx 改動; JSON/script 未動; EN/繁中雙語; 0 破圖; honesty/demo 標示保留 | 1 | `git diff origin/main...origin/feat/ui-opt-v2-p0p1p2 --stat` 顯示唯一改動為 `src/App.tsx +200/-107`；`public/`、`scripts/`、`*.json`、`*.yml` diff 為空 — 資料契約與巡檢 script 完全未動；L1122–1128 demo notice、L1391–1394 honesty banner 保留；Developer browser smoke 已於 vite preview 驗過 0 broken images / EN 切換 / 無 Taiwan Mobile 字樣。 |
| 5 | 交付: lint + build:pages 綠; PR 開好 targeting main (ci-on-merge, 人工 merge) | 1 | Reviewer 本輪獨立重跑 `npm run lint` = 0 warnings/errors；`npm run build:pages` 成功（tsc + vite build，dist 268.68 kB gzip 83.09 kB）；tsc 的 `noUnusedLocals` 綠代表新增 helper/prop 均有用；`gh pr view 3` = OPEN / isDraft=false / MERGEABLE / base=main / head=feat/ui-opt-v2-p0p1p2 / headRefOid=df3de4a。 |

### Verdict: PASS (5/5)

### Blocking Issues
(none)

### Independent Verification Evidence

- 分支：本地 `omni/4ef90e87/harness-dev-p0-p1-p2` 內含 Developer commit `df3de4a`，與 remote `origin/feat/ui-opt-v2-p0p1p2` 同源；PR head SHA 一致。
- Diff sanity：`git diff --stat origin/main...origin/feat/ui-opt-v2-p0p1p2` 只出現 `src/App.tsx | 307 ++++...` 單一檔；沒有 JSON/YAML/script 變動。
- Grep sanity：
  - `grep 'query.verdict.code}'` 命中 0（原始 snake_case 未直接 render）；改由 `verdictCodeText(query.verdict.code, locale)` (L1734)。
  - 所有 10 個 `evidence_label` 值皆有 zh 對照，無殘留 snake_case。
  - Timeline zh 分支已無 `SEALED / FINGERPRINTED / DETECTED / PENDING REVIEW / DISMISSED` 尾綴。
  - `LATEST DETECTIONS` / `CHANNEL STATUS` 大寫字樣包在 `{!zh && (...)}`，繁中頁不顯示。
- 工具鏈：`npm run lint` 通過；`npm run build:pages` 產出 `dist/assets/index-BQfrqSdk.js` 268.68 kB / gzip 83.09 kB，無 tsc 錯誤。
- PR：`https://github.com/numbersprotocol/pyroimage-original-protection/pull/3` OPEN / MERGEABLE / base main。

### Non-Blocking Suggestions

1. `DashboardView` 仍接收 `patrolAdapter` / `patrolStatus` props（App.tsx L954–955 傳入、L1327–1328 型別）但主體已不 render；未來一輪可移除 props 讓型別更誠實（tsc 不會擋，因 `noUnusedLocals` 不判 prop）。
2. Verify V3 KPI EN sub 保留 `combined distance`（L1692）— 可考慮改為「Combined distance」句首大寫更像人話。
3. Case 詳情底部行動列的 `NT$0`（L1786 verify Cost row）對海外使用者可補「TWD」單位，非阻斷。
4. 未來若加更多 `evidence_label` 值，記得同步更新 `evidenceLabelText` zh/en 對照表，否則會 fallback 到 `label.replaceAll("_", " ")` 又回到 snake_case 觀感。
5. Cert modal 打開時的 `role="dialog"` a11y 可再補 `aria-labelledby` 綁到標題（P0 phase 已加 overlay，這個是延伸打磨）。

### Delivery Status

- Phase 1 已 COMPLETED，Reviewer PASS 5/5。
- PR #3 保留 OPEN / MERGEABLE，**等 Sofia 人工 merge 到 `main`**（ci-on-merge，`deploy-pages.yml` 觸發實際上線）。
- 依 harness-dev SOP，Reviewer sub-loop（`max_iterations=1`）任務結束；主 Developer loop 下一輪可決定是否啟 QA sub-loop（合併後對 Pages URL 做 agent-browser 驗收）。

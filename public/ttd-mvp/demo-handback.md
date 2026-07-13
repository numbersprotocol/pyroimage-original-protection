# PyroImage 原創影像主動防護 QA 與 PM Handback

Generated at: 2026-07-13T04:38:18.807Z

## Demo Target

- Demo route: `/pyroimage-original-protection`
- Local demo URL: `http://127.0.0.1:4173/pyroimage-original-protection`
- App directory: `pyroimage-original-protection`
- Auth: N/A；MVP 使用 local/static demo data，沒有登入需求。
- Stable data mode: 所有 MVP screens 讀取 static artifacts；錄影不需要 unstable live crawling。
- Public artifact checks: `/pyroimage-original-protection/ttd-mvp/dashboard-metrics.json`, `/pyroimage-original-protection/ttd-mvp/dashboard-validation.json`, `/pyroimage-original-protection/ttd-mvp/verification-fixtures.json`, `/pyroimage-original-protection/ttd-mvp/verification-validation.json`, `/pyroimage-original-protection/ttd-mvp/demo-handback.json`, `/pyroimage-original-protection/ttd-mvp/demo-validation.json`

## Local Runbook

1. 進入 `pyroimage-original-protection`。
2. 執行 `npm run ttd:handback` 重新產生 handback artifacts。
3. 執行 `npm run lint`。
4. 執行 `npm run build:pages`。
5. 執行 `npm run dev -- --host 127.0.0.1 --port 4173`，再開啟 `http://127.0.0.1:4173/pyroimage-original-protection`。

## Completed Phase Summary

| Phase | Title | Status | Summary |
|---|---|---|---|
| Phase 1 | Data ingestion and validation | COMPLETED | 4,329 actual originals and 300-row demo sample are parsed and sanitized. |
| Phase 2 | Local image index and similarity smoke test | COMPLETED | 300 demo rows are indexed; 10 self-match checks and one controlled transform check pass. |
| Phase 3 | Automated patrol metadata | COMPLETED | Designated channels and the latest real patrol run metadata are represented without unsafe crawling. |
| Phase 4 | Real alert workflow | COMPLETED | Fetched-hash matches become pending-review alerts; no-match runs remain honest zero states. |
| Phase 5 | Evidence report | COMPLETED | Actual pending-review evidence is packaged with source URL, similarity, run metadata, and limitations. |
| Phase 6 | Origin verification portal | COMPLETED | Known original, transformed original, and non-original verdict paths are validated locally at zero paid API cost. |

## Metrics Snapshot

| Metric | Value | Label | Note |
|---|---:|---|---|
| protected_originals | 4,329 | Verified data | PyroImage public original assets covered by the protection workflow. |
| demo_seed_rows | 300 | Indexed Samples | Selected originals indexed for live visual matching and verification. |
| c2pa_signed_assets | 16 | Origin Certificate Active | Original works with verifiable origin certificates for authenticity review. |
| monitored_sources | 14 | Configured Channels | Designated platforms and channels configured for compliant patrol. |
| demo_monitored_sources | 5 | Active Patrols | Priority channels currently included in the live demonstration workflow. |
| suspected_events | 0 | Real Incidents | Human-reviewed real incidents. Demonstration alerts are excluded from this count. |
| evidence_reports | 0 | Review Package | Review-ready origin and suspected-copy packages for brand or legal teams. |
| partner_feedback | 0 | Outreach Integration Pending | Direct integration with co-branded partners. Currently setting up communication channels. |
| tool_spend_twd | 0 | Budget Guarded | Budget-guarded Vision patrol ran for this MVP. Free-tier usage can still keep actual spend at 0. |

## 5-Minute Recording Flow

| Timebox | Screen | Talk track | Proof point |
|---|---|---|---|
| 0:00-0:25 | PyroImage original library | 先建立 baseline：PyroImage public originals 有 4,329 筆 actual records，demo 不是憑空樣本。 | 4,329 originals parsed |
| 0:25-0:55 | Protected asset detail / metadata / provenance | 打開單一 protected original，展示 creator、owner、C2PA/provenance 與 certificate link。 | protected asset bafybeigzo5rkfshhubaazvw2xsvruskzrglb3gefyjtln3w3r4crhufmwm |
| 0:55-1:30 | Visual fingerprint matching | 說明本機 aHash+dHash 指紋比對與門檻，顯示 self-match 與受控轉檔仍能命中。 | 300 indexed rows |
| 1:30-2:05 | designated-channel patrol | 切到巡檢資料，說明最新 run 由 adapter 寫入 metadata；缺 Vision secret 時不會花費，仍能保持 dry-run/seed-safe。 | 14 configured sources |
| 2:05-2:40 | pending-review alert | 展示警報只來自真實抓取候選影像與感知雜湊命中；仍是 internal-only，需人工確認授權與來源脈絡。 | 0 alert / real_hash_match=true |
| 2:40-3:20 | Evidence report | 展示 report section：protected original、candidate use、match explanation、run metadata、review state、public-use label 與 limitations。 | 0 report / adapter visionWebDetection+namedChannelCrawler |
| 3:20-4:20 | Origin verification portal | 切到貼圖查驗，輸入 known original、controlled transform、non-original control，確認 verdict 不捏造外部結果。 | 3 queries / PASS |
| 4:20-5:00 | PM close and next work | 收斂 PM 待辦：補上 Actions Vision secret、合併 PR 後跑 ttd-patrol dispatch，並安排 production QA。 | stable static MVP; no paid API unless budget-gated Vision is explicitly enabled |

## QA-Ready Checklist

- Desktop viewport: open /pyroimage-original-protection, confirm seven navigation screens switch without blank content.
- Mobile viewport: open /pyroimage-original-protection, confirm controls remain usable and text does not overlap.
- Confirm /pyroimage-original-protection/ttd-mvp/dashboard-metrics.json and /pyroimage-original-protection/ttd-mvp/demo-validation.json are readable from the same local origin.
- Confirm labels distinguish actual patrol output, indexed samples, controlled verification checks, target, and TBD.
- Confirm designated-channel patrol and pending-review alert wording remain visible.
- Confirm verification portal returns registered-original, transformed-match, and not-registered verdicts.
- Confirm no paid API is required and cost-log.csv remains header-only.

## Known Limitations

- Designated-channel patrol is bounded by configured sources, adapter availability, and platform rules; it is not an unrestricted crawler.
- 目前 seed adapter 的 pending-review alert 只證明 real fetch/hash pipeline；外部侵權主張仍需 Vision 或授權通路與人工複審。
- suspected_events 仍為 0 actual until real case exists。
- partner_feedback 仍為 0 actual / outreach pending。
- Origin verification supports review workflows but does not replace brand-owner authorization checks.
- 目前沒有預設啟用付費 API；Vision billable path 需 GH secret + 明確 billable flag + budget guard。
- 任何公開對外說法仍需 PM/法務/partner human review 後再定稿。

## Remaining PM-Owned Work

- 挑選可公開展示的 P0 visual assets，並確認是否需要補簽 C2PA / proof layer。
- 完成 EV-002 到 EV-005 partner outreach 或改成明確的 pipeline status。
- 若要宣稱外部實際案例，需補上 human-reviewed source evidence；否則維持 internal-only / pending-review 標籤。
- 更新簡報與 5 分鐘錄影腳本，保持 actual/sample/controlled-check/TBD 標籤。
- 合併後執行 PyroImage Patrol workflow_dispatch，並確認 production /pyroimage-original-protection/ 顯示最新真實巡檢與查驗輸出。

## Guardrails

- Monitoring wording stays as `designated-channel patrol`.
- Alert wording stays as `pending-review alert`.
- Origin verification supports review only; it does not replace authorization checks.
- Controlled checks and internal-only alerts stay excluded from market validation.
- Paid APIs remain disabled by default; current tool spend is NT$0.

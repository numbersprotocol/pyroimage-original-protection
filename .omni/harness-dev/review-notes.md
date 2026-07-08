# Review Notes — PyroImage MVP Real Patrol Guardrail Fix

Repo: `numbersprotocol/pyroimage-original-protection`
PR under review: **#5** — <https://github.com/numbersprotocol/pyroimage-original-protection/pull/5>
Head SHA: `4be1d4a91c46273f16abe654041d63360dc7f11b` (branch `omni/4ef90e87/real-patrol-mvp`)
Base: `main` @ `c078506`
Reviewer: `claude-opus-4-7` (context-reset sub-loop `19fecc29-6c60-4d89-9b86-3ffad9fb2b08`)
Reviewed at: 2026-07-08

---

## Verdict: PASS 5/5

Sofia's requirement is met: the MVP is now presented as a real background-patrol product (not a blanket "示範環境"), the dashboard/report/patrol validators actually accept the real budget-guarded Vision 0-alert run instead of being pinned to the earlier "no paid API" gate, and the safe UI-only actions (下架/匯出/聯絡) are still honestly labelled as demonstrations. No guardrail was silently loosened: the paid-API path is now gated on `budget_guard_respected` instead of `paid_api_disabled_and_unused`, which is the correct semantic upgrade — not a bypass. The successful Vision run committed by GitHub Actions run `28928108034` reproduces cleanly.

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1 | `buildImpactDashboard.js` accepts real 0-alert Vision patrol without loosening guardrails | PASS | `scripts/buildImpactDashboard.js:144-152, 172-176, 495-503`; `dashboard-validation.json:pass.patrol_output_not_market_validation=true, paid_api_budget_policy_respected=true` |
| 2 | `perceptualHash.js` signed-query redaction covers Vision-side `x-expires`/`x-signature`/`x-key-pair-id`/`x-policy` without breaking normal URLs | PASS | `scripts/lib/perceptualHash.js:162-186`; unit-tested locally on 8 URL shapes (see below) |
| 3 | `App.tsx` wording accurately expresses "背景巡檢真實運作；UI 下架/匯出/聯絡仍為安全示範" | PASS | `src/App.tsx:363, 707-711, 794-806, 835-844, 1141-1147, 1349, 1400-1408, 1424, 1466, 2318-2327`; residual "示範" only on takedown/report/archive/contact/verify-fixture/demo-case scope |
| 4 | Public artifacts match a successful budget-guarded Vision run | PASS | `public/ttd-mvp/monitoring-run.json`: `adapter.id=visionWebDetection, mode=vision_web_detection_budget_guarded, paid_api_used=true, budget_guard_respected=true, run_scope.candidates_attempted=8, run_scope.alerts_created=0`; `patrol-validation.json:pass.all=true`, `budget_guard_respected=true`; `dashboard-validation.json:actual.paid_api_used=true, budget_policy_respected=true` |
| 5 | Verification is sufficient (local seed + Vision, lint, build, dashboard, real Actions run) | PASS | GH Actions run `28928108034` (`PyroImage Patrol`) on head `3f1b6442`, `conclusion=success` including validate + signed-query scan + commit steps (artifact commit is `4be1d4a`); reviewer independently re-ran `npm run lint`, `npm run build:pages`, `npm run ttd:dashboard`, and the workflow's signed-query scan — all clean |

---

## Independent evidence collected in this review

### 5.1 Diff scope vs `main`
21 files changed, +496 / −446. Code changes are limited to three files: `scripts/buildImpactDashboard.js`, `scripts/lib/perceptualHash.js`, `src/App.tsx`. All other diffs are patrol artifacts (`.patrol-state/*`, `public/ttd-mvp/*`) or the cache/monitoring output written by the successful workflow run.

### 5.2 `scripts/buildImpactDashboard.js` — is the guardrail relaxed or upgraded?

Old check (base):

```js
paid_api_disabled_and_unused: cost.paid_api_used === false && cost.tool_spend_twd === 0,
simulated_cases_not_market_validation:
  reportSections.public_use_label?.counts_toward_market_validation === false &&
  alertActual.suspected_events_actual === 0,
```

New check (PR):

```js
const paidApiUsed = cost.paid_api_used || reportActual.paid_api_used === true || alertActual.paid_api_used === true;
const budgetPolicyRespected = reportActual.budget_guard_respected !== false;
...
patrol_output_not_market_validation: patrolOutputNotMarketValidation({...}),  // scoped honest-zero acceptance
paid_api_budget_policy_respected: !paidApiUsed || budgetPolicyRespected,
```

- The paid-API gate is now "when the paid API was used, the budget guard must have been respected." This is a semantic upgrade: previously the check would reject any real Vision run outright; now it accepts a Vision run **only if** the run reported `budget_guard_respected` was not `false`. The path that would silently pass without the guard (a scripted attacker returning no `budget_guard_respected` field) is discussed in F1 below as a non-blocking follow-up.
- `patrolOutputNotMarketValidation` requires the exact empty-state reason `"latest_patrol_created_no_alerts"` for 0-report acceptance. It cannot be satisfied by an empty `reports: []` on its own — an attacker can't just delete the reports array and pass. The `suspectedEventsActual === 0` clause also still holds.
- `limitations` still asserts either "Paid APIs remain disabled by default." or "Paid Vision calls are allowed only through the budget-guarded workflow path." — the message is truthful for either mode.

### 5.3 `scripts/lib/perceptualHash.js` — signed-query redaction

Unit-tested locally with a throwaway ESM script (importing `redactSignedQueryInText` directly). All eight shapes behave correctly:

```
X-Expires=…&X-Signature=…            → redacted   (new)
Expires=…&Signature=…                → redacted   (existing)
resize=1280                          → preserved  (correct)
w=1200&h=1200&s=1                    → preserved  (correct)
utm_source=…&utm_campaign=…          → preserved  (correct)
X-Amz-Signature=…                    → redacted   (existing)
X-Policy=…                           → redacted   (new)
X-Key-Pair-Id=…                      → redacted   (new)
```

Vision-returned URLs in the committed cache all look like `?resize=…`, `?w=…&h=…&s=…`, or bare — none are actually signed. But `.patrol-state/vision-web-detection-cache.json` also stores the raw `visuallySimilarImages` URLs through the same redactor, so future CDN CloudFront-style signed URLs would be caught by the new `x-*` keys.

The workflow-side regex (`.github/workflows/ttd-patrol.yml:159`) uses `-i` case-insensitive matching on `Expires=|Signature=|Key-Pair-Id|X-Amz-|Policy=`. Because `X-Expires=` is a superstring of `Expires=`, this workflow grep already catches the new x-* variants without any workflow change required.

### 5.4 `src/App.tsx` — wording boundary

`grep -c '示範環境' src/App.tsx` = 0 and `grep -c 'Demo environment' src/App.tsx` = 0.

Remaining "示範/demo" mentions are correctly scoped to UI-only actions:

- **Topbar badge title (line 840)**: "MVP 試營運：背景巡檢讀取真實 patrol artifact；頁面上的下架、匯出、聯絡操作仍為安全示範"
- **Onboarding overlay (line 1146)**: "這是 MVP 試營運版：背景巡檢會由 GitHub Actions 產生真實巡檢產物；頁面上的下架、匯出、聯絡等操作仍為安全示範…"
- **Toast on scan (lines 707-711)**: "已播放最近巡檢流程：未發現新的真實侵權" (no false claim of running new patrol)
- **Buttons throughout**: "執行巡檢/Run patrol" → "查看最近巡檢/Review latest patrol" (correct — the static SPA cannot dispatch GitHub Actions from the browser)
- **Dashboard KPI 03 hint (line 1466)**: "…最新巡檢產物為 0" (not "示範資料為 0")
- **Dashboard patrol strip (line 1405)**: uses new `patrolModeLabel` which reports the actual adapter mode from `monitoring-run.json`, e.g. "巡檢模式：Vision 真實巡檢（預算控管）"
- **Channels view hint (line 2318)**: explicitly clarifies "不會從瀏覽器直接啟動 GitHub Actions"

Residual `(示範)` labels are only on: DMCA takedown / evidence-report generation / archive / contact / export toast strings, the Verify nav description ("查驗已收錄的原創（示範）"), and the demo-case fixture badge — all correctly scoped to UI-only demonstration surfaces.

### 5.5 Public artifacts consistency

`public/ttd-mvp/monitoring-run.json`:

- `adapter.id = visionWebDetection`
- `adapter.mode = vision_web_detection_budget_guarded`
- `adapter.paid_api_used = true`
- `adapter.billable_enabled = true`
- `adapter.dry_run = false`
- `adapter.budget_guard_respected = true`
- `adapter.details.budget_within_cap = true`
- `adapter.details.all_calls_allowed = true`
- `adapter.details.api_requests = 1`, `cache_hits = 0`, `blocked_by_budget = 0`
- `adapter.details.cost_summary.stop_at_ntd = 900` (90% of NT$1000 cap enforced)
- `run_scope.candidates_attempted = 8`
- `run_scope.alerts_created = 0`
- `run_scope.match_threshold = 16`
- `status = completed_with_candidate_errors` (external CDN 403 / HTML content-type / oversize — expected, tracked as warnings in `patrol-validation.json`)

`patrol-validation.json`: `pass.all = true`, `budget_guard_respected = true`, `paid_api_policy_respected = true`, `signed_query_strings_written_to_artifacts = false`.

`report-validation.json`: `pass` object all true, including `empty_state_when_no_alerts = true` and `paid_api_policy_respected = true`; `actual.paid_api_used = true, budget_guard_respected = true, empty_state_reason = latest_patrol_created_no_alerts`.

`evidence-report.json`: `report_count = 0`, `empty_state.reason = latest_patrol_created_no_alerts`, `empty_state.adapter_id = visionWebDetection`. Honest zero, not a fabricated report.

`dashboard-validation.json`: `actual.paid_api_used = true, budget_policy_respected = true`; all 11 `pass` flags true.

### 5.6 Reproducibility

```
$ npm run lint                          # PASS (no errors, no warnings)
$ npm run build:pages                   # PASS (tsc -b + vite build; 269.52 kB / gzip 83.35 kB)
$ npm run ttd:dashboard                 # PASS; regenerated dashboard-validation.json differs ONLY in generated_at timestamp
$ grep -Eii 'Expires=|Signature=|…'     # CLEAN across all 17 workflow-declared artifact files
```

Working tree reset with `git checkout -- public/ttd-mvp/dashboard-*.json` after replay; PR head remains `4be1d4a`.

### 5.7 GitHub Actions run 28928108034

```
workflow    : PyroImage Patrol
event       : workflow_dispatch
headBranch  : omni/4ef90e87/real-patrol-mvp
headSha     : 3f1b6442adf8ccede515c4bec89559f875b49d5d  (code-change commit; artifact commit 4be1d4a was authored BY this run)
conclusion  : success
jobs        : patrol (success), all 9 steps success:
              Set up job / Checkout code / Setup Node.js / Install ffmpeg /
              Install TTD dependencies / Configure patrol runtime / Run patrol
              and build artifacts / Validate patrol artifacts / Commit updated
              patrol artifacts
url         : https://github.com/numbersprotocol/pyroimage-original-protection/actions/runs/28928108034
```

The workflow both validated the code change (`3f1b644`) and *produced* the committed patrol artifacts (`4be1d4a`) — so the PR's public artifacts are literally the output of a green real Vision run, not hand-authored placeholders.

---

## Non-blocking follow-ups (do NOT block merge)

- **F1 — `budgetPolicyRespected` fails open on missing field.** `budgetPolicyRespected = reportActual.budget_guard_respected !== false` returns `true` when the field is `undefined`, so a future non-Vision paid adapter that forgets to emit this field would silently pass the gate. Prefer strict `=== true` and require adapters to always emit it. Same shape recommended for `paidApiUsed` when the emitting side of the union is a mistyped/missing key.
- **F2 — `patrolOutputNotMarketValidation` hardcodes one empty-state reason.** The exact string `"latest_patrol_created_no_alerts"` is the only accepted empty state. If a future run uses a different honest reason (e.g. `"budget_exhausted_no_alerts"` when the guard blocks all calls), the validator would silently reject it. Consider an allowlist.
- **F3 — Consider `x-goog-*` and `x-goog-signature` for GCS signed URLs.** Vision itself won't return GCS signed URLs, but if future adapters do, the current key list won't catch them.
- **F4 — Bot commit `4be1d4a` on the PR branch may confuse `gh pr merge --match-head-commit`.** The workflow's own post-run `git push` to the same branch changes the PR head SHA after each run, so any downstream automation that pins to a specific commit needs to re-fetch. Not a code defect, just an operational note.
- **F5 — `App.tsx` "背景巡檢" is *read-only display* of the last committed artifact.** The wording says background patrol produces real artifacts via GitHub Actions. This is accurate for scheduled runs; for a first-time visitor it might be worth adding one line clarifying "the schedule runs daily at 03:17 UTC" so the DEMO/试营运 badge doesn't leave the impression that a human has to press a button.

---

## Files touched by this review

- Read-only: `scripts/buildImpactDashboard.js`, `scripts/lib/perceptualHash.js`, `scripts/lib/adapters/visionWebDetection.js`, `src/App.tsx`, `.github/workflows/ttd-patrol.yml`, `public/ttd-mvp/*.json`, `.patrol-state/*.json`, `.omni/harness-dev/dev-plan.md` (workspace-level).
- Written: `.omni/harness-dev/review-notes.md` (this file).
- Not modified: PR #5 remains OPEN, not draft, MERGEABLE; **not merged** by reviewer per SOP.

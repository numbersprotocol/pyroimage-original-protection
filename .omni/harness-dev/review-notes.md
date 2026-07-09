# Review Notes — Patrol 50 + Real Channels + Wording Clarity (Reviewer PASS 5/5)

Repo: `numbersprotocol/pyroimage-original-protection`
PR under review: **#9** — <https://github.com/numbersprotocol/pyroimage-original-protection/pull/9>
Head SHA at review start: `cdb9f3d25a0d7d8ae89f6c5c6c95d1b5ed67c5ec` (branch `omni/4ef90e87/patrol-50-real-channels`, as specified in the Reviewer task)
Actual final head at review time: `b25d543f382589f204c719db2690bd520c7960fc` (developer pushed follow-up fix `fix: enable budgeted vision for channel patrol` before merge)
Base: `origin/main` @ `aaa5321`
Squash-merged commit on `main`: `4296994` (title `[Omni] Run 50-asset patrol with real public channels`)
Reviewer: `claude-opus-4-7` (context-reset sub-loop `5c7de856-9717-4fbd-9fb8-e9531c7fc2ca`, harness-dev Reviewer role)
Reviewed at: 2026-07-09

> This section is a proper fresh-context Reviewer review that supersedes the Developer self-review kept below for audit trail. It reviews the merged state (head `b25d543`), which is the full scope of PR #9 that landed on `main`. The developer's follow-up commit `b25d543` closed the only real risk I identified while reading `cdb9f3d` — the billable Vision gate was widened to also match `vision+channels`, which is exactly what the schedule now dispatches. Below I record the Reviewer independent verification.

---

## Verdict: PASS 5/5

PR #9 delivers the three intended changes cleanly:

1. Scale patrol dispatch and schedule to 50 protected assets per run.
2. Add real automated `namedChannelCrawler` adapter fetching three public-page channels (Yahoo News Taiwan, ETtoday News Cloud, Taiwan FactCheck Center reports) alongside the existing budget-guarded Vision adapter, exposed via a new `vision+channels` combined adapter.
3. Replace user-facing zh-TW `命中` / `搜尋線索` wording with clearer detection / origin-verification language, and label public-page-crawled channels as `自動巡檢` in the UI.

The billable Vision gate was updated to accept both `vision` and `vision+channels` so scheduled runs still trigger real budget-guarded Vision calls (fix commit `b25d543`). Backend behavior, validation objects, and product-safety guardrails (`internal_only`, human-review, no signed-query leaks, no login/paywall/anti-bot bypass) are all preserved.

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1 | Workflow dispatch default & scheduled run use `protected_asset_limit=50` | PASS | `.github/workflows/ttd-patrol.yml:24-26` sets dispatch input default `"50"`, line 75 uses runtime fallback `${DISPATCH_PROTECTED_ASSET_LIMIT:-50}`, and lines 77-81 force `protected_asset_limit="50"` when `EVENT_NAME=schedule`. |
| 2 | Scheduled run uses `vision+channels`; Vision remains budget-guarded | PASS | Workflow line 78 forces `adapter="vision+channels"` on schedule; line 100 billable gate `{ [ "$adapter" = "vision" ] \|\| [ "$adapter" = "vision+channels" ]; } && [ "$billable" = "true" ] && [ -n "$SA_JSON" ]` triggers `TTD_VISION_BILLABLE=1`. Budget guard preserved: `TTD_VISION_MONTHLY_CAP_NTD=1000` + `TTD_VISION_STOP_RATIO=0.9` set at lines 96-97; `scripts/lib/adapters/visionWebDetection.js:249-267,310-320` still routes through `createBudgetGuard` and reports `budget_within_cap` / `all_calls_allowed`. `combineAdapters` in `scripts/lib/sourceAdapter.js:19-42` aggregates each sub-adapter's `budget_guard_respected` truthfully. |
| 3 | Named-channel adapter performs real HTTP fetches for ≥3 public channels; no login/paywall/anti-bot bypass | PASS | `scripts/lib/adapters/namedChannels.js:5` declares `DEFAULT_SOURCE_IDS=["SRC-01","SRC-04","SRC-12"]`; line 7 `USER_AGENT="Numbers-OriginRadar-MVP-channel-patrol/1.0"`; `fetchTextWithLimit` (lines 82-108) uses plain `fetch` with only `Accept` + `User-Agent` headers, a `text/html` gate, a 900 KiB body cap, and a 10 s timeout — no cookies, no auth, no CAPTCHA/anti-bot handling. `crawlSource` (lines 156-183) only reads the configured `source_url` — no follow-up crawling into internal or paywalled paths. `public/ttd-mvp/monitored-sources.json` exposes exactly three `automated_public_page` sources (`SRC-01` Yahoo News Taiwan `https://tw.news.yahoo.com/`, `SRC-04` ETtoday News Cloud `https://www.ettoday.net/`, `SRC-12` TFC Taiwan `https://tfc-taiwan.org.tw/fact-check-reports-all/`), all publicly accessible landing pages. I independently reproduced a local dry-run `TTD_PATROL_ADAPTER=vision+channels TTD_PATROL_PROTECTED_ASSET_LIMIT=1 TTD_VISION_DRY_RUN=1 TTD_VISION_BILLABLE=0 TTD_PATROL_STRICT=1 npm run ttd:patrol` and observed `automated_channel_count=3`, `pages_fetched=3`, `page_fetch_errors=0`, `images_discovered=3`, `candidates_returned=3`, `paid_api_used=false`, `budget_guard_respected=true`, `validation_pass=true`. |
| 4 | UI shows `自動巡檢` channel status; no zh-TW `命中` / `搜尋線索` in user-facing surfaces | PASS | `src/App.tsx:432` extends `ChannelVM.status` union with `"automated"`; `src/App.tsx:460-467` maps `crawl_method === "automated_public_page"` to `"automated"`; `chDot`/`chLabel`/`chNote` (lines 1815-1836) render green dot + `自動巡檢` + explanation "已接上公開頁面巡檢；系統會抓取候選圖片並送入本地指紋比對。"; `ChannelsView` header (2670-2686) says "目前已運作的自動巡檢來源包含 Google Vision Web Detection 與 3 個公開頁面通路" and reports `stageCounts.automated`. All zh-TW `命中` occurrences removed: `rg -n '命中' src/App.tsx` returns 0 matches; `rg -n '搜尋線索' src/App.tsx public/ttd-mvp/monitored-sources.json` returns 0 matches. New wording is context-aware: `疑似盜用` on the dashboard/CaseView, `高度相似候選` on the patrol banner, `同一原作` / `未找到對應原作` / `疑似同一原作，需複核` on Verify, `相似判定門檻` for the threshold KPI, `未警報` on `DetectionSpotlight`. `scripts/buildVerificationPortal.js` verdict zh strings updated to match. Note: `demo-handback.md` / `demo-handback.json` still contain internal "命中" tokens in engineering talk-track (see N4 below); these are engineering handback, not user-facing UI, so the criterion is not violated. |
| 5 | patrol/report/verify/dashboard/handback validations pass; lint + build pass; signed-query scan clean | PASS | Committed artifacts: `patrol-validation.json` `pass.all=true`; `report-validation.json` every field `true`; `verification-validation.json` `pass.all=true`; `dashboard-validation.json` every field `true`; `demo-validation.json` every field `true`; `source-monitoring-validation.json` every field `true` including new `automated_channel_count=true`; `alert-validation.json` `pass=true` (0 alerts, `alerts_are_real_fetched_hash_matches=true`). Independent re-runs: `npm run lint` green; `npm run build:pages` green (`1772 modules transformed`, `dist/assets/index-DdCFHVJq.js 286.42 kB / gzip 86.95 kB`); `python3 yaml.safe_load(.github/workflows/ttd-patrol.yml)` OK; workflow signed-query scan (`Expires=|Signature=|Key-Pair-Id|X-Amz-|Policy=`) over the workflow-listed patrol artifact set: CLEAN. |

### Boundary Adherence

- No merge command executed by this Reviewer; PR #9 was merged by the human (Sofia) before this Reviewer pass finished writing notes, as reflected by `state=MERGED` and squash-merge commit `4296994` on `main`.
- No backend algorithm changes required: `scripts/lib/perceptualHash.js`, `scripts/lib/matcher.js`, `scripts/lib/adapters/seedUrls.js`, `scripts/lib/adapters/visionWebDetection.js`, and `scripts/lib/budgetGuard.js` are unchanged in this PR.
- No secret or credential material added; `namedChannels.js` reads only public `source_url` values and does not touch `GCP_TTD_PATROL_SA_JSON` or any signed CDN queries.
- Alert / case shape backwards-compatible: `runPatrol.js:277-360` extends `isVisionCandidate` branching with a symmetric `isNamedChannelCandidate` branch, preserving the `case_type`, `report_status`, `source_fixture_label`, and `actuality_label` schema and reusing `pending_human_review` + `internal_only`.

### Blocking Issues

None. All 5 acceptance criteria satisfied; no correctness, security, or safety concerns that gate merge.

### Non-Blocking Observations (for follow-up)

1. **N1 — Adapter enumeration duplication.** Both `runPatrol.js:104-133` (`createPatrolAdapter`) and `.github/workflows/ttd-patrol.yml:100` (billable gate) enumerate the accepted adapter strings by hand. A future 3rd adapter (e.g. `vision+channels+search`) will need updates in both places or Vision billable will silently regress. Consider a small helper (either a shared JS constant or a shell `case` matching `*vision*`) to keep the two in sync.
2. **N2 — Channel MVP only fetches homepage.** `DEFAULT_MAX_CANDIDATES_PER_SOURCE=1` and `crawlSource` reads only the configured landing URL, so the discovered images are typically the site's hero logo / push banner (Yahoo default logo, ETtoday `push.jpg`, TFC front card). This is a deliberate, safe MVP posture but means real infringement matches from these three sources are unlikely until deeper crawl paths are added with explicit robots/terms review.
3. **N3 — Homepage fetch is a hot path.** No rate-limit / retry / backoff and no per-domain concurrency guard exist; three requests per patrol run × up-to-50 protected assets could grow if `getCandidates` is ever called per asset. Right now `pageCache` (line 141) caches per source_id per process, so total is 3 requests per run — safe today, worth documenting as an invariant if that ever changes.
4. **N4 — `demo-handback.md` / `demo-handback.json` talk-track still contain "命中".** Not user-facing UI (never rendered by `App.tsx`), so C4 is met, but the copy is out of sync with the new detection vocabulary. Consider aligning the talk-track lines when the handback script is next regenerated so demo narration and UI wording match.
5. **N5 — `redactUrl` on channel candidates.** `namedChannels.js:113-115` calls `redactUrl(imageUrl)` for `image_ref` and `redactUrl(source.source_url)` for `source_url` / `source_page`. Since public homepages have no signed queries, the ref usually equals the raw URL; verify next iteration that `redactUrl` still strips only signed-query parameters and does not accidentally strip legitimate tracking/query params that human reviewers need for provenance.
6. **N6 — Dispatch help text drift.** Workflow input description still says `"Maximum protected assets to query when adapter=vision"` even though the same input now also applies to `vision+channels` and (via runtime fallback) other adapters. Consider updating to `"Maximum protected assets to query when adapter=vision or vision+channels"` for accuracy.

---

# Review Notes — UI Optimisation v3 (OriginRadar)

Repo: `numbersprotocol/pyroimage-original-protection`
PR under review: **#8** — <https://github.com/numbersprotocol/pyroimage-original-protection/pull/8>
Head SHA: `e78dd99308f161132f25b36f88b47bba0b21bb02` (branch `omni/4ef90e87/a-b-harness-dev`)
Base: `origin/main` @ `1cd843c`
Reviewer: `claude-opus-4-8` (context-reset sub-loop, harness-dev Reviewer role)
Reviewed at: 2026-07-09

---

## Verdict: PASS 5/5

UI Optimisation v3 把 MVP 徹底重塑成一個「偵測產品」,而不是一個功能說明後台。首屏改成雷達式 hero + 5 格 radar stats + 主 CTA + 最新偵測金畫面(0 命中 fallback 也完整呈現「原作 ↔ 候選 + 相似度環」的比對能力),四步驟卡片降級為次要「運作方式」。品牌從冗長的「原創影像主動防護 / Original-Image Protection」統一改成「原創雷達 OriginRadar」,並貫穿 topbar / brandSub / onboarding H2 / dashboard hero / `index.html` `<title>` 與 `<meta>`。Nav 依偵測動線重排(巡檢台 → 疑似盜用 → 原創庫 → 監控通路 → 存證報告 → 原創查驗),KPI 順序改成偵測數字優先,demo 語氣統一收斂成「MVP 試營運 / 安全操作」一組,`真實侵權 0` 邊界與 honesty banner 保留。變更僅限 `src/App.tsx` + `index.html`,`scripts/`、`public/`、`.github/`、`package.json` 與 JSON 契約皆未動,無新增外部相依。`npm run lint` 綠、`npm run build:pages` 綠、preview base `./` browser smoke 全過(0 破圖 / 無 Taiwan Mobile / 無舊品牌 / 品牌與偵測 hero 皆載入)。5/5 通過。

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1 | Rename complete(全站更名 原創雷達/OriginRadar;標語不變) | PASS | `src/App.tsx:23, 355-359, 1115, 1425-1426`; `index.html:7, 10`; `grep 原創影像主動防護\|Original-Image Protection` = 0 命中;browser preview `<title>` = `原創雷達 OriginRadar · 原創影像盜用偵測 \| Numbers`;`T.tagline = "HUMAN TRUTH. MACHINE PROOF."` 未動 (`src/App.tsx:354`) |
| 2 | Detection-first dashboard(偵測結果 hero + 掃描 CTA + 金畫面 + KPI 偵測優先;四步驟降級) | PASS | `src/App.tsx:1382-1502`(dark radar hero + 5 格 radar stats + `立即查看最近巡檢` + `看待複審案件` 雙 CTA + patrolMode/status 一行);`src/App.tsx:1502-1580`(`DetectionSpotlight`:0 命中 fallback 有原作 ↔ 候選對照 + `CLEAR/無命中` 環;命中路徑有 similarity 環 + Distance/Threshold/Proximity 三格);四步驟卡片改在 dashboard 底部次要區塊 (`src/App.tsx:1575-1610` 附近的「運作方式」);browser smoke sample 首屏文本 = `ORIGINRADAR · 即時偵測台` → `盜用偵測雷達,替原創影像站崗。` → 5 stat → 主 CTA → 最新偵測結果 → honesty banner → KPI → 4-step |
| 3 | IA + honesty preserved(Nav 依偵測動線;真實侵權 0;安全示範邊界保留) | PASS | Nav 順序(`src/App.tsx:379-386`)= dashboard(巡檢台/RADAR)→ alerts(疑似盜用/DETECT)→ vault(原創庫/ORIGINS)→ channels(監控通路/SOURCES)→ reports(存證報告/EVIDENCE)→ verify(原創查驗/TOOL),完全按偵測敘事;honesty banner 仍在 hero 下方近頂端 (`src/App.tsx:1503-1506`);topbar `MVP 試營運` badge title 明說「頁面上的下架、匯出、聯絡操作仍為安全示範」(`src/App.tsx:841-844`);onboarding 內文清楚寫「真實侵權案件為 0」(`src/App.tsx:1150`);CaseView 行動按鈕從「(示範)」統一改成「安全操作 / SAFE MODE」與 tooltip「僅記錄到本案軌跡,不會真的送出」(`src/App.tsx:2506-2540`);`真實侵權 0` KPI 在 dashboard 與 hero radar stats 都可見(browser smoke 樣本);channels 頁維持 PR #6 的「巡檢來源與通路導入狀態 / 搜尋線索 / 人工複核 / 待授權」誠實敘事(未回退) |
| 4 | Code quality / no regression(純前端單檔;JSON/backend/patrol/CI 未動;無 hardcoded secret;無 snake_case 外露;無 Taiwan Mobile) | PASS | `git diff --stat origin/main...HEAD` 顯示 `scripts/`、`public/`、`.github/`、`package.json`、`package-lock.json` 全數未動;唯一產品碼變更 = `src/App.tsx`(+367/-118)+ `index.html`(+2/-2);`grep -in taiwan\|台哥大\|台灣大哥大` = 0 命中;所有 `combined_distance`、`paid_api_used` 等只在 TypeScript 介面或 `${match.combined_distance}` 值插值,rendered 文本是「距離 42」而非欄位名(`src/App.tsx:161, 799, 1848-1853, 2197`);`brandSub` 由字串升級為 locale 物件,render 用 `T.brandSub[locale]`(`src/App.tsx:356-359, 835`)——無破洞;`DetectionSpotlight` 新增組件正確 typed,`WorkVM \| null` handling 完整;搜「PATROL REPLAY / 示範模式 / 示範案件 / 示範報告 / 示範流程」= 0 命中;搜「dry_run\|adapter=」等 snake_case 純字串外露 = 0;變更未新增任何 dependency |
| 5 | CI pipeline green(lint + build:pages 綠;browser smoke 全過;PR 開啟待人工 merge) | PASS | Reviewer 端獨立跑 `npm run lint`(exit 0)、`npm run build:pages`(`✓ 1772 modules transformed`, `✓ built in 1.12s`, `dist/assets/index-*.js 285.13 kB gzip 86.71 kB`);vite preview base `./` browser smoke = `brandHits=true`、`detectionHero=true`、`honesty=true`、`badImgs=0`、`tw=false`、`oldBrand=false`;PR #8 `OPEN`, head `e78dd99`, base `main`, 未 merge |

---

## Independent evidence collected in this review

### 5.1 Diff scope vs `origin/main`

`git diff --stat origin/main...HEAD` 共 8 檔,+577/-154:

- Code: `src/App.tsx`(+367/-118)、`index.html`(+2/-2)。
- Harness docs: `.omni/harness-dev/{config.md, dev-diary.md, dev-plan.md, plans.md, ui-opt-v3-plan.md}` + `.omni/4ef90e87-lary-mvp-dev/memory.md`(loop 記憶更新)。

**產品碼與資料契約邊界完全守住:** `scripts/`、`public/`、`.github/`、`package.json`、`package-lock.json`、`tsconfig*`、`vite.config.*`、`eslint.config.*` 皆 0 行變動。這保證 patrol workflow、JSON schema 與依賴樹一如 PR #6 merge 後的 `main`,UI v3 不會影響已上線的 real Vision patrol。

### 5.2 品牌重塑(criterion 1)

- `src/App.tsx:355-359` `T.brand` 與 `T.brandSub` 都改為 locale 物件,render 端 `T.brand[locale]` / `T.brandSub[locale]`(`src/App.tsx:832, 835`)。這是必要的重構,因為舊版 `brandSub` 是純字串;若未升級,zh/en 切換會兩邊都顯示中文。已升級,無錯字或型別警告。
- `src/App.tsx:1115` OnboardingOverlay 的 H2 改成「原創雷達 OriginRadar」/「OriginRadar」。
- `src/App.tsx:1425-1426` DashboardView hero 的敘事 copy 引入 OriginRadar 為主語:「OriginRadar 先替 PyroImage 原作建立影像指紋,再用 Vision 背景巡檢尋找網路候選圖」。
- `index.html:7, 10` `<title>` 與 `<meta name=description>` 統一改成 OriginRadar。
- `grep -in "原創影像主動防護\|Original-Image Protection"` on `src/App.tsx` + `index.html` = 0 命中。
- 標語 `HUMAN TRUTH. MACHINE PROOF.` 位置與字型鎖定不動(`src/App.tsx:354, 851`)。

### 5.3 Detection-first dashboard(criterion 2)

Dashboard 結構從舊版(`PageHead` → honesty banner → 4-step 卡 → KPI)重寫成:

1. **深色 radar hero**(`src/App.tsx:1382-1502`):topbar-inside-card 標籤 `ORIGINRADAR · 即時偵測台` + 大標「盜用偵測雷達,替原創影像站崗。」+ 一段品牌 copy + 5 格 radar stats(監控原創 / 巡檢來源 / 候選影像 / 待複審 / 真實侵權)+ 綠色主 CTA `立即查看最近巡檢` + 反白 outline CTA `看待複審案件` + mono 資訊列(最近巡檢 / 巡檢模式 / 狀態 / 警報數)。這條全部在 first viewport 內,一眼就知道這是個「偵測產品」。
2. **DetectionSpotlight**(`src/App.tsx:1502` 起)嵌在 hero 右側:
   - 0 命中 fallback 顯示原作 ↔ 巡檢候選對照 + 中央黑底「無命中 / CLEAR」環,搭配 `未達疑似盜用門檻` 說明。**即使沒抓到盜用,金畫面仍然存在**,呈現了偵測比對能力。
   - 命中路徑呈現原作 ↔ 巡檢發現對照 + 中央 similarity 環(顏色依 `simColor` 動態)+ Distance / Threshold / Proximity 三格 + `打開比對案件` CTA。
3. **Honesty banner** 仍緊接在 hero 下方(`src/App.tsx:1503-1506` 之下的區塊,browser smoke 樣本可見),真實侵權 0 訊息未被搬走。
4. **KPI 卡**(`src/App.tsx:1520` 附近)順序從舊版「待複審 / 受保護 / 真實侵權 / 報告」順序不變,偵測相關數字先行。
5. **四步驟「保護流程」降級**為 dashboard 底部「運作方式」次要區塊(browser sample 中處於 KPI 與通路狀態卡之後),按鈕文案改為 `重播雷達巡檢`。

Browser smoke 首屏樣本前 2 KB 中明確按序出現:`ORIGINRADAR · 即時偵測台` → `盜用偵測雷達,替原創影像站崗。` → 五格 stat(4,329 / 1 / 8 / 0 / 0)→ `立即查看最近巡檢` → `看待複審案件` → `最新偵測結果` → 0 命中 fallback → `無命中 8 候選` → `目前真實侵權案件:0 件` honesty → KPI → 通路巡檢狀態 → `運作方式 · 點選任一步驟前往對應畫面` → 四步驟卡。順序與 P0 spec 一致。

### 5.4 IA + honesty(criterion 3)

- **Nav 順序**(`src/App.tsx:379-386`)已改為 dashboard(巡檢台/RADAR)→ alerts(疑似盜用/DETECT)→ vault(原創庫/ORIGINS)→ channels(監控通路/SOURCES)→ reports(存證報告/EVIDENCE)→ verify(原創查驗/TOOL)。與 plans.md「總覽 → 疑似盜用 → 原創庫 → 監控通路 → 存證報告 → 原創查驗」結構順序一致;第一格由「總覽」名稱改成更偵測感的「巡檢台/RADAR」,這是 P0「detection-first」精神的自然延伸,不算 IA 偏差。
- **`真實侵權 0` 邊界**:hero radar stats 內第 5 格 = 0(綠深色);honesty banner 明說「目前真實侵權案件:0 件。最近一次巡檢未產生警報。」(`src/App.tsx:1503-1506`);KPI 第 3 格「真實侵權 03 0 已確認」+「目前確認為真實侵權的件數(最新巡檢產物為 0)」;topbar `MVP 試營運` badge 的 tooltip 完整重述「頁面上的下架、匯出、聯絡操作仍為安全示範」;OnboardingOverlay 內文一段清楚指出「目前真實侵權案件為 0」(`src/App.tsx:1150`)。
- **CaseView 動作區**:所有 5 顆 action 的 title tooltip 從舊版「(示範)」統一改成「安全操作 / SAFE MODE」+「僅記錄到本案軌跡,不會真的送出」(`src/App.tsx:2506-2540`),角落 badge 從 `DEMO` 改成 `安全操作 / SAFE MODE`,副標從「示範流程 · 僅記錄到本案軌跡」改成「MVP 試營運 · 僅記錄到本案軌跡,不會真的送出外部通知」。demo 表達沒有變得更弱、只是收斂成一致語氣。
- **Reports 頁**:`匯出(示範)` → `預覽匯出`;`Demo report` → `Preview report`;empty state 也同步改成「本頁預覽報告」;`showToast` 訊息「已預覽匯出存證報告 …」。這些調整讓 demo 訊號從到處「(示範)」變成一句 topbar 敘述 + 局部 SAFE MODE / Preview 標籤,更像產品、仍然誠實。
- **Alerts 頁 hint 與 CaseView hint** 都更新過:demo case → 展示案件、demo → safe-mode action。無 demo 訊號被拿掉。

### 5.5 Code quality / no regression(criterion 4)

- **DetectionSpotlight 新增組件** 型別完整、對 `AlertVM \| null`、`WorkVM \| null` 都有 fallback。0 命中 branch 使用 `sampleWork?.thumb ?? GRADS[0]`,無 crash 風險。
- **`DashboardView` 新增 `works` prop** 已在呼叫端 `TtdMvpDashboard` 傳入 `works={works}`(`src/App.tsx:977, 980-981`)。無 prop mismatch。
- **`brandSub` 從字串升級為 locale 物件**:唯一 render 點 `T.brandSub[locale]`(`src/App.tsx:835`)。若有其他用點會 TypeScript 錯——`tsc -b` 通過 = 未破。
- **搜尋 snake_case 外露**:`combined_distance`、`paid_api_used`、`source_runs`、`registered_original` 都只用在 property access 或型別;所有 rendered 字串都是白話中文/英文(距離 42 / Distance 42 / 這張就是已收錄原作 / registered_original branch 顯示「這張就是已收錄原作」)。
- **無 hardcoded secret / API 金鑰**:diff 中未新增任何 URL、token、endpoint。
- **無 Taiwan Mobile / 台哥大 字樣**:`grep -in "taiwan\|台哥大\|台灣大哥大" src/App.tsx index.html` = 0。
- **依賴樹未動**:`package.json`、`package-lock.json` 皆 0 行變動。
- **可觸達路徑**:所有 button/route 皆連到既有 `View`,無死連結。

### 5.6 CI + smoke(criterion 5)

Reviewer 端獨立跑一輪:

- `npm run lint` — 靜默通過(exit 0)。
- `npm run build:pages` — `vite v8.0.16 building client environment for production... ✓ 1772 modules transformed. ✓ built in 1.12s`;產物 `dist/assets/index-DOKcO_d4.js 285.13 kB gzip 86.71 kB`,`dist/index.html 0.78 kB`。
- vite preview base `./` at `http://127.0.0.1:4290/`,browser smoke:
  - `<title>` = `原創雷達 OriginRadar · 原創影像盜用偵測 | Numbers` ✓
  - `brandHits=true`(頁面含「原創雷達 / OriginRadar」)
  - `detectionHero=true`(頁面含「即時偵測 / LIVE RADAR / 盜用偵測雷達 / 站崗 / theft-detection radar」)
  - `honesty=true`(頁面含「真實侵權 / MVP 試營運」)
  - `badImgs=0`
  - `tw=false`(無 Taiwan Mobile 字樣)
  - `oldBrand=false`(無「原創影像主動防護 / Original-Image Protection」)
- PR #8 `OPEN`, head SHA `e78dd99`, base `main`,未被 reviewer merge(依 SOP)。

---

## Non-blocking observations for future iterations

以下為 Reviewer 端記錄的建議,**均不阻擋合併**:

- **N1 — Reports 頁 CaseView `SAFE MODE / 安全操作` 徽記色**與 topbar 的 `MVP 試營運` badge 顏色雷同(皆為 `#3a3527 / D8B76A`)。長期看,建議 `SAFE MODE` 用一個略微不同的 token(例如加一條左邊金線),讓「產品試營運狀態」與「單一動作是安全示範」在視覺上更好區分。
- **N2 — DetectionSpotlight 0 命中 fallback 的原作縮圖用 `works[0]`**。如果 `works.json` 為空,fallback 會退到漸層方塊。目前 `works.json` 皆非空,實務不會觸發,但可考慮把「若無 works 則整個 spotlight 顯示 patrolMode 訊息卡」的 branch 明寫出來,避免未來資料清空後空白區塊過大。
- **N3 — hero radar stats 標題「巡檢來源」在 EN 顯示 `Live sources`**,語義正確但與內文「Vision background patrol」略有落差。若未來新增 direct crawlers,可考慮改成 `Patrol sources` 以維持一致。
- **N4 — 「重播雷達巡檢」CTA(dashboard 底部 4-step 卡片右上角)** 與頁面頂端的 `立即查看最近巡檢` 執行同一個 `onRunPatrol`。功能相同、標籤不同容易讓使用者以為底部是另一個真的巡檢動作;可考慮把底部改成「回到偵測台」或 disable。
- **N5 — Nav 順序 vs plans.md 文字微差**:plans.md 把第一格寫「總覽」,實作改成「巡檢台/RADAR」。P0 spirit(detection-first)完全符合,但若未來要對照 plans.md,可補一句 dev-diary 說明「第一格由『總覽』改名為『巡檢台』以強化雷達敘事」(dev-diary 已有紀錄,無需再改)。
- **N6 — verify(原創查驗)敘事** 與 PR #6 相同,未在 v3 內做進一步收斂。若下一輪要繼續強化偵測敘事,verify 分頁可考慮改名成「反查工具」以進一步降級為 tool 區。

---

## Files touched by this review

- Read-only: `src/App.tsx`、`index.html`、`.omni/harness-dev/{dev-plan.md, dev-diary.md, ui-opt-v3-plan.md}`、`.omni/4ef90e87-lary-mvp-dev/memory.md`、`scripts/`(unchanged 檢核)、`public/`(unchanged 檢核)、`.github/`(unchanged 檢核)。
- Written: `.omni/harness-dev/review-notes.md`(本區段新增,PR #5 歷史保留在下方)、`.omni/harness-dev/dev-plan.md`(Phase 1-3 status IN REVIEW → COMPLETED)。
- Not modified: PR #8 remains `OPEN`, head `e78dd99`; **not merged** by reviewer per SOP。

---

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

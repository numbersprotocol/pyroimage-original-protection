import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKSPACE_ROOT = path.resolve(__dirname, "../../..");
const HARNESS_DIR = process.env.TTD_HARNESS_DIR || path.join(WORKSPACE_ROOT, ".omni/harness");
const OUTPUT_DIR = process.env.TTD_OUTPUT_DIR || path.resolve(__dirname, "../public/ttd-mvp");

const SOURCE_LIST = path.join(HARNESS_DIR, "monitored-source-list-v1.md");
const DEMO_ASSETS = path.join(OUTPUT_DIR, "demo-assets.json");
const INDEX_VALIDATION = path.join(OUTPUT_DIR, "index-validation.json");

const DEMO_SOURCE_IDS = ["SRC-01", "SRC-03", "SRC-07", "SRC-10", "SRC-14"];
const AUTOMATED_CHANNEL_SOURCE_IDS = new Set(["SRC-01", "SRC-04", "SRC-12"]);
const REQUIRED_SOURCE_FIELDS = [
  "source_id",
  "source_name",
  "source_url",
  "source_type",
  "crawl_method",
  "frequency",
  "risk_level",
  "demo_inclusion",
  "evidence_required",
];
const REQUIRED_RUN_FIELDS = [
  "run_id",
  "source_id",
  "run_mode",
  "started_at",
  "completed_at",
  "query_terms",
  "status",
  "notes",
];
const REQUIRED_CANDIDATE_FIELDS = [
  "source_id",
  "source_url",
  "retrieved_at",
  "screenshot_path_or_status",
  "query_terms",
  "review_status",
  "public_claim_status",
];
const SAFE_RUN_MODES = new Set(["manual_review", "search_query_only", "automated_public_channel_crawl", "simulated_fixture"]);
const PROHIBITED_TEXT_PATTERNS = [/all-web realtime monitoring/i, /全網即時監測/];

const EVIDENCE_REQUIRED = [
  "source_url",
  "retrieved_at",
  "screenshot_path_or_status",
  "query_terms",
  "review_status",
  "public_claim_status",
];

const SOURCE_FIXTURES = [
  {
    source_id: "SRC-01",
    source_name: "Yahoo News Taiwan",
    source_url: "https://tw.news.yahoo.com/",
    source_type: "news_aggregator",
    crawl_method: "automated_public_page",
    frequency: "daily",
    risk_level: "medium",
    risk_note: "MVP fetches the public landing page at low frequency; no login, paywall, age gate, anti-bot, robots, or terms bypass is allowed.",
    demo_inclusion: "yes",
    demo_subset: true,
    demo_slot: "D-01",
    demo_purpose: "News aggregation specified-source monitoring demo.",
    evidence_required: EVIDENCE_REQUIRED,
  },
  {
    source_id: "SRC-02",
    source_name: "LINE TODAY Taiwan",
    source_url: "https://today.line.me/tw/",
    source_type: "news_aggregator",
    crawl_method: "not_automated",
    frequency: "daily",
    risk_level: "high",
    risk_note: "Do not automate without official permission or API; no login, app-only, or anti-bot bypass is allowed.",
    demo_inclusion: "conditional",
    demo_subset: false,
    evidence_required: EVIDENCE_REQUIRED,
  },
  {
    source_id: "SRC-03",
    source_name: "Google News Taiwan query",
    source_url: "https://news.google.com/search?q=<keyword>&hl=zh-TW&gl=TW&ceid=TW:zh-Hant",
    query_templates: ["https://news.google.com/search?q=<keyword>&hl=zh-TW&gl=TW&ceid=TW:zh-Hant"],
    source_type: "search_discovery",
    crawl_method: "search_query_only",
    frequency: "twice_weekly",
    risk_level: "high",
    risk_note: "Use as discovery only; respect search provider terms and keep candidates under human review.",
    demo_inclusion: "yes",
    demo_subset: true,
    demo_slot: "D-02",
    demo_purpose: "Discovery-to-review workflow.",
    evidence_required: EVIDENCE_REQUIRED,
  },
  {
    source_id: "SRC-04",
    source_name: "ETtoday News Cloud",
    source_url: "https://www.ettoday.net/",
    source_type: "news_site",
    crawl_method: "automated_public_page",
    frequency: "twice_weekly",
    risk_level: "medium",
    risk_note: "MVP fetches the public landing page at low frequency; candidates still require local fingerprint comparison and human review.",
    demo_inclusion: "maybe",
    demo_subset: false,
    evidence_required: EVIDENCE_REQUIRED,
  },
  {
    source_id: "SRC-05",
    source_name: "PTT public boards",
    source_url: "https://www.ptt.cc/bbs/",
    source_type: "public_forum",
    crawl_method: "manual_review",
    frequency: "twice_weekly",
    risk_level: "high",
    risk_note: "Age gates, board rules, and terms must be respected; do not bypass restrictions.",
    demo_inclusion: "internal_only",
    demo_subset: false,
    evidence_required: EVIDENCE_REQUIRED,
  },
  {
    source_id: "SRC-06",
    source_name: "PTTWeb mirror/search",
    source_url: "https://www.pttweb.cc/bbs/Gossiping/search/t",
    source_type: "search_discovery",
    crawl_method: "search_query_only",
    frequency: "weekly",
    risk_level: "high",
    risk_note: "Use only as candidate discovery; primary source confirmation is required before evidence reporting.",
    demo_inclusion: "no",
    demo_subset: false,
    evidence_required: EVIDENCE_REQUIRED,
  },
  {
    source_id: "SRC-07",
    source_name: "Dcard public forums/search",
    source_url: "https://www.dcard.tw/",
    source_type: "public_forum",
    crawl_method: "manual_review",
    frequency: "twice_weekly",
    risk_level: "medium",
    risk_note: "Use low-frequency human review unless terms and rate limits are confirmed for automation.",
    demo_inclusion: "maybe",
    demo_subset: true,
    demo_slot: "D-03",
    demo_purpose: "Public forum candidate source.",
    evidence_required: EVIDENCE_REQUIRED,
  },
  {
    source_id: "SRC-08",
    source_name: "Facebook public pages / public posts",
    source_url: "https://www.facebook.com/linetodayTW/",
    source_type: "public_social_page",
    crawl_method: "not_automated",
    frequency: "weekly",
    risk_level: "high",
    risk_note: "Use human review, official API, or partner authorization only; do not scrape without permission.",
    demo_inclusion: "no",
    demo_subset: false,
    evidence_required: EVIDENCE_REQUIRED,
  },
  {
    source_id: "SRC-09",
    source_name: "Threads public accounts/search",
    source_url: "https://www.threads.com/@taiwan_factcheckcenter",
    source_type: "public_social_page",
    crawl_method: "not_automated",
    frequency: "weekly",
    risk_level: "high",
    risk_note: "No automation unless a stable authorized API or partner permission is available.",
    demo_inclusion: "no",
    demo_subset: false,
    evidence_required: EVIDENCE_REQUIRED,
  },
  {
    source_id: "SRC-10",
    source_name: "Cofacts",
    source_url: "https://cofacts.tw/",
    source_type: "fact_check_db",
    crawl_method: "manual_review",
    frequency: "weekly",
    risk_level: "medium",
    risk_note: "Use for misuse-context lookup and cite source URLs; do not treat context lookup as visual match proof.",
    demo_inclusion: "context_only",
    demo_subset: true,
    demo_slot: "D-04",
    demo_purpose: "Misuse-context signal.",
    evidence_required: EVIDENCE_REQUIRED,
  },
  {
    source_id: "SRC-11",
    source_name: "MyGoPen",
    source_url: "https://www.mygopen.com/",
    source_type: "fact_check_db",
    crawl_method: "manual_review",
    frequency: "weekly",
    risk_level: "medium",
    risk_note: "Use article URL and short citation-safe summaries only; avoid copying full content.",
    demo_inclusion: "context_only",
    demo_subset: false,
    evidence_required: EVIDENCE_REQUIRED,
  },
  {
    source_id: "SRC-12",
    source_name: "Taiwan FactCheck Center reports",
    source_url: "https://tfc-taiwan.org.tw/fact-check-reports-all/",
    source_type: "fact_check_db",
    crawl_method: "automated_public_page",
    frequency: "weekly",
    risk_level: "medium",
    risk_note: "MVP fetches the public reports page at low frequency; record source URLs and citation-safe summaries only.",
    demo_inclusion: "context_only",
    demo_subset: false,
    evidence_required: EVIDENCE_REQUIRED,
  },
  {
    source_id: "SRC-13",
    source_name: "LINE Fact Checker",
    source_url: "https://fact-checker.line.me/",
    source_type: "fact_check_db",
    crawl_method: "manual_review",
    frequency: "weekly",
    risk_level: "high",
    risk_note: "Use official entry points or partner authorization; do not bypass platform access controls.",
    demo_inclusion: "context_only",
    demo_subset: false,
    evidence_required: EVIDENCE_REQUIRED,
  },
  {
    source_id: "SRC-14",
    source_name: "Repost candidate query pool",
    source_url: "https://www.google.com/search?q=\"<asset_title>\"+\"<creator_name>\"",
    query_templates: [
      "https://www.google.com/search?q=\"<asset_title>\"+\"<creator_name>\"",
      "https://www.bing.com/search?q=\"<asset_title>\"+\"<creator_name>\"",
    ],
    source_type: "repost_candidate_pool",
    crawl_method: "search_query_only",
    frequency: "weekly",
    risk_level: "high",
    risk_note: "Use exact query terms for human triage; unverified sites remain candidates and are not public claims.",
    demo_inclusion: "yes",
    demo_subset: true,
    demo_slot: "D-05",
    demo_purpose: "Controlled repost candidate workflow.",
    evidence_required: EVIDENCE_REQUIRED,
  },
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(fileName, data) {
  fs.writeFileSync(path.join(OUTPUT_DIR, fileName), `${JSON.stringify(data, null, 2)}\n`);
}

function extractSourceIds(markdown) {
  return Array.from(new Set(markdown.match(/SRC-\d{2}/g) || [])).sort();
}

function encodeQueryTerms(terms) {
  return encodeURIComponent(terms.filter(Boolean).join(" "));
}

function buildQueryTerms(asset) {
  return [
    asset.display_title,
    asset.creator_name,
    asset.caption,
    asset.asset_id.slice(0, 16),
  ].filter((term) => typeof term === "string" && term.trim().length > 0);
}

function sourceUrlForRun(source, queryTerms) {
  const query = encodeQueryTerms(queryTerms);
  if (source.source_id === "SRC-03") {
    return `https://news.google.com/search?q=${query}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`;
  }
  if (source.source_id === "SRC-14") {
    return `https://www.google.com/search?q=${query}`;
  }
  return source.source_url;
}

function runModeForSource(source) {
  if (source.crawl_method === "automated_public_page") return "automated_public_channel_crawl";
  if (source.source_id === "SRC-03" || source.source_id === "SRC-14") return "search_query_only";
  return "manual_review";
}

function validateRequiredFields(rows, fields) {
  return rows.every((row) =>
    fields.every((field) => {
      const value = row[field];
      return Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null && value !== "";
    }),
  );
}

function containsProhibitedText(value) {
  const serialized = JSON.stringify(value);
  return PROHIBITED_TEXT_PATTERNS.some((pattern) => pattern.test(serialized));
}

function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const generatedAt = new Date().toISOString();
  const sourceMarkdown = fs.readFileSync(SOURCE_LIST, "utf8");
  const sourceIdsInMarkdown = extractSourceIds(sourceMarkdown);
  const demoAssets = readJson(DEMO_ASSETS);
  const indexValidation = readJson(INDEX_VALIDATION);
  const protectedAsset = demoAssets.find((asset) => asset.labels?.p0_candidate_needs_visual_review) || demoAssets[0];
  const queryTerms = buildQueryTerms(protectedAsset);
  const runId = `ttd-mvp-specified-source-${generatedAt.replace(/[-:.]/g, "").slice(0, 15)}Z`;

  const monitoredSources = SOURCE_FIXTURES.map((source) => ({
    ...source,
    monitoring_label: "specified-source monitoring",
    automation_allowed_by_default: AUTOMATED_CHANNEL_SOURCE_IDS.has(source.source_id),
    access_guardrail: "No login, paywall, age gate, anti-bot, robots.txt, or terms bypass is allowed.",
  }));

  const demoSources = monitoredSources.filter((source) => DEMO_SOURCE_IDS.includes(source.source_id));
  const sourceRuns = demoSources.map((source, index) => {
    const runMode = runModeForSource(source);
    return {
      run_id: `${runId}-${source.source_id}`,
      source_id: source.source_id,
      run_mode: runMode,
      started_at: generatedAt,
      completed_at: generatedAt,
      query_terms: queryTerms,
      status: "fixture_ready_for_human_review",
      notes:
        runMode === "automated_public_channel_crawl"
          ? "Configured for MVP public-page crawl; candidate images still require local fingerprint comparison and human review."
          : runMode === "search_query_only"
          ? "Query URL prepared for human review; no automated page retrieval was executed."
          : "Manual review fixture prepared; no automated page retrieval was executed.",
      demo_order: index + 1,
      source_url: sourceUrlForRun(source, queryTerms),
      screenshot_path_or_status: "not_captured_yet_manual_review_required",
      review_status: "unreviewed",
      public_claim_status: "internal_only",
    };
  });

  const simulatedRun = {
    run_id: `${runId}-SRC-14-SIM`,
    source_id: "SRC-14",
    run_mode: "simulated_fixture",
    started_at: generatedAt,
    completed_at: generatedAt,
    query_terms: queryTerms,
    status: "controlled_fixture_ready",
    notes:
      "Controlled simulation is available only if no actual reviewed source result is safe to use; it must not be counted as market validation.",
    source_url: "https://example.invalid/ttd-mvp/controlled-repost-candidate",
    screenshot_path_or_status: "fixture_placeholder_not_public_evidence",
    review_status: "simulated",
    public_claim_status: "internal_only",
  };

  const monitoringRun = {
    generated_at: generatedAt,
    run_id: runId,
    monitoring_label: "specified-source monitoring",
    run_scope: {
      candidate_sources: monitoredSources.length,
      demo_sources: demoSources.length,
      demo_source_ids: DEMO_SOURCE_IDS,
      protected_asset_id: protectedAsset.asset_id,
      protected_asset_title: protectedAsset.display_title,
      phase2_index_rows: indexValidation.coverage?.indexed_rows ?? null,
    },
    source_runs: [...sourceRuns, simulatedRun],
    limitations: [
      "This fixture prepares named-source review workflows only.",
      "Only automated_public_page sources are eligible for MVP public-page crawl; no login, paywall, age gate, anti-bot, robots, or terms bypass is allowed.",
      "Search discovery produces candidate URLs only; every candidate remains unreviewed until human review.",
      "The controlled simulation is not market validation and is not counted as an actual suspected event.",
    ],
  };

  const candidateSourceItems = sourceRuns.map((run) => ({
    candidate_item_id: `CSI-${run.source_id}-${protectedAsset.asset_id.slice(0, 12)}`,
    source_id: run.source_id,
    source_url: run.source_url,
    retrieved_at: generatedAt,
    screenshot_path_or_status: run.screenshot_path_or_status,
    query_terms: run.query_terms,
    review_status: run.review_status,
    public_claim_status: run.public_claim_status,
    protected_asset_id: protectedAsset.asset_id,
    evidence_label: "actual_source_configuration_pending_review",
    match_claim_status: "no_match_claimed",
    notes: "Candidate source item is prepared for human review and does not assert reuse or infringement.",
  }));

  candidateSourceItems.push({
    candidate_item_id: `CSI-SRC-14-SIM-${protectedAsset.asset_id.slice(0, 12)}`,
    source_id: "SRC-14",
    source_url: simulatedRun.source_url,
    retrieved_at: generatedAt,
    screenshot_path_or_status: simulatedRun.screenshot_path_or_status,
    query_terms: simulatedRun.query_terms,
    review_status: simulatedRun.review_status,
    public_claim_status: simulatedRun.public_claim_status,
    protected_asset_id: protectedAsset.asset_id,
    evidence_label: "simulated_fixture",
    match_claim_status: "controlled_simulation_only",
    notes: "Controlled fixture reserved for demo fallback; it is not an actual source finding.",
  });

  const monitoredSourcesDocument = {
    generated_at: generatedAt,
    monitoring_label: "specified-source monitoring",
    source_file: ".omni/harness/monitored-source-list-v1.md",
    source_count: monitoredSources.length,
    demo_source_count: demoSources.length,
    demo_source_ids: DEMO_SOURCE_IDS,
    monitored_sources: monitoredSources,
  };

  const validation = {
    generated_at: generatedAt,
    monitoring_label: "specified-source monitoring",
    expected: {
      source_count: 14,
      demo_source_count: 5,
      demo_source_ids: DEMO_SOURCE_IDS,
      allowed_run_modes: Array.from(SAFE_RUN_MODES),
    },
    actual: {
      source_count: monitoredSources.length,
      source_ids_in_markdown_count: sourceIdsInMarkdown.length,
      demo_source_count: demoSources.length,
      source_run_count: monitoringRun.source_runs.length,
      candidate_source_item_count: candidateSourceItems.length,
      run_mode_counts: monitoringRun.source_runs.reduce((acc, run) => {
        acc[run.run_mode] = (acc[run.run_mode] || 0) + 1;
        return acc;
      }, {}),
      protected_asset_id: protectedAsset.asset_id,
      phase2_index_rows: indexValidation.coverage?.indexed_rows ?? null,
    },
    pass: {
      all_14_sources_represented: monitoredSources.length === 14,
      pm_markdown_contains_all_source_ids: DEMO_SOURCE_IDS.every((id) => sourceIdsInMarkdown.includes(id)) && sourceIdsInMarkdown.length >= 14,
      demo_subset_identified: demoSources.length === 5 && DEMO_SOURCE_IDS.every((id) => demoSources.some((source) => source.source_id === id)),
      source_required_fields_present: validateRequiredFields(monitoredSources, REQUIRED_SOURCE_FIELDS),
      run_required_fields_present: validateRequiredFields(monitoringRun.source_runs, REQUIRED_RUN_FIELDS),
      candidate_required_fields_present: validateRequiredFields(candidateSourceItems, REQUIRED_CANDIDATE_FIELDS),
      run_modes_are_safe: monitoringRun.source_runs.every((run) => SAFE_RUN_MODES.has(run.run_mode)),
      automated_channel_count: monitoredSources.filter((source) => source.crawl_method === "automated_public_page").length >= 3,
      no_unsafe_automation: monitoredSources.every((source) =>
        source.automation_allowed_by_default === (source.crawl_method === "automated_public_page"),
      ),
      wording_uses_specified_source_monitoring: JSON.stringify({ monitoredSourcesDocument, monitoringRun }).includes("specified-source monitoring"),
      broad_web_claim_absent: !containsProhibitedText({ monitoredSourcesDocument, monitoringRun, candidateSourceItems }),
      paid_api_disabled_by_default: true,
    },
    limitations: [
      "This phase is a local fixture and configuration layer; actual public-page crawling runs through the namedChannelCrawler patrol adapter.",
      "Candidate source items are unreviewed or simulated; they do not assert suspected reuse.",
      "Additional platform-specific automation still requires robots, terms, API, or partner authorization review.",
      "Paid search and reverse-image APIs remain disabled.",
    ],
  };

  writeJson("monitored-sources.json", monitoredSourcesDocument);
  writeJson("monitoring-run.json", monitoringRun);
  writeJson("candidate-source-items.json", candidateSourceItems);
  writeJson("source-monitoring-validation.json", validation);

  console.log(
    JSON.stringify(
      {
        output_dir: path.relative(WORKSPACE_ROOT, OUTPUT_DIR),
        monitoring_label: "specified-source monitoring",
        source_count: monitoredSources.length,
        demo_source_count: demoSources.length,
        source_run_count: monitoringRun.source_runs.length,
        candidate_source_item_count: candidateSourceItems.length,
        run_mode_counts: validation.actual.run_mode_counts,
        paid_api_used: false,
      },
      null,
      2,
    ),
  );
}

main();

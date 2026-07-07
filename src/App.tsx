import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Download,
  ExternalLink,
  FileText,
  Images,
  LayoutDashboard,
  Radar,
  ScanLine,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/* ============================================================
 * Numbers · Original-Image Proactive Protection (PyroImage MVP)
 * UI = provenance-patrol console. Backend architecture unchanged:
 * every substantive value is read from the shipped patrol JSON
 * data files. Interactive scan / case actions are clearly-labelled
 * workflow demonstrations (local state only — no backend writes).
 * ============================================================ */

type Locale = "en" | "zh-TW";
type View = "dashboard" | "verify" | "alerts" | "case" | "vault" | "channels" | "reports";
type EvidenceLabel = "actual" | "sample" | "simulated" | "target" | "TBD";

interface DashboardMetric {
  id: string;
  label: string;
  value: number | string;
  value_display: string;
  evidence_label: EvidenceLabel;
  label_display?: string;
  source?: string;
  note?: string;
}

interface TtdDashboardMetrics {
  generated_at: string;
  metrics: DashboardMetric[];
}

interface DemoAsset {
  asset_id: string;
  cid?: string;
  display_title?: string;
  headline?: string;
  caption?: string;
  creator_name?: string;
  rights_holder_owner_name?: string;
  uploaded_at?: string;
  c2pa_status?: string;
  provenance_status?: string;
  certificate_link?: string;
  media_refs?: {
    thumbnail_url?: string;
    original_url_ref?: string;
    snapshot_url_ref?: string;
  };
  labels?: {
    visual_review_status?: string;
    visual_demo_eligible?: boolean;
  };
}

interface MonitoredSource {
  source_id: string;
  source_name: string;
  source_type: string;
  crawl_method: string;
  risk_level: string;
  demo_subset?: boolean;
}

interface AlertRecord {
  alert_id: string;
  alert_status: string;
  protected_asset_id: string;
  source_id: string;
  source_name?: string;
  source_url: string;
  retrieved_at?: string;
  match_basis?: string;
  similarity_score: number;
  similarity_distance: number;
  similarity_threshold: number;
  distance_scale?: string;
  transformation_notes?: string;
  review_status: string;
  evidence_label: string;
  public_claim_status: string;
  case_id?: string;
  display_copy?: {
    badge?: string;
    case_label?: string;
    public_use_notice?: string;
    reviewer_prompt?: string;
  };
  dashboard_metric_effect?: {
    suspected_events_actual?: number;
    simulated_cases?: number;
    counts_toward_market_validation?: boolean;
  };
}

interface EvidenceReportDocument {
  generated_at?: string;
  report_count: number;
  reports: Array<{
    report_id: string;
    alert_id?: string;
    case_id?: string;
    report_label: string;
    summary: string;
    sections?: {
      protected_original?: {
        title?: string;
        creator?: string;
        certificate_link?: string;
      };
      public_use_label?: {
        label?: string;
      };
    };
  }>;
}

interface VerificationDocument {
  generated_at?: string;
  verification_mode?: string;
  library: {
    indexed_rows: number;
    protected_originals_baseline?: number | null;
    full_image_rows_target?: number | null;
    scope_label?: string;
    match_basis?: string;
    threshold: number;
    distance_scale?: string;
    paid_api_used?: boolean;
  };
  queries: VerificationQuery[];
  pass?: Record<string, boolean>;
  limitations?: string[];
}

interface VerificationTopMatch {
  asset_id: string;
  display_title?: string;
  creator_name?: string;
  certificate_link?: string;
  media_ref?: string;
  ahash_distance?: number;
  dhash_distance?: number;
  combined_distance: number;
  similarity_score: number;
  match_basis?: string;
}

interface VerificationQuery {
  query_id: string;
  query_type: string;
  accepted_inputs: string[];
  display: {
    zh: string;
    en: string;
    title: string;
    subtitle?: string;
  };
  query_asset_id?: string;
  query_fingerprint: {
    ahash64: string;
    dhash64: string;
    fingerprint_value: string;
  };
  result: {
    top_match: VerificationTopMatch | null;
    top_matches: VerificationTopMatch[];
    pass_threshold: boolean;
  };
  verdict: {
    code: "registered_original" | "registered_derivative" | "not_registered" | "review_required";
    zh: string;
    en: string;
    tone: "match" | "clear" | "review";
    public_claim_status: string;
  };
  evidence_label: string;
  zero_external_cost: boolean;
  expected_pass: boolean;
  notes?: string[];
}

interface MonitoringRun {
  generated_at?: string;
  completed_at?: string;
  run_id?: string;
  monitoring_label?: string;
  status?: string;
  adapter?: {
    id?: string;
    mode?: string;
    paid_api_used?: boolean;
    billable_enabled?: boolean;
    dry_run?: boolean;
    budget_guard_respected?: boolean;
  };
  run_scope?: {
    protected_assets_considered?: number;
    alerts_created?: number;
    candidates_attempted?: number;
    candidates_matched?: number;
  };
  source_runs?: Array<{
    source_id?: string;
    source_name?: string;
    status?: string;
  }>;
}

interface TtdMvpData {
  dashboard: TtdDashboardMetrics;
  demoAssets: DemoAsset[];
  monitoredSources: { monitored_sources: MonitoredSource[] };
  monitoring: MonitoringRun;
  alerts: AlertRecord[];
  evidenceReport: EvidenceReportDocument;
  verification: VerificationDocument;
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: TtdMvpData };

const DATA_BASE = `${import.meta.env.BASE_URL}ttd-mvp/`;

const DATA_PATHS = {
  dashboard: `${DATA_BASE}dashboard-metrics.json`,
  demoAssets: `${DATA_BASE}demo-assets.json`,
  monitoredSources: `${DATA_BASE}monitored-sources.json`,
  monitoring: `${DATA_BASE}monitoring-run.json`,
  alerts: `${DATA_BASE}alerts.json`,
  evidenceReport: `${DATA_BASE}evidence-report.json`,
  verification: `${DATA_BASE}verification-fixtures.json`,
} as const;

const NUMBERS_LOGO_SRC = `${import.meta.env.BASE_URL}numbers-logo-horizontal-black.png`;
const MONO = "var(--text-mono-font-family)";
const LOCALE_STORAGE_KEY = "pyroimage-original-protection-locale";

/* Brand palette (Numbers) */
const C = {
  ink: "#1A1A1A",
  cream: "#F4E9D5",
  navStone: "#EFE3CC",
  green: "#7F9C7E",
  greenDeep: "#4f6a4e",
  orange: "#ED5D29",
  blue: "#2E52A0",
  stone: "#CEC0A3",
  amber: "#9a7a1e",
};

/* placeholder gradients used when a thumbnail is unavailable */
const GRADS = [
  "linear-gradient(180deg,#C1E1DC 0%,#8aab89 45%,#6f8a6e 70%,#9a8d6e 100%)",
  "linear-gradient(180deg,#F4E9D5 0%,#D8B76A 40%,#a89a78 75%,#8f8266 100%)",
  "linear-gradient(180deg,#C1E1DC 0%,#7F9C7E 45%,#5f7a5e 78%,#4a604a 100%)",
  "linear-gradient(180deg,#F9C6C0 0%,#CEC0A3 40%,#8aab89 75%,#6f8a6e 100%)",
];

/* ---------------- data-layer helpers (unchanged contract) ---------------- */

function formatClock(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function getInitialLocale(): Locale {
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored === "en" || stored === "zh-TW") return stored;
  } catch {
    /* localStorage may be unavailable in embedded preview contexts */
  }
  return "zh-TW";
}

function saveLocale(locale: Locale) {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    /* non-critical preference persistence */
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return (await response.json()) as T;
}

function shortFp(value?: string) {
  if (!value) return "N/A";
  if (value.length <= 22) return value;
  return `${value.slice(0, 14)}…${value.slice(-6)}`;
}

function formatDateForLocale(value: string | undefined, locale: Locale) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(locale, { timeZone: "Asia/Taipei" });
}

function getMetric(metrics: DashboardMetric[], id: string) {
  return metrics.find((metric) => metric.id === id);
}

function metricDisplay(metrics: DashboardMetric[], id: string, fallback: string) {
  return getMetric(metrics, id)?.value_display ?? fallback;
}

/* ---------------- bilingual micro-dictionary ---------------- */

const T = {
  tagline: "HUMAN TRUTH. MACHINE PROOF.",
  brand: { "zh-TW": "原創影像主動防護", en: "Original-Image Protection" },
  brandSub: "PYROIMAGE · PROVENANCE PATROL",
  menu: { "zh-TW": "主選單 · MENU", en: "Menu" },
  runPatrol: { "zh-TW": "執行巡檢", en: "Run patrol" },
  coverage: { "zh-TW": "保護範圍 · COVERAGE", en: "Coverage" },
  protectedOriginals: { "zh-TW": "受保護原創影像", en: "protected originals" },
  channels: { "zh-TW": "監控通路", en: "channels" },
  back: { "zh-TW": "← 返回警報列表", en: "← Back to alerts" },
} as const;

const NAV: Array<{ id: View; icon: LucideIcon; zh: string; en: string; eyebrow: string }> = [
  { id: "dashboard", icon: LayoutDashboard, zh: "巡檢台", en: "Patrol desk", eyebrow: "PATROL DESK" },
  { id: "verify", icon: ShieldCheck, zh: "貼圖查驗", en: "Verify", eyebrow: "VERIFY" },
  { id: "alerts", icon: Bell, zh: "疑似盜用", en: "Alerts", eyebrow: "ALERTS" },
  { id: "vault", icon: Images, zh: "原創庫", en: "Vault", eyebrow: "VAULT" },
  { id: "channels", icon: Radar, zh: "監控通路", en: "Channels", eyebrow: "CHANNELS" },
  { id: "reports", icon: FileText, zh: "存證報告", en: "Reports", eyebrow: "REPORTS" },
];

/* ---------------- view-model builders (from backend JSON) ---------------- */

interface WorkVM {
  assetId: string;
  name: string;
  en: string;
  author: string;
  owner: string;
  fp: string;
  sealed?: string;
  thumb: string;
  grad: string;
  certificate?: string;
  c2pa?: string;
  provenance?: string;
  reviewStatus?: string;
}

function buildWorks(assets: DemoAsset[], limit: number): WorkVM[] {
  return assets
    .filter((a) => a.media_refs?.thumbnail_url)
    .slice(0, limit)
    .map((a, i) => ({
      assetId: a.asset_id,
      name: a.display_title || a.headline || "—",
      en: a.caption || "",
      author: a.creator_name || "—",
      owner: a.rights_holder_owner_name || a.creator_name || "—",
      fp: shortFp(a.cid || a.asset_id),
      sealed: a.uploaded_at,
      thumb: a.media_refs?.thumbnail_url || "",
      grad: GRADS[i % GRADS.length],
      certificate: a.certificate_link,
      c2pa: a.c2pa_status,
      provenance: a.provenance_status,
      reviewStatus: a.labels?.visual_review_status,
    }));
}

interface ChannelVM {
  id: string;
  name: string;
  type: string;
  risk: string;
  status: "patrolling" | "queued" | "scheduled";
  hits: number;
}

function sourceTypeText(value: string, locale: Locale) {
  const zh: Record<string, string> = {
    news_aggregator: "新聞匯流",
    news_site: "新聞網站",
    search_discovery: "搜尋探索",
    public_forum: "公開論壇",
    public_social_page: "社群公開頁",
    fact_check_db: "事實查核",
    repost_candidate_pool: "轉貼候選池",
  };
  if (locale === "zh-TW") return zh[value] || value.replaceAll("_", " ");
  return value.replaceAll("_", " ");
}

function buildChannels(sources: MonitoredSource[], alerts: AlertRecord[], locale: Locale): ChannelVM[] {
  const hits: Record<string, number> = {};
  alerts.forEach((a) => {
    hits[a.source_id] = (hits[a.source_id] || 0) + 1;
  });
  return sources.map((s) => ({
    id: s.source_id,
    name: s.source_name,
    type: sourceTypeText(s.source_type, locale),
    risk: s.risk_level,
    status: s.demo_subset ? "patrolling" : s.crawl_method === "not_automated" ? "queued" : "scheduled",
    hits: hits[s.source_id] || 0,
  }));
}

interface TimelineItem {
  t?: string;
  zh: string;
  en: string;
}

interface AlertVM {
  id: string;
  assetId: string;
  work: string;
  workEn: string;
  author: string;
  fp: string;
  channel: string;
  sourceUrl: string;
  sim: number;
  risk: "high" | "med" | "low";
  status: string;
  simulated: boolean;
  caseLabel: string;
  detected?: string;
  thumb: string;
  grad: string;
  distance: number;
  threshold: number;
  notice: string;
  reviewerPrompt: string;
  transformation: string;
  certificate?: string;
  baseTimeline: TimelineItem[];
}

function buildAlert(
  a: AlertRecord,
  assetById: Map<string, DemoAsset>,
  sourceById: Map<string, MonitoredSource>,
  index: number,
): AlertVM {
  const asset = assetById.get(a.protected_asset_id);
  const src = sourceById.get(a.source_id);
  const sim = Math.round(a.similarity_score * 10000) / 100;
  const status = a.review_status === "pending_human_review" ? "reviewing" : a.alert_status || "reviewing";
  return {
    id: a.alert_id,
    assetId: a.protected_asset_id,
    work: asset?.display_title || asset?.headline || a.protected_asset_id,
    workEn: asset?.caption || "",
    author: asset?.creator_name || "—",
    fp: shortFp(asset?.cid || a.protected_asset_id),
    channel: a.source_name || src?.source_name || a.source_id,
    sourceUrl: a.source_url,
    sim,
    risk: sim >= 90 ? "high" : sim >= 80 ? "med" : "low",
    status,
    simulated: a.evidence_label === "simulated",
    caseLabel: a.display_copy?.case_label || "",
    detected: a.retrieved_at,
    thumb: asset?.media_refs?.thumbnail_url || "",
    grad: GRADS[index % GRADS.length],
    distance: a.similarity_distance,
    threshold: a.similarity_threshold,
    notice: a.display_copy?.public_use_notice || "",
    reviewerPrompt: a.display_copy?.reviewer_prompt || "",
    transformation: a.transformation_notes || "",
    certificate: asset?.certificate_link,
    baseTimeline: [
      { t: asset?.uploaded_at, zh: "原創影像簽署封存 SEALED", en: "Original sealed" },
      { t: asset?.uploaded_at, zh: "數位指紋寫入指紋庫 FINGERPRINTED", en: "Fingerprint indexed" },
      { t: a.retrieved_at, zh: "通路巡檢偵測到高相似影像 DETECTED", en: "Patrol detected high-similarity image" },
      { t: a.retrieved_at, zh: "證據快照待人工複審 PENDING REVIEW", en: "Evidence snapshot pending human review" },
    ],
  };
}

/* ---------------- presentational atoms ---------------- */

const STATUS_META: Record<string, { zh: string; en: string; c: string; bg: string }> = {
  new: { zh: "待處理", en: "New", c: "#ED5D29", bg: "#FAE0D6" },
  reviewing: { zh: "待複審", en: "Review", c: "#9a7a1e", bg: "#F6EDD3" },
  action: { zh: "已處置", en: "Actioned", c: "#2E52A0", bg: "#DCE4F3" },
  resolved: { zh: "已結案", en: "Resolved", c: "#4f6a4e", bg: "#E2EAE1" },
  dismissed: { zh: "誤判", en: "Dismissed", c: "#7d756a", bg: "#ECE7DB" },
};

function simColor(v: number) {
  return v >= 90 ? C.orange : v >= 80 ? C.amber : C.greenDeep;
}

function Thumb({ src, grad, className, sepia }: { src?: string; grad: string; className?: string; sepia?: boolean }) {
  return (
    <div className={`relative overflow-hidden ${className || ""}`} style={src ? undefined : { background: grad }}>
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          className={`h-full w-full object-cover ${sepia ? "contrast-125 sepia grayscale-[35%]" : ""}`}
        />
      ) : null}
      <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(255,255,255,0.10)_0_1px,transparent_1px_5px)]" />
    </div>
  );
}

function StatusPill({ status, locale }: { status: string; locale: Locale }) {
  const m = STATUS_META[status] || STATUS_META.reviewing;
  return (
    <span
      className="rounded-full px-2.5 py-1 text-[10px] font-semibold"
      style={{ color: m.c, background: m.bg, fontFamily: MONO }}
    >
      {locale === "zh-TW" ? m.zh : m.en}
    </span>
  );
}

function DemoTag({ locale }: { locale: Locale }) {
  return (
    <span
      className="rounded-full border border-[#d8c07a] bg-[#f8f1e2] px-2 py-0.5 text-[10px] font-semibold text-[#8a6d1f]"
      style={{ fontFamily: MONO }}
    >
      {locale === "zh-TW" ? "示範案件" : "Demo case"}
    </span>
  );
}

/* ---------------- main component ---------------- */

export function TtdMvpDashboard() {
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [locale, setLocale] = useState<Locale>(getInitialLocale);
  const [clock, setClock] = useState<string>(() => formatClock(new Date()));

  const [view, setView] = useState<View>("dashboard");
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "high" | "open" | "done">("all");
  const [certAssetId, setCertAssetId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; kind: "ok" | "alert" } | null>(null);

  const [scanning, setScanning] = useState(false);
  const [scanPct, setScanPct] = useState(0);
  const [scanChannel, setScanChannel] = useState("");

  // mutable, demonstration-only overlays on top of backend data
  const [statusOverride, setStatusOverride] = useState<Record<string, string>>({});
  const [extraEvents, setExtraEvents] = useState<Record<string, TimelineItem[]>>({});
  const [addedReports, setAddedReports] = useState<
    Array<{ id: string; work: string; caseId: string; typeZh: string; typeEn: string }>
  >([]);

  useEffect(() => {
    const timer = setInterval(() => setClock(formatClock(new Date())), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetchJson<TtdDashboardMetrics>(DATA_PATHS.dashboard),
      fetchJson<DemoAsset[]>(DATA_PATHS.demoAssets),
      fetchJson<{ monitored_sources: MonitoredSource[] }>(DATA_PATHS.monitoredSources),
      fetchJson<MonitoringRun>(DATA_PATHS.monitoring),
      fetchJson<AlertRecord[]>(DATA_PATHS.alerts),
      fetchJson<EvidenceReportDocument>(DATA_PATHS.evidenceReport),
      fetchJson<VerificationDocument>(DATA_PATHS.verification),
    ])
      .then(([dashboard, demoAssets, monitoredSources, monitoring, alerts, evidenceReport, verification]) => {
        if (!alive) return;
        setLoadState({
          status: "ready",
          data: { dashboard, demoAssets, monitoredSources, monitoring, alerts, evidenceReport, verification },
        });
      })
      .catch((error: Error) => {
        if (!alive) return;
        setLoadState({ status: "error", message: error.message });
      });
    return () => {
      alive = false;
    };
  }, []);

  const handleLocale = (next: Locale) => {
    setLocale(next);
    saveLocale(next);
  };

  const go = (next: View) => {
    setView(next);
    const main = document.getElementById("ttd-main");
    if (main) main.scrollTo(0, 0);
  };

  const showToast = (msg: string, kind: "ok" | "alert" = "ok") => {
    setToast({ msg, kind });
    window.setTimeout(() => setToast(null), 3200);
  };

  const data = loadState.status === "ready" ? loadState.data : null;

  const works = useMemo(() => (data ? buildWorks(data.demoAssets, 9) : []), [data]);
  const channels = useMemo(
    () => (data ? buildChannels(data.monitoredSources.monitored_sources, data.alerts, locale) : []),
    [data, locale],
  );
  const alerts = useMemo(() => {
    if (!data) return [] as AlertVM[];
    const assetById = new Map(data.demoAssets.map((a) => [a.asset_id, a]));
    const sourceById = new Map(data.monitoredSources.monitored_sources.map((s) => [s.source_id, s]));
    return data.alerts.map((a, i) => {
      const vm = buildAlert(a, assetById, sourceById, i);
      return { ...vm, status: statusOverride[vm.id] || vm.status };
    });
  }, [data, statusOverride]);

  const runPatrol = () => {
    if (scanning || channels.length === 0) return;
    const names = channels.map((c) => c.name);
    let pct = 0;
    setScanning(true);
    setScanPct(0);
    setScanChannel(names[0]);
    const timer = setInterval(() => {
      pct += 5;
      const idx = Math.min(names.length - 1, Math.floor((pct / 100) * names.length));
      if (pct >= 100) {
        clearInterval(timer);
        setScanPct(100);
        setScanChannel(names[names.length - 1]);
        setScanning(false);
        showToast(
          locale === "zh-TW"
            ? "巡檢完成：未發現新的真實侵權（示範環境）"
            : "Patrol complete: no new real infringement found (demo environment)",
          "ok",
        );
      } else {
        setScanPct(pct);
        setScanChannel(names[idx]);
      }
    }, 90);
  };

  const caseAction = (type: "dmca" | "report" | "archive" | "contact" | "dismiss", alert: AlertVM) => {
    const now = formatClock(new Date());
    const events: Record<typeof type, TimelineItem> = {
      dmca: { t: now, zh: "已記錄 DMCA 下架通知（示範）", en: "Logged DMCA takedown (demo)" },
      report: { t: now, zh: "已產生區塊鏈存證報告（示範）", en: "Generated evidence report (demo)" },
      archive: { t: now, zh: "證據快照已封存（示範）", en: "Evidence snapshot archived (demo)" },
      contact: { t: now, zh: "已記錄聯絡通知（示範）", en: "Contact notice logged (demo)" },
      dismiss: { t: now, zh: "已標記為誤判 DISMISSED", en: "Marked as false positive" },
    };
    setExtraEvents((prev) => ({ ...prev, [alert.id]: [...(prev[alert.id] || []), events[type]] }));
    if (type === "dmca") setStatusOverride((prev) => ({ ...prev, [alert.id]: "action" }));
    if (type === "dismiss") setStatusOverride((prev) => ({ ...prev, [alert.id]: "dismissed" }));
    if (type === "report") {
      setAddedReports((prev) => [
        {
          id: `R-${String(prev.length + 8).padStart(4, "0")}`,
          work: `${alert.work} ${alert.workEn}`.trim(),
          caseId: alert.id,
          typeZh: "區塊鏈存證報告（示範）",
          typeEn: "Evidence report (demo)",
        },
        ...prev,
      ]);
    }
    const msg: Record<typeof type, string> = {
      dmca: locale === "zh-TW" ? "已記錄 DMCA 下架通知（示範）" : "DMCA takedown logged (demo)",
      report: locale === "zh-TW" ? "存證報告已生成（示範）" : "Evidence report generated (demo)",
      archive: locale === "zh-TW" ? "證據已封存（示範）" : "Evidence archived (demo)",
      contact: locale === "zh-TW" ? "已記錄聯絡通知（示範）" : "Contact notice logged (demo)",
      dismiss: locale === "zh-TW" ? "已標記為誤判" : "Marked as false positive",
    };
    showToast(msg[type], "ok");
  };

  if (loadState.status === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F4E9D5]">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#1A1A1A] border-t-transparent" />
      </main>
    );
  }
  if (loadState.status === "error") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F4E9D5] px-6">
        <div className="max-w-lg rounded-[12px] border border-[#ED5D29] bg-white p-6">
          <TriangleAlert className="mb-3 text-[#ED5D29]" size={24} />
          <h1 className="text-lg font-semibold text-[#1A1A1A]">
            {locale === "zh-TW" ? "資料載入失敗" : "Failed to load data"}
          </h1>
          <p className="mt-2 text-sm text-[#6b5f4f]">{loadState.message}</p>
        </div>
      </main>
    );
  }

  const metrics = loadState.data.dashboard.metrics;
  const protectedDisplay = metricDisplay(metrics, "protected_originals", "4,329");
  const channelsTotalDisplay = metricDisplay(metrics, "monitored_sources", String(channels.length));
  const channelsActiveDisplay = metricDisplay(metrics, "demo_monitored_sources", "5");
  const reportsBackend = loadState.data.evidenceReport.reports;
  const reportCount = reportsBackend.length + addedReports.length;
  const suspectedActual = metricDisplay(metrics, "suspected_events", "0");
  const openCount = alerts.filter((a) => a.status === "new" || a.status === "reviewing").length;
  const highCount = alerts.filter((a) => a.risk === "high").length;
  const realPatrolMatches = alerts.filter((a) => !a.simulated).length;
  const lastPatrol = formatDateForLocale(loadState.data.monitoring.completed_at || loadState.data.monitoring.generated_at, locale);
  const lastRunSources = new Set(
    (loadState.data.monitoring.source_runs || []).map((run) => run.source_id || run.source_name).filter(Boolean),
  );
  const lastRunSourceCount = lastRunSources.size || Number(channelsActiveDisplay.replace(/,/g, "")) || channels.length;
  const lastRunCandidates = loadState.data.monitoring.run_scope?.candidates_attempted ?? 0;
  const lastRunAlerts = loadState.data.monitoring.run_scope?.alerts_created ?? alerts.length;
  const patrolAdapter = loadState.data.monitoring.adapter?.id || "unknown";
  const patrolStatus = loadState.data.monitoring.status || "unknown";

  const activeCase = alerts.find((a) => a.id === activeCaseId) || null;
  const certWork = works.find((w) => w.assetId === certAssetId) || null;

  return (
    <main
      lang={locale}
      className="flex h-screen flex-col overflow-hidden bg-[#F4E9D5] text-[#1A1A1A]"
      style={{ fontFamily: "var(--text-main-font-family)" }}
    >
      {/* ===== Topbar ===== */}
      <header className="z-30 flex h-[60px] flex-none items-center justify-between gap-4 bg-[#1A1A1A] px-4 text-[#F4E9D5] md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <img
            src={NUMBERS_LOGO_SRC}
            alt="Numbers"
            className="h-7 w-[118px] flex-none object-contain object-left brightness-0 invert sm:w-[136px]"
            decoding="async"
          />
          <div className="hidden min-w-0 leading-tight sm:block">
            <p className="truncate text-sm font-semibold">
              {T.brand[locale]}
            </p>
            <p className="text-[10px] tracking-[0.13em] text-[#7F9C7E]" style={{ fontFamily: MONO }}>
              {T.brandSub}
            </p>
          </div>
        </div>
        <p className="hidden text-[12px] tracking-[0.3em] text-[#CEC0A3] lg:block" style={{ fontFamily: MONO }}>
          {T.tagline}
        </p>
        <div className="flex flex-none items-center gap-3">
          <span className="hidden items-center gap-2 text-[11px] text-[#CEC0A3] sm:flex" style={{ fontFamily: MONO }}>
            <span className="ttd-pulse inline-block h-[7px] w-[7px] rounded-full bg-[#7F9C7E]" />
            {clock}
          </span>
          <LangToggle locale={locale} onChange={handleLocale} />
          <button
            type="button"
            onClick={runPatrol}
            className="flex items-center gap-2 rounded-[8px] bg-[#7F9C7E] px-3.5 py-2 text-xs font-semibold text-[#1A1A1A] transition-colors hover:bg-[#8fab8e]"
          >
            <ScanLine size={14} />
            {T.runPatrol[locale]}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ===== Nav rail ===== */}
        <nav className="hidden w-[228px] flex-none flex-col gap-1.5 border-r border-[#1a1a1a1a] bg-[#EFE3CC] p-3.5 md:flex">
          <p className="px-3 pb-2.5 pt-1.5 text-[9px] tracking-[0.18em] text-[#1a1a1a66]" style={{ fontFamily: MONO }}>
            {T.menu[locale]}
          </p>
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = view === item.id || (item.id === "alerts" && view === "case");
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => go(item.id)}
                className={`flex items-center gap-3 rounded-[10px] px-3 py-3 text-left transition-colors ${
                  active ? "bg-[#1A1A1A] text-[#F4E9D5]" : "text-[#1A1A1A] hover:bg-[#e3d4b6]"
                }`}
              >
                <Icon size={18} className="flex-none" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-semibold">{locale === "zh-TW" ? item.zh : item.en}</span>
                  <span className="block text-[9px] tracking-[0.1em] opacity-60" style={{ fontFamily: MONO }}>
                    {item.eyebrow}
                  </span>
                </span>
                {item.id === "alerts" && openCount > 0 && (
                  <span
                    className="flex-none rounded-full bg-[#ED5D29] px-2 py-0.5 text-[11px] font-semibold text-white"
                    style={{ fontFamily: MONO }}
                  >
                    {openCount}
                  </span>
                )}
              </button>
            );
          })}

          <div className="mt-auto rounded-[12px] bg-[#1A1A1A] p-4 text-[#F4E9D5]">
            <p className="mb-2 text-[9px] tracking-[0.14em] text-[#7F9C7E]" style={{ fontFamily: MONO }}>
              {T.coverage[locale]}
            </p>
            <p className="text-[26px] font-bold leading-none" style={{ fontFamily: MONO }}>
              {protectedDisplay}
            </p>
            <p className="mt-0.5 text-[11px] text-[#CEC0A3]">{T.protectedOriginals[locale]}</p>
            <div className="my-3 h-px bg-[#f4e9d526]" />
            <div className="flex justify-between text-[11px] text-[#CEC0A3]">
              <span>{T.channels[locale]}</span>
              <span className="text-[#F4E9D5]" style={{ fontFamily: MONO }}>
                {channelsTotalDisplay}
              </span>
            </div>
          </div>
        </nav>

        {/* ===== Main scroll area ===== */}
        <div id="ttd-main" className="relative min-w-0 flex-1 overflow-y-auto">
          {scanning && (
            <ScanOverlay pct={scanPct} channel={scanChannel} locale={locale} />
          )}

          {/* mobile nav */}
          <div className="flex gap-2 overflow-x-auto border-b border-[#1a1a1a14] bg-[#EFE3CC] px-4 py-2 md:hidden">
            {NAV.map((item) => {
              const active = view === item.id || (item.id === "alerts" && view === "case");
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => go(item.id)}
                  className={`flex-none rounded-full px-3 py-1.5 text-xs font-semibold ${
                    active ? "bg-[#1A1A1A] text-[#F4E9D5]" : "text-[#1A1A1A]"
                  }`}
                >
                  {locale === "zh-TW" ? item.zh : item.en}
                </button>
              );
            })}
          </div>

          {view === "dashboard" && (
            <DashboardView
              locale={locale}
              openCount={openCount}
              realPatrolMatches={realPatrolMatches}
              lastPatrol={lastPatrol}
              protectedDisplay={protectedDisplay}
              lastRunSourceCount={lastRunSourceCount}
              lastRunCandidates={lastRunCandidates}
              lastRunAlerts={lastRunAlerts}
              patrolAdapter={patrolAdapter}
              patrolStatus={patrolStatus}
              reportCount={reportCount}
              suspectedActual={suspectedActual}
              alerts={alerts}
              channels={channels}
              onOpenCase={(id) => {
                setActiveCaseId(id);
                go("case");
              }}
              onNavigate={go}
            />
          )}

          {view === "verify" && (
            <VerificationView
              locale={locale}
              verification={loadState.data.verification}
              works={works}
              onOpenCert={(id) => setCertAssetId(id)}
            />
          )}

          {view === "alerts" && (
            <AlertsView
              locale={locale}
              alerts={alerts}
              filter={filter}
              setFilter={setFilter}
              counts={{ all: alerts.length, high: highCount, open: openCount, done: alerts.length - openCount }}
              onOpenCase={(id) => {
                setActiveCaseId(id);
                go("case");
              }}
            />
          )}

          {view === "case" && activeCase && (
            <CaseView
              locale={locale}
              vm={activeCase}
              extraEvents={extraEvents[activeCase.id] || []}
              onBack={() => go("alerts")}
              onAction={(type) => caseAction(type, activeCase)}
            />
          )}

          {view === "vault" && (
            <VaultView locale={locale} works={works} onOpenCert={(id) => setCertAssetId(id)} />
          )}

          {view === "channels" && (
            <ChannelsView locale={locale} channels={channels} onRunPatrol={runPatrol} />
          )}

          {view === "reports" && (
            <ReportsView
              locale={locale}
              backend={reportsBackend}
              added={addedReports}
              works={works}
              alerts={alerts}
              onExport={(id) =>
                showToast(locale === "zh-TW" ? `已匯出存證報告 ${id}（示範）` : `Exported report ${id} (demo)`, "ok")
              }
            />
          )}
        </div>
      </div>

      {certWork && <CertModal locale={locale} work={certWork} onClose={() => setCertAssetId(null)} />}
      {toast && <Toast msg={toast.msg} kind={toast.kind} />}
    </main>
  );
}

/* ---------------- language toggle ---------------- */

function LangToggle({ locale, onChange }: { locale: Locale; onChange: (l: Locale) => void }) {
  const items: Array<{ id: Locale; label: string }> = [
    { id: "zh-TW", label: "繁中" },
    { id: "en", label: "EN" },
  ];
  return (
    <div className="inline-flex items-center gap-1 rounded-[8px] border border-[#ffffff22] p-1">
      {items.map((it) => {
        const selected = locale === it.id;
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onChange(it.id)}
            aria-pressed={selected}
            className={`rounded-[6px] px-2.5 py-1 text-xs font-semibold transition-colors ${
              selected ? "bg-[#F4E9D5] text-[#1A1A1A]" : "text-[#CEC0A3] hover:text-[#F4E9D5]"
            }`}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- scan overlay ---------------- */

function ScanOverlay({ pct, channel, locale }: { pct: number; channel: string; locale: Locale }) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#1a1a1ab8] backdrop-blur-[3px]">
      <div className="w-[430px] max-w-[90%] rounded-[16px] border border-[#7f9c7e66] bg-[#1A1A1A] px-10 py-9 text-center">
        <Radar size={48} className="mx-auto animate-spin text-[#7F9C7E]" style={{ animationDuration: "1.4s" }} />
        <p className="mt-4 text-base font-semibold text-[#F4E9D5]">
          {locale === "zh-TW" ? "通路巡檢中 · PATROLLING" : "Patrolling channels"}
        </p>
        <p className="mt-1.5 text-xs text-[#CEC0A3]" style={{ fontFamily: MONO }}>
          {locale === "zh-TW" ? "掃描通路：" : "Scanning: "}
          {channel}
        </p>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#f4e9d526]">
          <div className="h-full rounded-full bg-[#7F9C7E] transition-[width] duration-100" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-[11px] font-semibold text-[#7F9C7E]" style={{ fontFamily: MONO }}>
          {pct}%
        </p>
      </div>
    </div>
  );
}

/* ---------------- dashboard view ---------------- */

function PageHead({
  dot,
  eyebrow,
  title,
  desc,
}: {
  dot: string;
  eyebrow: string;
  title: string;
  desc?: string;
}) {
  return (
    <div className="mb-5">
      <p className="mb-2 flex items-center gap-2 text-[11px] tracking-[0.16em]" style={{ fontFamily: MONO, color: dot }}>
        <span className="inline-block h-[7px] w-[7px] rounded-full" style={{ background: dot }} />
        {eyebrow}
      </p>
      <h1 className="text-[30px] font-semibold leading-[1.1]" style={{ fontFamily: MONO }}>
        {title}
      </h1>
      {desc && <p className="mt-2 max-w-[640px] text-[13.5px] leading-6 text-[#1a1a1a99]">{desc}</p>}
    </div>
  );
}

function KpiCard({
  index,
  label,
  sub,
  value,
  color,
  dark,
}: {
  index: string;
  label: string;
  sub: string;
  value: string;
  color: string;
  dark?: boolean;
}) {
  return (
    <div
      className={`flex min-h-[128px] flex-col justify-between rounded-[14px] p-[18px] ${
        dark ? "bg-[#1A1A1A] text-[#F4E9D5]" : "border border-[#1a1a1a12] bg-white"
      }`}
    >
      <div className="flex justify-between">
        <p className={`text-[11px] ${dark ? "text-[#CEC0A3]" : "text-[#1a1a1a99]"}`}>{label}</p>
        <span className="text-[10px]" style={{ fontFamily: MONO, color: dark ? "#f4e9d566" : "#1a1a1a40" }}>
          {index}
        </span>
      </div>
      <div>
        <p className="text-[40px] font-bold leading-none" style={{ fontFamily: MONO, color }}>
          {value}
        </p>
        <p className="mt-1.5 text-[10px] tracking-[0.08em] text-[#9b8f78]" style={{ fontFamily: MONO }}>
          {sub}
        </p>
      </div>
    </div>
  );
}

function DashboardView(props: {
  locale: Locale;
  lastPatrol: string;
  openCount: number;
  realPatrolMatches: number;
  protectedDisplay: string;
  lastRunSourceCount: number;
  lastRunCandidates: number;
  lastRunAlerts: number;
  patrolAdapter: string;
  patrolStatus: string;
  reportCount: number;
  suspectedActual: string;
  alerts: AlertVM[];
  channels: ChannelVM[];
  onOpenCase: (id: string) => void;
  onNavigate: (v: View) => void;
}) {
  const { locale, lastPatrol, openCount, protectedDisplay, reportCount, suspectedActual } = props;
  const zh = locale === "zh-TW";
  const hasAlerts = props.alerts.length > 0;
  const hasOnlyDemoAlerts = hasAlerts && props.realPatrolMatches === 0;
  const honestyText = !hasAlerts
    ? zh
      ? `目前真實侵權案件：${suspectedActual} 件。最近一次巡檢未產生警報。`
      : `Real infringement cases so far: ${suspectedActual}. The latest patrol did not produce alerts.`
    : hasOnlyDemoAlerts
    ? zh
      ? `目前真實侵權案件：${suspectedActual} 件。以下警報為示範案件，用於展示「巡檢 → 分流 → 存證」的完整流程，不計入真實侵權統計。`
      : `Real infringement cases so far: ${suspectedActual}. The alerts below are demonstration cases that show the full patrol -> triage -> evidence workflow and do not count as real infringement.`
    : zh
    ? `目前真實侵權案件：${suspectedActual} 件。${props.realPatrolMatches} 筆警報來自實際抓取候選影像與感知雜湊命中；來源授權與外部侵權主張仍需人工確認。`
    : `Real infringement cases so far: ${suspectedActual}. ${props.realPatrolMatches} alert(s) came from real fetched candidates and perceptual-hash matches; source authorization and external infringement claims still require human review.`;
  const steps: Array<{ target: View; accent: string; step: string; label: string; note: string; value: string; unit: string }> = [
    { target: "vault", accent: C.green, step: "STEP 01", label: zh ? "入庫簽署" : "Register", note: zh ? "建立數位指紋與來源憑證" : "Create fingerprint & origin proof", value: protectedDisplay, unit: zh ? "受保護" : "protected" },
    { target: "channels", accent: C.blue, step: "STEP 02", label: zh ? "通路巡檢" : "Patrol", note: zh ? "最近一次巡檢的來源與候選影像" : "Latest run sources and candidates", value: props.lastRunCandidates.toString(), unit: zh ? "候選" : "candidates" },
    { target: "alerts", accent: C.orange, step: "STEP 03", label: zh ? "疑似盜用警報" : "Triage", note: zh ? "高相似自動發報並分流複審" : "Auto-flag & route for human review", value: openCount.toString(), unit: zh ? "待複審" : "to review" },
    { target: "reports", accent: C.ink, step: "STEP 04", label: zh ? "存證交付" : "Certify", note: zh ? "產生上鏈存證報告交付法務" : "Generate on-chain evidence report", value: reportCount.toString(), unit: zh ? "份" : "reports" },
  ];

  return (
    <div className="max-w-[1240px] px-6 py-7 md:px-9">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <PageHead
          dot={C.green}
          eyebrow={zh ? "主動防護中 · ACTIVE PROTECTION" : "Active protection"}
          title={zh ? "原創影像主動防護" : "Original-image protection"}
          desc={
            zh
              ? "為 PyroImage 的每一張原創影像建立數位指紋，持續到指定通路巡檢是否遭到盜用；一旦發現高度相似影像就自動發報，並產生可交付的存證報告。"
              : "Every PyroImage original gets a digital fingerprint, then designated channels are continuously patrolled for copies. High-similarity hits are flagged automatically and packaged into a deliverable evidence report."
          }
        />
        <p className="text-[11px] text-[#1a1a1a80]" style={{ fontFamily: MONO }}>
          {zh ? "最近巡檢時間" : "Last patrol"}
          <br />
          <span className="text-[13px] text-[#1A1A1A]">{lastPatrol}</span>
          <br />
          <span className="text-[10px] text-[#1a1a1a80]">
            {props.patrolAdapter} · {props.patrolStatus} · {props.lastRunSourceCount} {zh ? "來源" : "sources"} · {props.lastRunAlerts} {zh ? "警報" : "alerts"}
          </span>
        </p>
      </div>

      {/* KPIs */}
      <div className="mb-4 grid grid-cols-2 gap-3.5 xl:grid-cols-4">
        <KpiCard index="01" label={zh ? "待複審警報" : "Open alerts"} sub={zh ? "OPEN · 待人工確認" : "OPEN · pending review"} value={openCount.toString()} color={C.orange} dark />
        <KpiCard index="02" label={zh ? "受保護原創" : "Protected"} sub="PROTECTED" value={protectedDisplay} color={C.green} />
        <KpiCard index="03" label={zh ? "本次巡檢候選" : "Run candidates"} sub={zh ? `${props.lastRunSourceCount} 來源` : `${props.lastRunSourceCount} sources`} value={props.lastRunCandidates.toString()} color={C.blue} />
        <KpiCard index="04" label={zh ? "已存證報告" : "Evidence reports"} sub="REPORTS" value={reportCount.toString()} color={C.ink} />
      </div>

      {/* honesty banner */}
      <div className="mb-6 flex items-start gap-2 rounded-[10px] border border-[#cfe0cb] bg-[#eef4ea] px-4 py-3 text-xs leading-5 text-[#3f5a3e]">
        <ShieldCheck size={15} className="mt-0.5 flex-none text-[#4f6a4e]" />
        <span>{honestyText}</span>
      </div>

      {/* 4-step flow */}
      <div className="mb-6 rounded-[14px] border border-[#1a1a1a12] bg-white p-5">
        <p className="mb-4 text-[10px] tracking-[0.16em] text-[#1a1a1a73]" style={{ fontFamily: MONO }}>
          {zh ? "保護流程 · 點選任一步驟前往對應畫面" : "How it works · click a step to open it"}
        </p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {steps.map((s) => (
            <button
              key={s.step}
              type="button"
              onClick={() => props.onNavigate(s.target)}
              className="group rounded-[10px] border border-[#1a1a1a12] p-3.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-[0_6px_18px_rgba(26,26,26,0.08)]"
              style={{ borderTopColor: s.accent, borderTopWidth: 3 }}
            >
              <p className="text-[11px] font-semibold" style={{ fontFamily: MONO, color: s.accent }}>
                {s.step}
              </p>
              <p className="mt-1.5 text-[15px] font-semibold">{s.label}</p>
              <p className="mt-1 text-[12px] text-[#1a1a1a8c]">{s.note}</p>
              <p className="mt-2 text-[19px] font-bold" style={{ fontFamily: MONO, color: s.accent }}>
                {s.value} <span className="text-[12px] text-[#1a1a1a73]">{s.unit}</span>
              </p>
              <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-[#374037] opacity-0 transition-opacity group-hover:opacity-100">
                {zh ? "前往" : "Open"} <ArrowRight size={12} />
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* two columns */}
      <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
        <div className="overflow-hidden rounded-[14px] border border-[#1a1a1a12] bg-white">
          <div className="flex items-center justify-between px-5 pb-3 pt-[18px]">
            <div>
              <p className="text-[16px] font-semibold">{zh ? "最新疑似盜用" : "Latest detections"}</p>
              <p className="text-[10px] tracking-[0.1em] text-[#1a1a1a73]" style={{ fontFamily: MONO }}>
                LATEST DETECTIONS
              </p>
            </div>
            <button type="button" onClick={() => props.onNavigate("alerts")} className="text-xs font-semibold text-[#2E52A0]">
              {zh ? "全部 →" : "All →"}
            </button>
          </div>
          {props.alerts.length === 0 && (
            <p className="border-t border-[#1a1a1a0f] px-5 py-6 text-sm text-[#1a1a1a73]">
              {zh ? "目前沒有疑似盜用記錄。" : "No detections yet."}
            </p>
          )}
          {props.alerts.slice(0, 5).map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => props.onOpenCase(a.id)}
              className="flex w-full items-center gap-3.5 border-t border-[#1a1a1a0f] px-5 py-3 text-left transition-colors hover:bg-[#FBF6EC]"
            >
              <Thumb src={a.thumb} grad={a.grad} sepia className="h-[46px] w-[46px] flex-none rounded-[7px]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold">
                  {a.work} <span className="font-normal text-[#1a1a1a66]">／ {a.workEn}</span>
                </span>
                <span className="block text-[11px] text-[#1a1a1a80]" style={{ fontFamily: MONO }}>
                  {a.channel} · {formatDateForLocale(a.detected, locale)}
                </span>
              </span>
              <span className="flex-none text-right">
                <span className="block text-[16px] font-bold" style={{ fontFamily: MONO, color: simColor(a.sim) }}>
                  {a.sim}%
                </span>
                <span className="block text-[9px] text-[#1a1a1a66]" style={{ fontFamily: MONO }}>
                  MATCH
                </span>
              </span>
              <StatusPill status={a.status} locale={locale} />
            </button>
          ))}
        </div>

        <div className="overflow-hidden rounded-[14px] border border-[#1a1a1a12] bg-white">
          <div className="px-5 pb-3 pt-[18px]">
            <p className="text-[16px] font-semibold">{zh ? "通路巡檢狀態" : "Channel status"}</p>
            <p className="text-[10px] tracking-[0.1em] text-[#1a1a1a73]" style={{ fontFamily: MONO }}>
              CHANNEL STATUS
            </p>
          </div>
          {props.channels.slice(0, 6).map((c) => (
            <div key={c.id} className="flex items-center gap-3 border-t border-[#1a1a1a0f] px-5 py-2.5">
              <span className="h-2 w-2 flex-none rounded-full" style={{ background: chDot(c.status) }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold">{c.name}</span>
                <span className="block text-[10px] text-[#1a1a1a73]" style={{ fontFamily: MONO }}>
                  {c.type}
                </span>
              </span>
              <span className="flex-none text-[11px] font-semibold" style={{ fontFamily: MONO, color: chDot(c.status) }}>
                {chLabel(c.status, locale)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function chDot(status: ChannelVM["status"]) {
  return status === "patrolling" ? C.green : status === "scheduled" ? C.blue : C.stone;
}
function chLabel(status: ChannelVM["status"], locale: Locale) {
  const zh = { patrolling: "巡檢中", scheduled: "排程中", queued: "待授權" };
  const en = { patrolling: "Patrolling", scheduled: "Scheduled", queued: "Needs auth" };
  return (locale === "zh-TW" ? zh : en)[status];
}

/* ---------------- verification view ---------------- */

function verificationToneColor(tone: VerificationQuery["verdict"]["tone"]) {
  if (tone === "match") return C.greenDeep;
  if (tone === "clear") return C.blue;
  return C.amber;
}

function VerificationView({
  locale,
  verification,
  works,
  onOpenCert,
}: {
  locale: Locale;
  verification: VerificationDocument;
  works: WorkVM[];
  onOpenCert: (id: string) => void;
}) {
  const zh = locale === "zh-TW";
  const firstQuery = verification.queries[0] || null;
  const [activeQueryId, setActiveQueryId] = useState(firstQuery?.query_id || "");
  const [inputValue, setInputValue] = useState(firstQuery?.accepted_inputs[0] || "");
  const [inputState, setInputState] = useState<"matched" | "unsupported">("matched");
  const activeQuery = verification.queries.find((query) => query.query_id === activeQueryId) || firstQuery;
  const worksById = useMemo(() => new Map(works.map((work) => [work.assetId, work])), [works]);

  if (!activeQuery) {
    return (
      <div className="max-w-[1240px] px-6 py-7 md:px-9">
        <PageHead
          dot={C.green}
          eyebrow={zh ? "貼圖查驗 · ORIGIN VERIFY" : "Origin verify"}
          title={zh ? "本機查驗結果尚未建立" : "Verification data unavailable"}
        />
      </div>
    );
  }

  const topMatch = activeQuery.result.top_match;
  const queryWork = activeQuery.query_asset_id ? worksById.get(activeQuery.query_asset_id) : undefined;
  const matchWork = topMatch ? worksById.get(topMatch.asset_id) : undefined;
  const previewWork = queryWork || matchWork;
  const verdictColor = verificationToneColor(activeQuery.verdict.tone);
  const similarityPct = topMatch ? Math.max(0, Math.round(topMatch.similarity_score * 10000) / 100) : 0;
  const passAll = verification.pass?.all === true;

  const selectQuery = (query: VerificationQuery) => {
    setActiveQueryId(query.query_id);
    setInputValue(query.accepted_inputs[0] || "");
    setInputState("matched");
  };

  const submitVerification = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = inputValue.trim().toLowerCase();
    const found = verification.queries.find((query) => {
      const assetId = query.query_asset_id?.toLowerCase();
      return (
        query.accepted_inputs.some((item) => item.toLowerCase() === normalized) ||
        (assetId ? normalized.includes(assetId) : false)
      );
    });
    if (found) {
      setActiveQueryId(found.query_id);
      setInputState("matched");
    } else {
      setInputState("unsupported");
    }
  };

  return (
    <div className="max-w-[1240px] px-6 py-7 md:px-9">
      <PageHead
        dot={C.green}
        eyebrow={zh ? "貼圖查驗 · ORIGIN VERIFY" : "Origin verify"}
        title={zh ? "原創影像查驗入口" : "Original-image verification"}
        desc={
          zh
            ? "使用本機視覺指紋庫回傳來源命中、轉檔後命中或未註冊判定；任意外部 URL 需先建立指紋，不會在瀏覽器端捏造結果。"
            : "The local fingerprint index returns registered-original, transformed-match, or not-registered verdicts; arbitrary external URLs require fingerprinting before a verdict is produced."
        }
      />

      <div className="mb-5 grid gap-3.5 md:grid-cols-4">
        <KpiCard
          index="V1"
          label={zh ? "本機指紋庫" : "Local index"}
          sub={zh ? "已索引樣本" : "indexed fingerprints"}
          value={verification.library.indexed_rows.toString()}
          color={C.green}
        />
        <KpiCard
          index="V2"
          label={zh ? "保護基準" : "Protection baseline"}
          sub={zh ? "PyroImage 原作" : "PyroImage originals"}
          value={(verification.library.protected_originals_baseline || 0).toLocaleString("en-US")}
          color={C.ink}
        />
        <KpiCard
          index="V3"
          label={zh ? "判定線" : "Match line"}
          sub={zh ? "combined distance" : "combined distance"}
          value={verification.library.threshold.toString()}
          color={C.blue}
        />
        <KpiCard
          index="V4"
          label={zh ? "查驗驗證" : "Fixture check"}
          sub={zh ? "零付費 API" : "zero paid API"}
          value={passAll ? "PASS" : "CHECK"}
          color={passAll ? C.greenDeep : C.orange}
          dark
        />
      </div>

      <div className="mb-5 grid gap-5 xl:grid-cols-[1fr_1.35fr]">
        <section className="rounded-[14px] border border-[#1a1a1a12] bg-white p-5">
          <p className="mb-3 text-[12px] font-semibold" style={{ fontFamily: MONO }}>
            {zh ? "查驗輸入 · VERIFY INPUT" : "Verify input"}
          </p>
          <form onSubmit={submitVerification} className="flex gap-2">
            <input
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              className="min-w-0 flex-1 rounded-[9px] border border-[#1a1a1a26] bg-[#FBF6EC] px-3.5 py-2.5 text-[12px] outline-none focus:border-[#7F9C7E]"
              style={{ fontFamily: MONO }}
              aria-label={zh ? "查驗輸入" : "Verification input"}
            />
            <button
              type="submit"
              className="flex flex-none items-center gap-2 rounded-[9px] bg-[#1A1A1A] px-4 py-2.5 text-[12px] font-semibold text-[#F4E9D5]"
            >
              <ScanLine size={14} /> {zh ? "查驗" : "Check"}
            </button>
          </form>
          {inputState === "unsupported" && (
            <p className="mt-3 rounded-[9px] border border-[#e0d3ad] bg-[#FBF6EC] px-3.5 py-2.5 text-[12px] leading-5 text-[#80621c]">
              {zh
                ? "此輸入尚未建立本機指紋；靜態頁面不產生判定，也不建立警報。"
                : "This input has no local fingerprint yet; the static page does not create a verdict or alert."}
            </p>
          )}
          <div className="mt-4 grid gap-2">
            {verification.queries.map((query) => {
              const selected = query.query_id === activeQuery.query_id;
              return (
                <button
                  key={query.query_id}
                  type="button"
                  onClick={() => selectQuery(query)}
                  className={`rounded-[10px] border px-3.5 py-3 text-left transition-colors ${
                    selected ? "border-[#1A1A1A] bg-[#1A1A1A] text-[#F4E9D5]" : "border-[#1a1a1a14] hover:bg-[#FBF6EC]"
                  }`}
                >
                  <span className="block text-[13px] font-semibold">{zh ? query.display.zh : query.display.en}</span>
                  <span
                    className={`mt-0.5 block truncate text-[10px] ${selected ? "text-[#CEC0A3]" : "text-[#1a1a1a73]"}`}
                    style={{ fontFamily: MONO }}
                  >
                    {query.verdict.code} · {query.evidence_label}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-[14px] border border-[#1a1a1a12] bg-white p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[12px] text-[#1a1a1a80]" style={{ fontFamily: MONO }}>
                {activeQuery.query_id}
              </p>
              <h2 className="mt-1 text-[24px] font-semibold leading-tight" style={{ fontFamily: MONO }}>
                {zh ? activeQuery.verdict.zh : activeQuery.verdict.en}
              </h2>
            </div>
            <div
              className="flex h-[92px] w-[92px] flex-col items-center justify-center rounded-full border-4"
              style={{ borderColor: verdictColor }}
            >
              <span className="text-[25px] font-bold leading-none" style={{ fontFamily: MONO, color: verdictColor }}>
                {similarityPct}%
              </span>
              <span className="mt-1 text-[9px] tracking-[0.1em] text-[#1a1a1a80]" style={{ fontFamily: MONO }}>
                TOP MATCH
              </span>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-[190px_1fr]">
            <Thumb src={previewWork?.thumb} grad={previewWork?.grad || GRADS[0]} className="aspect-[16/11] w-full rounded-[10px]" />
            <div className="min-w-0">
              <p className="text-[15px] font-semibold">
                {activeQuery.display.title}
                {activeQuery.display.subtitle && (
                  <span className="text-[13px] font-normal text-[#1a1a1a66]"> ／ {activeQuery.display.subtitle}</span>
                )}
              </p>
              <p className="mt-2 break-all rounded-[8px] bg-[#F4E9D5] px-3 py-2.5 text-[11px]" style={{ fontFamily: MONO }}>
                {activeQuery.query_fingerprint.fingerprint_value}
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <CaseField
                  label={zh ? "最接近原作 TOP MATCH" : "Top match"}
                  value={topMatch?.display_title || (zh ? "無命中" : "No match")}
                />
                <CaseField
                  label={zh ? "特徵距離 DISTANCE" : "Distance"}
                  value={topMatch ? `${topMatch.combined_distance} / ${verification.library.threshold}` : "N/A"}
                  mono
                />
                <CaseField
                  label={zh ? "公開主張 CLAIM" : "Public claim"}
                  value={
                    activeQuery.verdict.public_claim_status === "no_origin_match_found"
                      ? zh
                        ? "未建立原作命中"
                        : "No origin match"
                      : zh
                      ? "僅供來源查驗"
                      : "Origin verification only"
                  }
                />
                <CaseField label={zh ? "成本 COST" : "Cost"} value={activeQuery.zero_external_cost ? "NT$0" : "N/A"} mono />
              </div>
              {topMatch?.certificate_link && activeQuery.result.pass_threshold && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {matchWork && (
                    <button
                      type="button"
                      onClick={() => onOpenCert(topMatch.asset_id)}
                      className="rounded-[9px] bg-[#7F9C7E] px-3.5 py-2 text-[12px] font-semibold text-[#1A1A1A]"
                    >
                      {zh ? "檢視憑證" : "View certificate"}
                    </button>
                  )}
                  <a
                    href={topMatch.certificate_link}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 rounded-[9px] border border-[#1a1a1a26] px-3.5 py-2 text-[12px] font-semibold"
                  >
                    <ExternalLink size={14} /> {zh ? "開啟 verify" : "Open verify"}
                  </a>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      <div className="rounded-[14px] border border-[#1a1a1a12] bg-white">
        <div
          className="grid grid-cols-[1fr_86px_96px] gap-3 bg-[#EFE3CC] px-5 py-3 text-[10px] tracking-[0.08em] text-[#1a1a1a8c] md:grid-cols-[1fr_120px_120px_180px]"
          style={{ fontFamily: MONO }}
        >
          <span>{zh ? "候選原作" : "CANDIDATE ORIGINAL"}</span>
          <span>{zh ? "距離" : "DIST"}</span>
          <span>{zh ? "相似度" : "MATCH"}</span>
          <span className="hidden md:block">{zh ? "憑證" : "CERTIFICATE"}</span>
        </div>
        {activeQuery.result.top_matches.slice(0, 5).map((match) => {
          const isPass = match.combined_distance <= verification.library.threshold;
          return (
            <div
              key={`${activeQuery.query_id}-${match.asset_id}`}
              className="grid grid-cols-[1fr_86px_96px] gap-3 border-t border-[#1a1a1a0f] px-5 py-3.5 text-[12px] md:grid-cols-[1fr_120px_120px_180px]"
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold">{match.display_title || match.asset_id}</span>
                <span className="block truncate text-[10px] text-[#1a1a1a73]" style={{ fontFamily: MONO }}>
                  {shortFp(match.asset_id)}
                </span>
              </span>
              <span className="font-semibold" style={{ fontFamily: MONO, color: isPass ? C.greenDeep : C.ink }}>
                {match.combined_distance}
              </span>
              <span className="font-semibold" style={{ fontFamily: MONO, color: isPass ? C.greenDeep : C.ink }}>
                {Math.round(match.similarity_score * 10000) / 100}%
              </span>
              <span className="hidden min-w-0 truncate text-[#2E52A0] md:block" style={{ fontFamily: MONO }}>
                {match.certificate_link ? shortFp(match.certificate_link) : "N/A"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- alerts view ---------------- */

function AlertsView(props: {
  locale: Locale;
  alerts: AlertVM[];
  filter: "all" | "high" | "open" | "done";
  setFilter: (f: "all" | "high" | "open" | "done") => void;
  counts: { all: number; high: number; open: number; done: number };
  onOpenCase: (id: string) => void;
}) {
  const { locale, alerts, filter, setFilter, counts } = props;
  const zh = locale === "zh-TW";
  const match = (a: AlertVM) =>
    filter === "all"
      ? true
      : filter === "high"
      ? a.risk === "high"
      : filter === "open"
      ? a.status === "new" || a.status === "reviewing"
      : a.status === "resolved" || a.status === "action" || a.status === "dismissed";
  const filtered = alerts.filter(match);
  const chips: Array<{ key: typeof filter; label: string; n: number }> = [
    { key: "all", label: zh ? "全部 ALL" : "All", n: counts.all },
    { key: "high", label: zh ? "高風險 HIGH" : "High", n: counts.high },
    { key: "open", label: zh ? "待複審 OPEN" : "Open", n: counts.open },
    { key: "done", label: zh ? "已處理 DONE" : "Done", n: counts.done },
  ];

  return (
    <div className="max-w-[1240px] px-6 py-7 md:px-9">
      <PageHead
        dot={C.orange}
        eyebrow={zh ? "疑似盜用 · DETECTION QUEUE" : "Detection queue"}
        title={zh ? "盜用警報分流" : "Alert triage"}
        desc={zh ? "系統依相似度與通路風險自動分流，點擊任一筆查看證據比對與處理選項。" : "Alerts are routed by similarity and channel risk. Click any row to see the evidence comparison and actions."}
      />
      <div className="mb-3.5 flex flex-wrap gap-2.5">
        {chips.map((ch) => (
          <button
            key={ch.key}
            type="button"
            onClick={() => setFilter(ch.key)}
            className={`rounded-full border px-3.5 py-2 text-xs font-semibold ${
              filter === ch.key ? "border-[#1A1A1A] bg-[#1A1A1A] text-[#F4E9D5]" : "border-[#1a1a1a33] text-[#1A1A1A]"
            }`}
          >
            {ch.label} <span className="opacity-55">{ch.n}</span>
          </button>
        ))}
      </div>
      <div className="overflow-hidden rounded-[14px] border border-[#1a1a1a12] bg-white">
        <div
          className="flex items-center gap-3.5 bg-[#EFE3CC] px-5 py-3 text-[10px] tracking-[0.08em] text-[#1a1a1a8c]"
          style={{ fontFamily: MONO }}
        >
          <span className="w-[60px] flex-none">{zh ? "證據" : "EVIDENCE"}</span>
          <span className="flex-1">{zh ? "原創影像 / 發現位置" : "ORIGINAL / FOUND AT"}</span>
          <span className="w-[120px] flex-none">{zh ? "相似度" : "MATCH"}</span>
          <span className="w-[88px] flex-none">{zh ? "狀態" : "STATUS"}</span>
        </div>
        {filtered.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => props.onOpenCase(a.id)}
            className="flex w-full items-center gap-3.5 border-t border-[#1a1a1a0f] px-5 py-3.5 text-left transition-colors hover:bg-[#FBF6EC]"
          >
            <Thumb src={a.thumb} grad={a.grad} sepia className="h-[42px] w-[42px] flex-none rounded-[6px]" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate text-[14px] font-semibold">
                  {a.work} <span className="font-normal text-[#1a1a1a66]">／ {a.workEn}</span>
                </span>
                {a.simulated && <DemoTag locale={locale} />}
              </span>
              <span className="block truncate text-[11.5px] text-[#1a1a1a8c]" style={{ fontFamily: MONO }}>
                {a.channel} · {a.id}
              </span>
            </span>
            <span className="w-[120px] flex-none">
              <span className="flex items-center gap-2">
                <span className="text-[15px] font-bold" style={{ fontFamily: MONO, color: simColor(a.sim) }}>
                  {a.sim}%
                </span>
              </span>
              <span className="mt-1.5 block h-[5px] overflow-hidden rounded-full bg-[#1a1a1a14]">
                <span className="block h-full rounded-full" style={{ width: `${a.sim}%`, background: simColor(a.sim) }} />
              </span>
            </span>
            <span className="w-[88px] flex-none">
              <StatusPill status={a.status} locale={locale} />
            </span>
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-[#1a1a1a73]">{zh ? "沒有符合條件的警報。" : "No matching alerts."}</p>
        )}
      </div>
    </div>
  );
}

/* ---------------- case detail view ---------------- */

function CaseView(props: {
  locale: Locale;
  vm: AlertVM;
  extraEvents: TimelineItem[];
  onBack: () => void;
  onAction: (type: "dmca" | "report" | "archive" | "contact" | "dismiss") => void;
}) {
  const { locale, vm, extraEvents } = props;
  const zh = locale === "zh-TW";
  const timeline = [...vm.baseTimeline, ...extraEvents];
  const proximity = Math.max(0, Math.round((1 - vm.distance / 128) * 100));

  return (
    <div className="max-w-[1240px] px-6 py-6 md:px-9">
      <button type="button" onClick={props.onBack} className="mb-4 flex items-center gap-1.5 text-xs font-semibold text-[#1a1a1a8c]" style={{ fontFamily: MONO }}>
        <ArrowLeft size={14} /> {T.back[locale]}
      </button>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="mb-1.5 text-[11px] text-[#1a1a1a80]" style={{ fontFamily: MONO }}>
            {vm.id} · {vm.channel}
          </p>
          <h1 className="text-[30px] font-semibold leading-[1.05]" style={{ fontFamily: MONO }}>
            {vm.work}
            <span className="text-[18px] text-[#1a1a1a66]"> ／ {vm.workEn}</span>
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            <StatusPill status={vm.status} locale={locale} />
            {vm.simulated && <DemoTag locale={locale} />}
            <span className="text-[12px] text-[#1a1a1a8c]">{zh ? "著作權利人" : "Rights holder"} {vm.author}</span>
          </div>
        </div>
        <div className="flex-none text-center">
          <div
            className="flex h-[104px] w-[104px] flex-col items-center justify-center rounded-full border-4"
            style={{ borderColor: simColor(vm.sim) }}
          >
            <span className="text-[30px] font-bold leading-none" style={{ fontFamily: MONO, color: simColor(vm.sim) }}>
              {vm.sim}%
            </span>
            <span className="mt-1 text-[9px] tracking-[0.1em] text-[#1a1a1a80]" style={{ fontFamily: MONO }}>
              MATCH
            </span>
          </div>
        </div>
      </div>

      {/* comparison */}
      <div className="mb-5 grid gap-4 md:grid-cols-2">
        <div className="rounded-[14px] border border-[#1a1a1a12] bg-white p-3.5">
          <div className="mb-2.5 flex items-center justify-between">
            <p className="text-[12px] font-semibold text-[#7F9C7E]" style={{ fontFamily: MONO }}>
              ● {zh ? "原始原創 · ORIGINAL" : "Original"}
            </p>
            <p className="text-[10px] text-[#1a1a1a66]" style={{ fontFamily: MONO }}>
              {zh ? "已簽署封存" : "Sealed"}
            </p>
          </div>
          <Thumb src={vm.thumb} grad={vm.grad} className="aspect-[16/10] w-full rounded-[9px]" />
          <p className="mt-2.5 break-all text-[11px] text-[#1a1a1a8c]" style={{ fontFamily: MONO }}>
            {zh ? "指紋" : "Fingerprint"} {vm.fp}
          </p>
        </div>
        <div className="rounded-[14px] border border-[#ed5d2966] bg-white p-3.5">
          <div className="mb-2.5 flex items-center justify-between">
            <p className="text-[12px] font-semibold text-[#ED5D29]" style={{ fontFamily: MONO }}>
              ● {zh ? "巡檢發現 · DETECTED COPY" : "Detected copy"}
            </p>
            <p className="text-[10px] text-[#1a1a1a66]" style={{ fontFamily: MONO }}>
              {formatDateForLocale(vm.detected, locale)}
            </p>
          </div>
          <div className="relative">
            <Thumb src={vm.thumb} grad={vm.grad} sepia className="aspect-[16/10] w-full rounded-[9px]" />
            <div className="pointer-events-none absolute inset-3.5 rounded-[5px] border-2 border-dashed border-[#ED5D29]" />
          </div>
          <p className="mt-2.5 truncate text-[11px] text-[#1a1a1a8c]" style={{ fontFamily: MONO }}>
            {vm.sourceUrl}
          </p>
        </div>
      </div>

      {/* three cards */}
      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <div className="rounded-[14px] border border-[#1a1a1a12] bg-white p-[18px]">
          <p className="mb-3.5 text-[12px] font-semibold" style={{ fontFamily: MONO }}>
            {zh ? "比對明細 · BREAKDOWN" : "Breakdown"}
          </p>
          <Bar label={zh ? "視覺相似度 SIMILARITY" : "Visual similarity"} pct={vm.sim} color={simColor(vm.sim)} />
          <Bar label={zh ? "特徵接近度 PROXIMITY" : "Feature proximity"} pct={proximity} color={C.blue} />
          <p className="mt-3 text-[11px] leading-5 text-[#1a1a1a8c]" style={{ fontFamily: MONO }}>
            {zh ? "特徵距離" : "Feature distance"} {vm.distance} / {zh ? "判定線" : "line"} {vm.threshold}
            <span className="block text-[10px] text-[#1a1a1aa6]">{zh ? "量表 0–128，越低越相似" : "Scale 0–128, lower = more similar"}</span>
          </p>
        </div>
        <div className="rounded-[14px] border border-[#1a1a1a12] bg-white p-[18px]">
          <p className="mb-3.5 text-[12px] font-semibold" style={{ fontFamily: MONO }}>
            {zh ? "竄改偵測 · TAMPERING" : "Tampering"}
          </p>
          <div className="flex flex-wrap gap-2">
            {(zh ? ["受控縮放", "重新編碼"] : ["Controlled resize", "Re-encode"]).map((tag) => (
              <span key={tag} className="rounded-[7px] bg-[#FAE0D6] px-2.5 py-1.5 text-[11px] font-semibold text-[#9a3a16]" style={{ fontFamily: MONO }}>
                {tag}
              </span>
            ))}
          </div>
          <p className="mt-3.5 text-[12px] leading-5 text-[#1a1a1a8c]">
            {zh
              ? "即使影像被裁切、壓縮或重新編碼，視覺指紋仍能比對出原作。"
              : "Even if the image is cropped, compressed, or re-encoded, the visual fingerprint still matches the original."}
          </p>
        </div>
        <div className="rounded-[14px] border border-[#1a1a1a12] bg-white p-[18px]">
          <p className="mb-3.5 text-[12px] font-semibold" style={{ fontFamily: MONO }}>
            {zh ? "發現位置 · SOURCE" : "Source"}
          </p>
          <CaseField label={zh ? "通路 CHANNEL" : "Channel"} value={vm.channel} />
          <CaseField label={zh ? "內容位置 URL" : "Location"} value={vm.sourceUrl} mono />
          <CaseField label={zh ? "擷取時間 CAPTURED" : "Captured"} value={formatDateForLocale(vm.detected, locale)} mono />
          <CaseField label={zh ? "公開主張 CLAIM" : "Public claim"} value={zh ? "僅供內部使用" : "Internal only"} />
        </div>
      </div>

      {/* reviewer notice */}
      {(vm.notice || vm.reviewerPrompt) && (
        <div className="mb-5 rounded-[14px] border border-[#e0d3ad] bg-[#FBF6EC] p-5">
          <p className="flex items-center gap-2 text-[12px] font-semibold text-[#9a7a1e]" style={{ fontFamily: MONO }}>
            <TriangleAlert size={15} /> {zh ? "人工審核須知 · REVIEWER NOTICE" : "Reviewer notice"}
          </p>
          {vm.notice && <p className="mt-3 text-[13px] leading-6 text-[#4c3a20]">{vm.notice}</p>}
          {vm.reviewerPrompt && <p className="mt-2 text-[13px] leading-6 text-[#4c3a20]">{vm.reviewerPrompt}</p>}
        </div>
      )}

      {/* provenance trace */}
      <div className="mb-5 rounded-[14px] border border-[#1a1a1a12] bg-white p-[22px]">
        <p className="mb-4 text-[12px] font-semibold" style={{ fontFamily: MONO }}>
          {zh ? "來源軌跡 · PROVENANCE TRACE" : "Provenance trace"}
        </p>
        {timeline.map((t, i) => {
          const last = i === timeline.length - 1;
          return (
            <div key={`${t.zh}-${i}`} className="flex items-start gap-3.5">
              <div className="flex flex-none flex-col items-center">
                <span className="h-2.5 w-2.5 rounded-full border-2 border-white" style={{ background: last ? C.orange : C.green, boxShadow: `0 0 0 1.5px ${last ? C.orange : C.green}` }} />
                {!last && <div className="min-h-[22px] w-0.5 flex-1 bg-[#1a1a1a26]" />}
              </div>
              <div className="pb-3.5">
                <p className="text-[13px] font-semibold">{zh ? t.zh : t.en}</p>
                <p className="text-[11px] text-[#1a1a1a80]" style={{ fontFamily: MONO }}>
                  {formatDateForLocale(t.t, locale)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-[14px] bg-[#1A1A1A] p-5">
        <div>
          <p className="text-[14px] font-semibold text-[#F4E9D5]">{zh ? "採取行動" : "Take action"}</p>
          <p className="mt-0.5 text-[10px] tracking-[0.08em] text-[#CEC0A3]" style={{ fontFamily: MONO }}>
            {zh ? "示範流程 · 所有動作均會記錄於軌跡" : "Demo workflow · every action is logged to the trace"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button type="button" onClick={() => props.onAction("dmca")} className="rounded-[9px] bg-[#ED5D29] px-4 py-2.5 text-[12.5px] font-semibold text-white">
            {zh ? "發出 DMCA 下架" : "Send DMCA"}
          </button>
          <button type="button" onClick={() => props.onAction("report")} className="rounded-[9px] bg-[#7F9C7E] px-4 py-2.5 text-[12.5px] font-semibold text-[#1A1A1A]">
            {zh ? "產生存證報告" : "Generate report"}
          </button>
          <button type="button" onClick={() => props.onAction("archive")} className="rounded-[9px] border border-[#f4e9d54d] px-4 py-2.5 text-[12.5px] font-semibold text-[#F4E9D5]">
            {zh ? "封存證據" : "Archive"}
          </button>
          <button type="button" onClick={() => props.onAction("contact")} className="rounded-[9px] border border-[#f4e9d54d] px-4 py-2.5 text-[12.5px] font-semibold text-[#F4E9D5]">
            {zh ? "聯絡對方" : "Contact"}
          </button>
          <button type="button" onClick={() => props.onAction("dismiss")} className="rounded-[9px] px-3 py-2.5 text-[12.5px] font-semibold text-[#CEC0A3]">
            {zh ? "標記誤判" : "Dismiss"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Bar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div className="mb-3">
      <div className="mb-1.5 flex justify-between text-[11.5px]">
        <span>{label}</span>
        <span className="font-semibold" style={{ fontFamily: MONO, color }}>
          {pct}%
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[#1a1a1a14]">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function CaseField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="mb-3">
      <p className="text-[10px] text-[#1a1a1a73]" style={{ fontFamily: MONO }}>
        {label}
      </p>
      <p className={`mt-0.5 truncate text-[13px] ${mono ? "font-medium" : "font-semibold"}`} style={mono ? { fontFamily: MONO } : undefined}>
        {value}
      </p>
    </div>
  );
}

/* ---------------- vault view ---------------- */

function VaultView({ locale, works, onOpenCert }: { locale: Locale; works: WorkVM[]; onOpenCert: (id: string) => void }) {
  const zh = locale === "zh-TW";
  return (
    <div className="max-w-[1240px] px-6 py-7 md:px-9">
      <PageHead
        dot={C.green}
        eyebrow={zh ? "原創庫 · PROTECTED VAULT" : "Protected vault"}
        title={zh ? "受保護原創影像" : "Protected originals"}
        desc={zh ? "每張影像都建立了不可逆的視覺指紋與來源憑證。點擊卡片檢視著作憑證。" : "Each image has an irreversible visual fingerprint and origin certificate. Click a card to view its certificate."}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {works.map((w) => (
          <button
            key={w.assetId}
            type="button"
            onClick={() => onOpenCert(w.assetId)}
            className="overflow-hidden rounded-[14px] border border-[#1a1a1a12] bg-white text-left transition-colors hover:border-[#7F9C7E]"
          >
            <div className="relative">
              <Thumb src={w.thumb} grad={w.grad} className="aspect-[16/10] w-full" />
              <span className="absolute right-2.5 top-2.5 rounded-full bg-[#7F9C7E] px-2.5 py-1 text-[9px] font-semibold text-white" style={{ fontFamily: MONO }}>
                {zh ? "已簽署保護" : "Protected"}
              </span>
            </div>
            <div className="p-4">
              <p className="text-[15px] font-semibold">
                {w.name} <span className="text-[13px] font-normal text-[#1a1a1a66]">{w.en}</span>
              </p>
              <p className="mt-1 text-[11px] text-[#1a1a1a80]" style={{ fontFamily: MONO }}>
                {w.author}
              </p>
              <p className="mt-2 break-all text-[11px] text-[#1a1a1a6b]" style={{ fontFamily: MONO }}>
                {w.fp}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------- channels view ---------------- */

function ChannelsView({ locale, channels, onRunPatrol }: { locale: Locale; channels: ChannelVM[]; onRunPatrol: () => void }) {
  const zh = locale === "zh-TW";
  return (
    <div className="max-w-[1240px] px-6 py-7 md:px-9">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <PageHead
          dot={C.blue}
          eyebrow={zh ? "監控通路 · PATROL CHANNELS" : "Patrol channels"}
          title={zh ? "指定通路巡檢" : "Designated-channel patrol"}
          desc={zh ? "系統在以下新聞、社群、論壇與搜尋通路持續巡檢，比對是否出現高相似影像。" : "These news, social, forum and search channels are continuously patrolled for high-similarity copies."}
        />
        <button type="button" onClick={onRunPatrol} className="rounded-[9px] bg-[#1A1A1A] px-[18px] py-2.5 text-[12.5px] font-semibold text-[#F4E9D5]">
          ＋ {zh ? "立即巡檢全部通路" : "Patrol all now"}
        </button>
      </div>
      <div className="grid gap-3.5 lg:grid-cols-2">
        {channels.map((c, i) => (
          <div key={c.id} className="flex items-center gap-3.5 rounded-[14px] border border-[#1a1a1a12] bg-white p-4">
            <div className="h-[46px] w-[46px] flex-none rounded-[9px]" style={{ background: GRADS[i % GRADS.length] }} />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold">{c.name}</p>
              <p className="mt-0.5 text-[10.5px] text-[#1a1a1a80]" style={{ fontFamily: MONO }}>
                {c.type} · {riskText(c.risk, locale)}
              </p>
            </div>
            <div className="flex-none text-right">
              <div className="flex items-center justify-end gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: chDot(c.status) }} />
                <span className="text-[11px] font-semibold" style={{ fontFamily: MONO, color: chDot(c.status) }}>
                  {chLabel(c.status, locale)}
                </span>
              </div>
              <p className="mt-1 text-[10px] text-[#1a1a1a80]" style={{ fontFamily: MONO }}>
                {zh ? `命中 ${c.hits} 筆` : `${c.hits} hits`}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function riskText(value: string, locale: Locale) {
  const zh: Record<string, string> = { high: "高風險", medium: "中風險", low: "低風險" };
  const en: Record<string, string> = { high: "High risk", medium: "Medium risk", low: "Low risk" };
  return (locale === "zh-TW" ? zh[value] : en[value]) || value;
}

/* ---------------- reports view ---------------- */

function ReportsView(props: {
  locale: Locale;
  backend: EvidenceReportDocument["reports"];
  added: Array<{ id: string; work: string; caseId: string; typeZh: string; typeEn: string }>;
  works: WorkVM[];
  alerts: AlertVM[];
  onExport: (id: string) => void;
}) {
  const { locale } = props;
  const zh = locale === "zh-TW";
  const primaryWork = props.alerts[0]?.work ? `${props.alerts[0].work} ${props.alerts[0].workEn}`.trim() : props.works[0]?.name || "—";
  const reportType = (label?: string) => {
    if (label === "simulated") return zh ? "示範報告" : "Demo report";
    if (label === "actual_pending_review") return zh ? "真實巡檢存證（待複審）" : "Real patrol evidence (pending review)";
    return zh ? "內部存證報告" : "Internal evidence report";
  };
  const rows = [
    ...props.added.map((r) => ({ id: r.id, work: r.work, caseId: r.caseId, type: zh ? r.typeZh : r.typeEn, hash: shortFp(r.id) })),
    ...props.backend.map((r) => ({
      id: r.report_id.replace("REPORT-", "R-").slice(0, 12),
      work: r.sections?.protected_original?.title || primaryWork,
      caseId: r.case_id || r.alert_id || props.alerts[0]?.id || "—",
      type: reportType(r.sections?.public_use_label?.label),
      hash: shortFp(r.sections?.protected_original?.certificate_link || r.report_id),
    })),
  ];

  return (
    <div className="max-w-[1240px] px-6 py-7 md:px-9">
      <PageHead
        dot={C.ink}
        eyebrow={zh ? "存證報告 · CERTIFIED REPORTS" : "Certified reports"}
        title={zh ? "盜用存證報告" : "Evidence reports"}
        desc={zh ? "每份報告皆含電子憑證、相似度比對、來源軌跡與人工複審狀態；真實巡檢命中仍需確認來源脈絡與授權。" : "Each report bundles the certificate, similarity comparison, source trail, and review state. Real patrol matches still require human source-context and authorization review."}
      />
      <div className="overflow-hidden rounded-[14px] border border-[#1a1a1a12] bg-white">
        <div className="flex items-center gap-3.5 bg-[#EFE3CC] px-5 py-3 text-[10px] tracking-[0.08em] text-[#1a1a1a8c]" style={{ fontFamily: MONO }}>
          <span className="w-[88px] flex-none">{zh ? "報告編號" : "REPORT"}</span>
          <span className="flex-1">{zh ? "關聯案件 / 類型" : "CASE / TYPE"}</span>
          <span className="w-[150px] flex-none">{zh ? "區塊鏈憑證" : "HASH"}</span>
          <span className="w-[66px] flex-none">{zh ? "操作" : "EXPORT"}</span>
        </div>
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-3.5 border-t border-[#1a1a1a0f] px-5 py-4">
            <span className="w-[88px] flex-none text-[13px] font-bold" style={{ fontFamily: MONO }}>
              {r.id}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-semibold">{r.work}</span>
              <span className="block truncate text-[11px] text-[#1a1a1a80]" style={{ fontFamily: MONO }}>
                {r.caseId} · {r.type}
              </span>
            </span>
            <span className="w-[150px] flex-none truncate text-[11px] text-[#2E52A0]" style={{ fontFamily: MONO }}>
              {r.hash}
            </span>
            <span className="w-[66px] flex-none">
              <button
                type="button"
                onClick={() => props.onExport(r.id)}
                className="flex items-center gap-1 rounded-[7px] border border-[#1a1a1a33] px-2.5 py-1.5 text-[11px] font-semibold"
              >
                <Download size={12} /> {zh ? "匯出" : "PDF"}
              </button>
            </span>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-[#1a1a1a73]">{zh ? "尚無存證報告。" : "No reports yet."}</p>
        )}
      </div>
    </div>
  );
}

/* ---------------- certificate modal ---------------- */

function CertModal({ locale, work, onClose }: { locale: Locale; work: WorkVM; onClose: () => void }) {
  const zh = locale === "zh-TW";
  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-[#1a1a1a8c] p-6 backdrop-blur-[2px]">
      <div onClick={(e) => e.stopPropagation()} className="max-h-[88vh] w-[560px] max-w-full overflow-auto rounded-[16px] bg-white">
        <div className="relative">
          <Thumb src={work.thumb} grad={work.grad} className="aspect-[16/9] w-full" />
          <span className="absolute right-3.5 top-3.5 rounded-full bg-[#7F9C7E] px-3 py-1 text-[9px] font-semibold text-white" style={{ fontFamily: MONO }}>
            {zh ? "已簽署保護" : "Protected"}
          </span>
        </div>
        <div className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] text-[#1a1a1a80]" style={{ fontFamily: MONO }}>
                ORIGINAL CERTIFICATE
              </p>
              <h2 className="mt-1.5 text-[22px] font-semibold" style={{ fontFamily: MONO }}>
                {work.name} <span className="text-[15px] text-[#1a1a1a66]">{work.en}</span>
              </h2>
            </div>
            <button type="button" onClick={onClose} className="text-[#1a1a1a66]">
              <X size={20} />
            </button>
          </div>
          <div className="my-4 h-px bg-[#1a1a1a1a]" />
          <CertRow label={zh ? "著作創作者" : "Creator"} value={work.author} />
          <CertRow label={zh ? "合法權利人" : "Rights holder"} value={work.owner} />
          <CertRow label={zh ? "指紋保護時間" : "Sealed at"} value={formatDateForLocale(work.sealed, locale)} mono />
          <CertRow label={zh ? "原創憑證狀態" : "Origin certificate"} value={work.c2pa === "signed" ? (zh ? "憑證完整 · VERIFIED" : "Verified") : work.c2pa || "—"} accent />
          <div className="mt-3">
            <p className="mb-1 text-[12px] text-[#1a1a1a80]">{zh ? "著作指紋 FINGERPRINT" : "Fingerprint"}</p>
            <p className="break-all rounded-[8px] bg-[#F4E9D5] px-3.5 py-3 text-[12px]" style={{ fontFamily: MONO }}>
              {work.fp}
            </p>
          </div>
          {work.certificate && (
            <a
              href={work.certificate}
              target="_blank"
              rel="noreferrer"
              className="mt-4 flex items-center justify-center gap-2 rounded-[10px] bg-[#1A1A1A] py-3 text-[13px] font-semibold text-[#F4E9D5]"
            >
              <ExternalLink size={15} /> {zh ? "開啟可驗證憑證" : "Open verifiable certificate"}
            </a>
          )}
          <button type="button" onClick={onClose} className="mt-2.5 w-full rounded-[10px] border border-[#1a1a1a1f] py-3 text-[13px] font-semibold">
            {zh ? "關閉憑證" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CertRow({ label, value, mono, accent }: { label: string; value: string; mono?: boolean; accent?: boolean }) {
  return (
    <div className="flex justify-between py-1.5">
      <span className="text-[12px] text-[#1a1a1a80]">{label}</span>
      <span
        className="text-[13px] font-semibold"
        style={{ fontFamily: mono ? MONO : undefined, color: accent ? C.greenDeep : undefined }}
      >
        {value}
      </span>
    </div>
  );
}

/* ---------------- toast ---------------- */

function Toast({ msg, kind }: { msg: string; kind: "ok" | "alert" }) {
  return (
    <div className="fixed bottom-7 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2.5 rounded-[11px] bg-[#1A1A1A] px-5 py-3 text-[#F4E9D5] shadow-[0_8px_30px_rgba(26,26,26,0.3)]">
      <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: kind === "alert" ? C.orange : C.green }} />
      <span className="text-[13px] font-semibold">{msg}</span>
    </div>
  );
}

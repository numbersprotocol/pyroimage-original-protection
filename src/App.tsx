import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Compass,
  Download,
  ExternalLink,
  FileText,
  Images,
  Info,
  LayoutDashboard,
  Lightbulb,
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
const ONBOARD_STORAGE_KEY = "pyroimage-original-protection-onboarded";

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

function getInitialOnboarding(): boolean {
  // First visit → show the welcome overlay. Once dismissed, remember and skip.
  try {
    return window.localStorage.getItem(ONBOARD_STORAGE_KEY) !== "done";
  } catch {
    return true;
  }
}

function saveOnboarded() {
  try {
    window.localStorage.setItem(ONBOARD_STORAGE_KEY, "done");
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
  brand: { "zh-TW": "原創雷達", en: "OriginRadar" },
  brandSub: {
    "zh-TW": "原創影像盜用偵測 · Powered by Numbers",
    en: "Original-image theft detection · Powered by Numbers",
  },
  menu: { "zh-TW": "主選單 · MENU", en: "Menu" },
  runPatrol: { "zh-TW": "執行巡檢", en: "Run patrol" },
  coverage: { "zh-TW": "保護範圍 · COVERAGE", en: "Coverage" },
  protectedOriginals: { "zh-TW": "受保護原創影像", en: "protected originals" },
  channels: { "zh-TW": "監控通路", en: "channels" },
  back: { "zh-TW": "← 返回警報列表", en: "← Back to alerts" },
  demo: { "zh-TW": "MVP 試營運", en: "MVP Pilot" },
  howItWorks: { "zh-TW": "導覽", en: "How it works" },
} as const;

const NAV: Array<{
  id: View;
  icon: LucideIcon;
  zh: string;
  en: string;
  eyebrow: string;
  descZh: string;
  descEn: string;
}> = [
  // Order follows the detection narrative: radar → detections → origins → sources → evidence → tool.
  { id: "dashboard", icon: LayoutDashboard, zh: "巡檢台", en: "Radar", eyebrow: "RADAR", descZh: "偵測現況與最新結果", descEn: "Detection status & latest results" },
  { id: "alerts", icon: Bell, zh: "疑似盜用", en: "Detections", eyebrow: "DETECT", descZh: "系統發現、待你確認的案件", descEn: "Findings awaiting review" },
  { id: "vault", icon: Images, zh: "原創庫", en: "Vault", eyebrow: "ORIGINS", descZh: "已簽署保護的原創影像", descEn: "Protected original images" },
  { id: "channels", icon: Radar, zh: "監控通路", en: "Channels", eyebrow: "SOURCES", descZh: "巡檢來源與通路狀態", descEn: "Patrol source & channel status" },
  { id: "reports", icon: FileText, zh: "存證報告", en: "Reports", eyebrow: "EVIDENCE", descZh: "可交付法務的存證報告", descEn: "Deliverable evidence reports" },
  { id: "verify", icon: ShieldCheck, zh: "原創查驗", en: "Verify", eyebrow: "TOOL", descZh: "用範例查已收錄樣本", descEn: "Check indexed sample images" },
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
  status: "manual" | "queued" | "search";
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
    status: s.crawl_method === "not_automated" ? "queued" : s.crawl_method === "search_query_only" ? "search" : "manual",
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
      { t: asset?.uploaded_at, zh: "原創影像簽署封存", en: "Original sealed" },
      { t: asset?.uploaded_at, zh: "數位指紋寫入指紋庫", en: "Fingerprint indexed" },
      { t: a.retrieved_at, zh: "通路巡檢偵測到高相似影像", en: "Patrol detected high-similarity image" },
      { t: a.retrieved_at, zh: "證據快照待人工複審", en: "Evidence snapshot pending human review" },
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

  // first-time-visitor welcome overlay (auto-popup, dismissible, remembered)
  const [showOnboarding, setShowOnboarding] = useState<boolean>(getInitialOnboarding);

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

  const dismissOnboarding = () => {
    setShowOnboarding(false);
    saveOnboarded();
  };

  const onboardingGo = (next: View) => {
    dismissOnboarding();
    go(next);
  };

  const reopenOnboarding = () => setShowOnboarding(true);

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
            ? "已播放最近巡檢流程：未發現新的真實侵權"
            : "Latest patrol replayed: no new real infringement found",
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
      dismiss: { t: now, zh: "已標記為誤判", en: "Marked as false positive" },
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
  const patrolModeLabel = (() => {
    const adapter = loadState.data.monitoring.adapter;
    if (adapter?.id === "visionWebDetection" && adapter.paid_api_used) {
      return locale === "zh-TW" ? "巡檢模式：Vision 真實巡檢（預算控管）" : "Mode: live Vision patrol (budget guarded)";
    }
    if (adapter?.id === "visionWebDetection") {
      return locale === "zh-TW" ? "巡檢模式：Vision 試跑（不計費）" : "Mode: Vision dry run (no cost)";
    }
    if (adapter?.id === "seedUrls") {
      return locale === "zh-TW" ? "巡檢模式：真實抓取種子來源（零付費）" : "Mode: real seed-source fetch (zero cost)";
    }
    return locale === "zh-TW" ? "巡檢模式：讀取最新巡檢產物" : "Mode: latest patrol artifact";
  })();
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
              {T.brandSub[locale]}
            </p>
          </div>
          <span
            className="flex-none rounded-full border border-[#d8b76a66] bg-[#3a3527] px-2 py-0.5 text-[10px] font-semibold text-[#D8B76A]"
            style={{ fontFamily: MONO }}
            title={
              locale === "zh-TW"
                ? "MVP 試營運：背景巡檢讀取真實 patrol artifact；頁面上的下架、匯出、聯絡操作仍為安全示範"
                : "MVP pilot: background patrol reads real patrol artifacts; takedown, export, and contact actions remain safe UI demos"
            }
          >
            {T.demo[locale].toUpperCase()}
          </span>
        </div>
        <p className="hidden text-[12px] tracking-[0.3em] text-[#CEC0A3] lg:block" style={{ fontFamily: MONO }}>
          {T.tagline}
        </p>
        <div className="flex flex-none items-center gap-3">
          <span className="hidden items-center gap-2 text-[11px] text-[#CEC0A3] sm:flex" style={{ fontFamily: MONO }}>
            <span className="ttd-pulse inline-block h-[7px] w-[7px] rounded-full bg-[#7F9C7E]" />
            {clock}
          </span>
          <button
            type="button"
            onClick={reopenOnboarding}
            className="flex items-center gap-1.5 rounded-[8px] border border-[#ffffff26] px-2.5 py-2 text-xs font-semibold text-[#CEC0A3] transition-colors hover:text-[#F4E9D5]"
            title={locale === "zh-TW" ? "重新開啟導覽" : "Reopen the guide"}
          >
            <Compass size={14} />
            <span className="hidden sm:inline">{T.howItWorks[locale]}</span>
          </button>
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
                className={`flex items-start gap-3 rounded-[10px] px-3 py-2.5 text-left transition-colors ${
                  active ? "bg-[#1A1A1A] text-[#F4E9D5]" : "text-[#1A1A1A] hover:bg-[#e3d4b6]"
                }`}
              >
                <Icon size={18} className="mt-0.5 flex-none" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="text-[13.5px] font-semibold">{locale === "zh-TW" ? item.zh : item.en}</span>
                    <span className={`text-[8px] tracking-[0.1em] ${active ? "text-[#7F9C7E]" : "opacity-45"}`} style={{ fontFamily: MONO }}>
                      {item.eyebrow}
                    </span>
                  </span>
                  <span className={`mt-0.5 block text-[10.5px] leading-tight ${active ? "text-[#CEC0A3]" : "text-[#1a1a1a99]"}`}>
                    {locale === "zh-TW" ? item.descZh : item.descEn}
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
              patrolModeLabel={patrolModeLabel}
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
              onRunPatrol={runPatrol}
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
            <ChannelsView locale={locale} channels={channels} monitoring={loadState.data.monitoring} onRunPatrol={runPatrol} />
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
      {showOnboarding && (
        <OnboardingOverlay
          locale={locale}
          protectedDisplay={protectedDisplay}
          channelsDisplay={channelsTotalDisplay}
          suspectedActual={suspectedActual}
          onClose={dismissOnboarding}
          onGo={onboardingGo}
        />
      )}
    </main>
  );
}

/* ---------------- onboarding overlay (first-time visitor) ---------------- */

function OnboardingOverlay({
  locale,
  protectedDisplay,
  channelsDisplay,
  suspectedActual,
  onClose,
  onGo,
}: {
  locale: Locale;
  protectedDisplay: string;
  channelsDisplay: string;
  suspectedActual: string;
  onClose: () => void;
  onGo: (v: View) => void;
}) {
  const zh = locale === "zh-TW";
  // Condensed one-line flow — the full interactive 4-step lives on the dashboard,
  // so the welcome card summarises rather than repeats it.
  const flowLabels = zh
    ? ["入庫簽署", "通路巡檢", "疑似盜用", "存證交付"]
    : ["Register", "Patrol", "Detect", "Certify"];
  const stats: Array<{ value: string; label: string }> = [
    { value: protectedDisplay, label: zh ? "受保護原創" : "protected originals" },
    { value: suspectedActual, label: zh ? "真實侵權" : "real infringement" },
    { value: channelsDisplay, label: zh ? "監控通路" : "channels monitored" },
  ];
  const entries: Array<{ view: View; icon: LucideIcon; label: string; note: string }> = [
    { view: "vault", icon: Images, label: zh ? "看受保護的作品" : "See protected works", note: zh ? `已簽署保護 ${protectedDisplay} 張原創` : `${protectedDisplay} protected originals` },
    { view: "verify", icon: ShieldCheck, label: zh ? "看查驗怎麼運作" : "Try origin verify", note: zh ? "查驗已收錄的原創（示範）" : "Check a registered original (demo)" },
    { view: "alerts", icon: Bell, label: zh ? "看疑似盜用案件" : "Review detections", note: zh ? "系統發現、待你確認的案件" : "Findings awaiting your review" },
  ];

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[#1a1a1ac2] p-4 backdrop-blur-[3px]"
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-[680px] max-w-full overflow-auto rounded-[18px] border border-[#7f9c7e40] bg-[#F4E9D5]"
      >
        {/* header */}
        <div className="flex items-start justify-between gap-4 bg-[#1A1A1A] px-6 py-5 text-[#F4E9D5]">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[10px] tracking-[0.16em] text-[#7F9C7E]" style={{ fontFamily: MONO }}>
              <Compass size={13} /> {zh ? "歡迎使用 · WELCOME" : "Welcome"}
            </p>
            <h2 className="mt-1.5 text-[22px] font-semibold leading-tight">
              {zh ? "原創影像主動防護" : "Original-image protection"}
            </h2>
            <p className="mt-1.5 text-[13px] leading-6 text-[#CEC0A3]">
              {zh
                ? "我們替 PyroImage 的每一張原創影像建立數位指紋（影像的獨特特徵值，改圖也認得出），持續到各通路巡檢是否遭盜用，發現高度相似影像就自動存證。"
                : "We fingerprint every PyroImage original, run Vision-based web patrol, and package evidence when a high-similarity image needs review."}
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[#7F9C7E]" style={{ fontFamily: MONO }}>
              <ShieldCheck size={12} className="flex-none" />
              {zh ? "由 Numbers 提供 · 存證可上鏈驗證、可交付法務" : "By Numbers · evidence is on-chain verifiable and court-ready"}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex-none text-[#CEC0A3] hover:text-[#F4E9D5]">
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-5">
          {/* current-status snapshot — answers "what is my situation right now" at first glance */}
          <div className="mb-4 grid grid-cols-3 gap-2.5">
            {stats.map((s) => (
              <div key={s.label} className="rounded-[10px] border border-[#1a1a1a12] bg-white px-3 py-2.5 text-center">
                <p className="text-[20px] font-bold leading-none" style={{ fontFamily: MONO }}>
                  {s.value}
                </p>
                <p className="mt-1 text-[10.5px] leading-tight text-[#1a1a1a8c]">{s.label}</p>
              </div>
            ))}
          </div>

          {/* demo notice */}
          <div className="mb-5 flex items-start gap-2 rounded-[10px] border border-[#d8b76a80] bg-[#f8f1e2] px-4 py-3 text-[12.5px] leading-5 text-[#7a5f19]">
            <Info size={15} className="mt-0.5 flex-none" />
            <span>
              {zh
                ? "這是 MVP 試營運版：背景巡檢會由 GitHub Actions 產生真實巡檢產物；頁面上的下架、匯出、聯絡等操作仍為安全示範，不會真的送出或改動外部資料。目前真實侵權案件為 0。"
                : "This is an MVP pilot: background patrol produces real patrol artifacts through GitHub Actions; takedown, export, and contact actions remain safe UI demos and never change external data. Real infringement cases so far: 0."}
            </span>
          </div>

          {/* condensed flow summary — the full interactive 4-step flow lives on the dashboard */}
          <p className="mb-2 text-[10px] tracking-[0.16em] text-[#1a1a1a73]" style={{ fontFamily: MONO }}>
            {zh ? "保護流程" : "How it works"}
          </p>
          <div className="mb-6 flex flex-wrap items-center gap-x-1.5 gap-y-2 rounded-[11px] border border-[#1a1a1a12] bg-white px-4 py-3 text-[12.5px] font-semibold">
            {flowLabels.map((label, i) => (
              <span key={label} className="flex items-center gap-1.5">
                <span className="text-[10px] text-[#1a1a1a66]" style={{ fontFamily: MONO }}>{`0${i + 1}`}</span>
                {label}
                {i < flowLabels.length - 1 && <ArrowRight size={13} className="mx-0.5 text-[#1a1a1a40]" />}
              </span>
            ))}
          </div>

          {/* entry CTAs */}
          <p className="mb-2.5 text-[10px] tracking-[0.16em] text-[#1a1a1a73]" style={{ fontFamily: MONO }}>
            {zh ? "從這裡開始看" : "Start here"}
          </p>
          <div className="grid gap-2.5 sm:grid-cols-3">
            {entries.map((e) => {
              const Icon = e.icon;
              return (
                <button
                  key={e.view}
                  type="button"
                  onClick={() => onGo(e.view)}
                  className="group flex flex-col rounded-[11px] border border-[#1a1a1a1a] bg-white p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-[#7F9C7E] hover:shadow-[0_6px_18px_rgba(26,26,26,0.08)]"
                >
                  <Icon size={18} className="text-[#4f6a4e]" />
                  <p className="mt-2 text-[13.5px] font-semibold">{e.label}</p>
                  <p className="mt-0.5 text-[11px] leading-4 text-[#1a1a1a8c]">{e.note}</p>
                  <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-[#374037]">
                    {zh ? "前往" : "Open"} <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="mt-5 w-full rounded-[10px] bg-[#1A1A1A] py-3 text-[13px] font-semibold text-[#F4E9D5] transition-colors hover:bg-[#2c2c2c]"
          >
            {zh ? "開始使用（可隨時從右上角「導覽」重看）" : "Start exploring (reopen anytime from “How it works”)"}
          </button>
        </div>
      </div>
    </div>
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
          {locale === "zh-TW" ? "最近巡檢流程" : "Latest patrol replay"}
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
  hint,
}: {
  dot: string;
  eyebrow: string;
  title: string;
  desc?: string;
  hint?: string;
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
      {hint && <HintBanner text={hint} />}
    </div>
  );
}

/* one-line "how to read / operate this screen" banner */
function HintBanner({ text }: { text: string }) {
  return (
    <div className="mt-3 flex max-w-[720px] items-start gap-2 rounded-[9px] border border-[#e6d49a] bg-[#FBF3DD] px-3.5 py-2.5 text-[12px] leading-5 text-[#7a5f19]">
      <Lightbulb size={14} className="mt-0.5 flex-none" />
      <span>{text}</span>
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
  hint,
}: {
  index: string;
  label: string;
  sub: string;
  value: string;
  color: string;
  dark?: boolean;
  hint?: string;
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
        {hint && <p className={`mt-1.5 text-[11px] leading-4 ${dark ? "text-[#CEC0A3]" : "text-[#1a1a1a8c]"}`}>{hint}</p>}
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
  patrolModeLabel: string;
  patrolStatus: string;
  reportCount: number;
  suspectedActual: string;
  alerts: AlertVM[];
  channels: ChannelVM[];
  onOpenCase: (id: string) => void;
  onNavigate: (v: View) => void;
  onRunPatrol: () => void;
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
    ? `目前真實侵權案件：${suspectedActual} 件。${props.realPatrolMatches} 筆警報來自實際抓取候選影像與影像特徵比對命中；來源授權與外部侵權主張仍需人工確認。`
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
              ? "為 PyroImage 的每一張原創影像建立數位指紋，以 Vision 背景巡檢尋找相似影像，並列出指定通路的導入狀態；高度相似候選需經人工複核後才會形成對外主張。"
              : "Every PyroImage original gets a digital fingerprint. Vision-based web patrol looks for similar images while named channels show integration status; high-similarity candidates require human review before any external claim."
          }
          hint={
            zh
              ? "第一次來？先看下方「保護流程」四個步驟，點任一步驟就能進入對應畫面。"
              : "First time here? Start with the 4-step “How it works” flow below — click any step to open that screen."
          }
        />
        <p className="text-[11px] text-[#1a1a1a80]" style={{ fontFamily: MONO }}>
          {zh ? "最近巡檢時間" : "Last patrol"}
          <br />
          <span className="text-[13px] text-[#1A1A1A]">{lastPatrol}</span>
          <br />
          <span className="text-[10px] text-[#1a1a1a80]">
            {props.patrolModeLabel} · {props.lastRunSourceCount} {zh ? "來源" : "sources"} · {props.lastRunAlerts} {zh ? "警報" : "alerts"}
          </span>
        </p>
      </div>

      {/* honesty banner (kept near the top so the demo/real distinction is read first) */}
      <div className="mb-5 flex items-start gap-2 rounded-[10px] border border-[#cfe0cb] bg-[#eef4ea] px-4 py-3 text-xs leading-5 text-[#3f5a3e]">
        <ShieldCheck size={15} className="mt-0.5 flex-none text-[#4f6a4e]" />
        <span>{honestyText}</span>
      </div>

      {/* 4-step flow — the primary "how it works" story, leads the screen */}
      <div className="mb-6 rounded-[14px] border border-[#1a1a1a12] bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-[#1a1a1a99]" style={{ fontFamily: MONO }}>
            {zh ? "保護流程 · 點選任一步驟前往對應畫面 →" : "How it works · click any step to open it →"}
          </p>
          <button
            type="button"
            onClick={props.onRunPatrol}
            className="flex items-center gap-1.5 rounded-[8px] bg-[#1A1A1A] px-3.5 py-2 text-[12px] font-semibold text-[#F4E9D5] transition-colors hover:bg-[#2c2c2c]"
          >
            <ScanLine size={14} /> {zh ? "查看最近巡檢" : "Review latest patrol"}
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {steps.map((s, i) => (
            <div key={s.step} className="relative">
              <button
                type="button"
                onClick={() => props.onNavigate(s.target)}
                className="group h-full w-full rounded-[10px] border border-[#1a1a1a12] p-3.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-[0_6px_18px_rgba(26,26,26,0.08)]"
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
                <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-[#374037] opacity-60 transition-opacity group-hover:opacity-100">
                  {zh ? "前往" : "Open"} <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </button>
              {i < steps.length - 1 && (
                <ArrowRight
                  size={16}
                  className="absolute -right-[11px] top-1/2 z-10 hidden -translate-y-1/2 text-[#1a1a1a40] xl:block"
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* KPIs — current numbers, secondary to the flow, each with a plain-language line */}
      <div className="mb-6 grid grid-cols-2 gap-3.5 xl:grid-cols-4">
        <KpiCard index="01" label={zh ? "待複審警報" : "Open alerts"} sub={zh ? "OPEN · 待人工確認" : "OPEN · pending review"} value={openCount.toString()} color={C.orange} dark hint={zh ? "系統發現、等你確認的疑似盜用件數" : "Suspected copies awaiting your review"} />
        <KpiCard index="02" label={zh ? "受保護原創" : "Protected"} sub="PROTECTED" value={protectedDisplay} color={C.green} hint={zh ? "已建立指紋保護的原創影像張數" : "Originals fingerprinted & protected"} />
        <KpiCard index="03" label={zh ? "真實侵權" : "Real infringement"} sub={zh ? "已確認" : "confirmed"} value={suspectedActual} color={C.greenDeep} hint={zh ? "目前確認為真實侵權的件數（最新巡檢產物為 0）" : "Confirmed real infringement cases (0 in the latest patrol artifact)"} />
        <KpiCard index="04" label={zh ? "已存證報告" : "Evidence reports"} sub="REPORTS" value={reportCount.toString()} color={C.ink} hint={zh ? "可交付法務的存證報告份數" : "Deliverable evidence reports generated"} />
      </div>

      {/* two columns */}
      <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
        <div className="overflow-hidden rounded-[14px] border border-[#1a1a1a12] bg-white">
          <div className="flex items-center justify-between px-5 pb-3 pt-[18px]">
            <div>
              <p className="text-[16px] font-semibold">{zh ? "最新疑似盜用" : "Latest detections"}</p>
              {!zh && (
                <p className="text-[10px] tracking-[0.1em] text-[#1a1a1a73]" style={{ fontFamily: MONO }}>
                  LATEST DETECTIONS
                </p>
              )}
            </div>
            <button type="button" onClick={() => props.onNavigate("alerts")} className="text-xs font-semibold text-[#2E52A0]">
              {zh ? "全部 →" : "All →"}
            </button>
          </div>
          {props.alerts.length === 0 && (
            <p className="border-t border-[#1a1a1a0f] px-5 py-6 text-sm text-[#1a1a1a73]">
              {zh ? "目前沒有疑似盜用 —— 這是好事，代表通路上尚未發現你的原創被盜用。" : "No detections right now — that’s good news: no copies of your originals have surfaced yet."}
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
                  {zh ? "相似度" : "MATCH"}
                </span>
              </span>
              <StatusPill status={a.status} locale={locale} />
            </button>
          ))}
        </div>

        <div className="overflow-hidden rounded-[14px] border border-[#1a1a1a12] bg-white">
          <div className="px-5 pb-3 pt-[18px]">
            <p className="text-[16px] font-semibold">{zh ? "通路巡檢狀態" : "Channel status"}</p>
            {!zh && (
              <p className="text-[10px] tracking-[0.1em] text-[#1a1a1a73]" style={{ fontFamily: MONO }}>
                CHANNEL STATUS
              </p>
            )}
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
  return status === "search" ? C.blue : status === "queued" ? C.orange : C.stone;
}
function chLabel(status: ChannelVM["status"], locale: Locale) {
  const zh = { manual: "人工複核", search: "搜尋線索", queued: "待授權" };
  const en = { manual: "Manual review", search: "Search lead", queued: "Needs auth" };
  return (locale === "zh-TW" ? zh : en)[status];
}
function chNote(status: ChannelVM["status"], locale: Locale) {
  const zh = {
    manual: "尚未接直接爬蟲，作為人工複核與後續導入來源。",
    search: "可作為搜尋查詢來源，尚未等同平台爬蟲。",
    queued: "需要平台授權、API 或合規確認後才能自動化。",
  };
  const en = {
    manual: "Not connected to a direct crawler yet; used for manual review and future integration.",
    search: "Usable as a search-query lead, not the same as a platform crawler.",
    queued: "Needs platform permission, API access, or compliance review before automation.",
  };
  return (locale === "zh-TW" ? zh : en)[status];
}

/* ---------------- verification view ---------------- */

function verificationToneColor(tone: VerificationQuery["verdict"]["tone"]) {
  if (tone === "match") return C.greenDeep;
  if (tone === "clear") return C.blue;
  return C.amber;
}

function verificationExampleText(query: VerificationQuery, locale: Locale) {
  const zh = locale === "zh-TW";
  if (query.verdict.code === "registered_original") {
    return zh ? "這張就是已收錄原作" : "This is an indexed original";
  }
  if (query.verdict.code === "registered_derivative") {
    return zh ? "這張改過圖仍能認出原作" : "This edited image still matches an original";
  }
  if (query.verdict.code === "not_registered") {
    return zh ? "這張不在目前原創庫" : "This image is not in the current index";
  }
  return zh ? "需要人工複核" : "Needs human review";
}

function distanceHelpText(match: VerificationTopMatch | null, threshold: number, locale: Locale) {
  const zh = locale === "zh-TW";
  if (!match) return zh ? "沒有找到可比對的原作" : "No comparable original found";
  const passed = match.combined_distance <= threshold;
  if (zh) {
    return passed
      ? `距離 ${match.combined_distance}，低於門檻 ${threshold}，系統判定為命中。數字越低代表越像。`
      : `距離 ${match.combined_distance}，高於門檻 ${threshold}，系統不判定為命中。數字越低代表越像。`;
  }
  return passed
    ? `Distance ${match.combined_distance}, below the ${threshold} threshold, so the system treats it as a match. Lower means more similar.`
    : `Distance ${match.combined_distance}, above the ${threshold} threshold, so the system does not treat it as a match. Lower means more similar.`;
}

function similarityHelpText(match: VerificationTopMatch | null, locale: Locale) {
  const zh = locale === "zh-TW";
  if (!match) return zh ? "無相似度" : "No similarity score";
  const pct = Math.round(match.similarity_score * 10000) / 100;
  return zh ? `${pct}% 相似，越高越像；仍需搭配原創憑證判讀。` : `${pct}% similar. Higher means more similar; read it with the origin certificate.`;
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
          eyebrow={zh ? "原創查驗" : "Origin verify"}
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
        eyebrow={zh ? "原創查驗" : "Origin verify"}
        title={zh ? "原創影像查驗入口" : "Original-image verification"}
        desc={
          zh
            ? "這個入口可以使用；目前 MVP 只查已建立指紋的樣本。請先點下方範例試跑，或貼上已收錄樣本的網址 / 資產 ID。"
            : "This tool is usable today; the MVP verifies samples that already have fingerprints. Start with an example below, or paste an indexed sample URL / asset ID."
        }
        hint={
          zh
            ? "目前不能貼任意新圖片即時建指紋；查不到時不會產生判定或警報。正式版才會支援任意圖片查驗與後續案件流程。"
            : "It does not create a new fingerprint for any arbitrary image yet; unsupported inputs produce no verdict or alert. The full version will support arbitrary-image verification and case workflows."
        }
      />

      <div className="mb-5 grid gap-3.5 md:grid-cols-4">
        <KpiCard
          index="V1"
          label={zh ? "已收錄樣本數" : "Local index"}
          sub={zh ? "可查驗樣本" : "verifiable samples"}
          value={verification.library.indexed_rows.toString()}
          color={C.green}
        />
        <KpiCard
          index="V2"
          label={zh ? "受保護原作總數" : "Protected originals"}
          sub={zh ? "PyroImage 原作" : "PyroImage originals"}
          value={(verification.library.protected_originals_baseline || 0).toLocaleString("en-US")}
          color={C.ink}
        />
        <KpiCard
          index="V3"
          label={zh ? "命中判定線" : "Match line"}
          sub={zh ? "低於此數字算命中" : "lower than this means match"}
          value={verification.library.threshold.toString()}
          color={C.blue}
        />
        <KpiCard
          index="V4"
          label={zh ? "查驗工具狀態" : "Tool status"}
          sub={zh ? "本次查驗零費用" : "zero cost"}
          value={passAll ? (zh ? "可用" : "READY") : "CHECK"}
          color={passAll ? C.greenDeep : C.orange}
          dark
        />
      </div>

      <div className="mb-5 grid gap-5 xl:grid-cols-[1fr_1.35fr]">
        <section className="rounded-[14px] border border-[#1a1a1a12] bg-white p-5">
          {/* Primary action in the MVP: examples are the clearest path because manual input only accepts indexed samples. */}
          <p className="mb-1 text-[12px] font-semibold" style={{ fontFamily: MONO }}>
            {zh ? "先從這裡開始" : "Start here"}
          </p>
          <p className="mb-3 text-[11px] leading-4 text-[#1a1a1a80]">
            {zh
              ? "點一個範例，右側會立即顯示判定結果；這是目前 MVP 最穩定的使用方式。"
              : "Click an example and the verdict appears on the right; this is the most reliable way to use the current MVP."}
          </p>
          <div className="grid gap-2">
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
                    className={`mt-1 block text-[11px] leading-4 ${selected ? "text-[#CEC0A3]" : "text-[#1a1a1a73]"}`}
                  >
                    {verificationExampleText(query, locale)}
                  </span>
                </button>
              );
            })}
          </div>

          {/* SECONDARY: manual input, downgraded — clearly scoped to indexed samples */}
          <p className="mb-2 mt-5 text-[12px] font-semibold">
            {zh ? "進階：貼已收錄樣本" : "Advanced: paste an indexed sample"}
          </p>
          <p className="mb-3 text-[11px] leading-4 text-[#1a1a1a73]">
            {zh
              ? "這裡不是任意圖片搜尋；只接受已入庫、已建立指紋的樣本網址或資產 ID。"
              : "This is not arbitrary-image search; it only accepts URLs or asset IDs already indexed with fingerprints."}
          </p>
          <form onSubmit={submitVerification} className="flex gap-2">
            <input
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              placeholder={zh ? "貼上已收錄樣本的網址或資產 ID…" : "Paste an indexed sample URL or asset ID…"}
              className="min-w-0 flex-1 rounded-[9px] border border-[#1a1a1a26] bg-[#FBF6EC] px-3.5 py-2.5 text-[12px] outline-none placeholder:text-[#1a1a1a4d] focus:border-[#7F9C7E]"
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
          {inputState === "unsupported" ? (
            <p className="mt-3 rounded-[9px] border border-[#e0d3ad] bg-[#FBF6EC] px-3.5 py-2.5 text-[12px] leading-5 text-[#80621c]">
              {zh
                ? "目前沒有找到這個輸入的指紋，所以不會產生判定，也不會建立警報。請先用上方範例；正式版才會支援任意新圖片查驗。"
                : "No fingerprint was found for this input, so it produces no verdict and no alert. Use an example above first; arbitrary new-image verification belongs to the full version."}
            </p>
          ) : (
            <p className="mt-2.5 flex items-start gap-1.5 text-[11px] leading-4 text-[#1a1a1a80]">
              <Info size={13} className="mt-px flex-none" />
              {zh
                ? "想直接看結果，請使用上方範例。手動輸入適合已知道資產 ID 或樣本網址的使用者。"
                : "For an immediate result, use an example above. Manual input is for users who already know the asset ID or indexed sample URL."}
            </p>
          )}
        </section>

        <section className="rounded-[14px] border border-[#1a1a1a12] bg-white p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[12px] text-[#1a1a1a80]" style={{ fontFamily: MONO }}>
                {zh ? "查驗結果" : "Verification result"}
              </p>
              <h2 className="mt-1 text-[24px] font-semibold leading-tight" style={{ fontFamily: MONO }}>
                {zh ? activeQuery.verdict.zh : activeQuery.verdict.en}
              </h2>
              <p className="mt-2 max-w-[520px] text-[12px] leading-5 text-[#1a1a1a80]">
                {topMatch
                  ? distanceHelpText(topMatch, verification.library.threshold, locale)
                  : zh
                  ? "目前原創庫沒有找到足以判定命中的作品。"
                  : "The current index does not contain a strong enough match."}
              </p>
            </div>
            <div
              className="flex h-[92px] w-[92px] flex-col items-center justify-center rounded-full border-4"
              style={{ borderColor: verdictColor }}
            >
              <span className="text-[25px] font-bold leading-none" style={{ fontFamily: MONO, color: verdictColor }}>
                {similarityPct}%
              </span>
              <span className="mt-1 text-[9px] tracking-[0.1em] text-[#1a1a1a80]" style={{ fontFamily: MONO }}>
                {zh ? "相似程度" : "SIMILARITY"}
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
                {zh ? "已建立本機視覺指紋：" : "Local fingerprint created: "}
                {shortFp(activeQuery.query_fingerprint.fingerprint_value)}
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <CaseField
                  label={zh ? "最接近的已收錄原作" : "Closest indexed original"}
                  value={topMatch?.display_title || (zh ? "無命中" : "No match")}
                />
                <CaseField
                  label={zh ? "判定距離" : "Decision distance"}
                  value={
                    topMatch
                      ? topMatch.combined_distance <= verification.library.threshold
                        ? zh
                          ? "低於門檻，判定命中"
                          : "Below threshold, match"
                        : zh
                        ? "高於門檻，未命中"
                        : "Above threshold, no match"
                      : "N/A"
                  }
                  note={distanceHelpText(topMatch, verification.library.threshold, locale)}
                  mono
                />
                <CaseField
                  label={zh ? "相似程度" : "Similarity"}
                  value={topMatch ? `${Math.round(topMatch.similarity_score * 10000) / 100}%` : "N/A"}
                  note={similarityHelpText(topMatch, locale)}
                  mono
                />
                <CaseField
                  label={zh ? "對外宣稱狀態" : "Public claim status"}
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
                    <ExternalLink size={14} /> {zh ? "開啟公開驗證頁" : "Open public verification"}
                  </a>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      <div className="rounded-[14px] border border-[#1a1a1a12] bg-white">
        <div className="border-b border-[#1a1a1a0f] px-5 py-4">
          <h3 className="text-[15px] font-semibold">{zh ? "系統比對結果" : "Candidate originals compared by the system"}</h3>
          <p className="mt-1 max-w-[880px] text-[12px] leading-5 text-[#1a1a1a80]">
            {zh
              ? `系統會把輸入圖和已收錄原創逐一比對。判定距離越低越像；低於 ${verification.library.threshold} 才算命中。相似程度是輔助閱讀，實際主張仍要看原創憑證與人工複核。`
              : `The system compares the input against indexed originals. Lower decision distance means more similar; below ${verification.library.threshold} counts as a match. Similarity is for readability; claims still require the origin certificate and human review.`}
          </p>
        </div>
        <div
          className="grid grid-cols-[1fr_116px_96px] gap-3 bg-[#EFE3CC] px-5 py-3 text-[10px] tracking-[0.08em] text-[#1a1a1a8c] md:grid-cols-[1fr_160px_120px_150px]"
          style={{ fontFamily: MONO }}
        >
          <span>{zh ? "可能對應的原作" : "POSSIBLE ORIGINAL"}</span>
          <span>{zh ? "判定距離" : "DISTANCE"}</span>
          <span>{zh ? "相似程度" : "SIMILARITY"}</span>
          <span className="hidden md:block">{zh ? "原創憑證" : "CERTIFICATE"}</span>
        </div>
        {activeQuery.result.top_matches.slice(0, 5).map((match) => {
          const isPass = match.combined_distance <= verification.library.threshold;
          const candidateWork = worksById.get(match.asset_id);
          return (
            <div
              key={`${activeQuery.query_id}-${match.asset_id}`}
              className="grid grid-cols-[1fr_116px_96px] gap-3 border-t border-[#1a1a1a0f] px-5 py-3.5 text-[12px] md:grid-cols-[1fr_160px_120px_150px]"
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold">{match.display_title || match.asset_id}</span>
                <span className="block truncate text-[10px] text-[#1a1a1a73]" style={{ fontFamily: MONO }}>
                  {shortFp(match.asset_id)}
                </span>
              </span>
              <span className="min-w-0">
                <span className="block font-semibold" style={{ color: isPass ? C.greenDeep : C.ink }}>
                  {isPass ? (zh ? "命中" : "Match") : zh ? "未命中" : "No match"}
                </span>
                <span className="block text-[10px] text-[#1a1a1a73]" style={{ fontFamily: MONO }}>
                  {match.combined_distance} / {verification.library.threshold}
                </span>
              </span>
              <span className="font-semibold" style={{ fontFamily: MONO, color: isPass ? C.greenDeep : C.ink }}>
                {Math.round(match.similarity_score * 10000) / 100}%
              </span>
              <span className="hidden min-w-0 md:block">
                {candidateWork ? (
                  <button
                    type="button"
                    onClick={() => onOpenCert(match.asset_id)}
                    className="rounded-[8px] border border-[#1a1a1a26] px-3 py-1.5 text-[11px] font-semibold hover:bg-[#FBF6EC]"
                  >
                    {zh ? "看憑證" : "View"}
                  </button>
                ) : (
                  <span className="text-[#1a1a1a66]">N/A</span>
                )}
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
        hint={
          zh
            ? "怎麼看：用上方標籤篩選（全部／高風險／待複審／已處理），點任一列打開案件詳情。標有「示範案件」者為展示流程用。"
            : "How to read: filter with the chips above (all / high / open / done) and click any row to open the case. Rows tagged “Demo case” illustrate the workflow."
        }
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

      <HintBanner
        text={
          zh
            ? "怎麼看：左右對照「原創 vs 巡檢發現」，中央圓圈是相似度，下方「來源軌跡」是完整證據時間線。底部行動按鈕皆為示範，只會記錄到本案軌跡。"
            : "How to read: compare original vs detected side by side, the ring shows similarity, and the provenance trace below is the full evidence timeline. The action buttons at the bottom are demos and only log to this case."
        }
      />

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
              {zh ? "相似度" : "MATCH"}
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
            {zh ? "特徵距離" : "Feature distance"} {vm.distance} / {zh ? "判定門檻" : "threshold"} {vm.threshold}
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
          <CaseField label={zh ? "對外宣稱狀態" : "Public claim"} value={zh ? "僅供內部使用" : "Internal only"} />
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
          <div className="flex items-center gap-2">
            <p className="text-[14px] font-semibold text-[#F4E9D5]">{zh ? "採取行動" : "Take action"}</p>
            <span
              className="rounded-full border border-[#d8b76a66] bg-[#3a3527] px-2 py-0.5 text-[10px] font-semibold text-[#D8B76A]"
              style={{ fontFamily: MONO }}
            >
              {zh ? "示範" : "DEMO"}
            </span>
          </div>
          <p className="mt-0.5 text-[10px] tracking-[0.08em] text-[#CEC0A3]" style={{ fontFamily: MONO }}>
            {zh ? "示範流程 · 僅記錄到本案軌跡，不會真的送出" : "Demo workflow · logged to this case only, nothing is actually sent"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button type="button" title={zh ? "示範：僅記錄到本案時間軸，不會真的送出下架" : "Demo: only logs to this case timeline; no real takedown is sent"} onClick={() => props.onAction("dmca")} className="rounded-[9px] bg-[#ED5D29] px-4 py-2.5 text-[12.5px] font-semibold text-white">
            {zh ? "發出 DMCA 下架" : "Send DMCA"}
          </button>
          <button type="button" title={zh ? "示範：於本案產生一筆存證報告項目" : "Demo: adds an evidence-report entry to this case"} onClick={() => props.onAction("report")} className="rounded-[9px] bg-[#7F9C7E] px-4 py-2.5 text-[12.5px] font-semibold text-[#1A1A1A]">
            {zh ? "產生存證報告" : "Generate report"}
          </button>
          <button type="button" title={zh ? "示範：記錄封存動作" : "Demo: logs an archive action"} onClick={() => props.onAction("archive")} className="rounded-[9px] border border-[#f4e9d54d] px-4 py-2.5 text-[12.5px] font-semibold text-[#F4E9D5]">
            {zh ? "封存證據" : "Archive"}
          </button>
          <button type="button" title={zh ? "示範：記錄聯絡通知" : "Demo: logs a contact notice"} onClick={() => props.onAction("contact")} className="rounded-[9px] border border-[#f4e9d54d] px-4 py-2.5 text-[12.5px] font-semibold text-[#F4E9D5]">
            {zh ? "聯絡對方" : "Contact"}
          </button>
          <button type="button" title={zh ? "示範：將本案標記為誤判" : "Demo: marks this case as a false positive"} onClick={() => props.onAction("dismiss")} className="rounded-[9px] px-3 py-2.5 text-[12.5px] font-semibold text-[#CEC0A3]">
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

function CaseField({ label, value, mono, note }: { label: string; value: string; mono?: boolean; note?: string }) {
  return (
    <div className="mb-3">
      <p className="text-[10px] text-[#1a1a1a73]" style={{ fontFamily: MONO }}>
        {label}
      </p>
      <p className={`mt-0.5 truncate text-[13px] ${mono ? "font-medium" : "font-semibold"}`} style={mono ? { fontFamily: MONO } : undefined}>
        {value}
      </p>
      {note && <p className="mt-1 text-[11px] leading-4 text-[#1a1a1a73]">{note}</p>}
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
        desc={zh ? "每張影像都建立了不可逆的視覺指紋（影像的獨特特徵值，改圖也認得出）與來源憑證。點擊卡片檢視著作憑證。" : "Each image has an irreversible visual fingerprint and origin certificate. Click a card to view its certificate."}
        hint={zh ? "怎麼看：點任一張作品卡，開啟它的原創憑證（創作者、權利人、指紋、可驗證連結）。" : "How to read: click any work card to open its origin certificate — creator, rights holder, fingerprint, and a verifiable link."}
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
              <p className="mt-2 text-[11px] font-semibold text-[#4f6a4e]">
                {zh ? "點看原創憑證 →" : "View certificate →"}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------- channels view ---------------- */

function ChannelsView({
  locale,
  channels,
  monitoring,
  onRunPatrol,
}: {
  locale: Locale;
  channels: ChannelVM[];
  monitoring: MonitoringRun;
  onRunPatrol: () => void;
}) {
  const zh = locale === "zh-TW";
  const liveSources = new Set((monitoring.source_runs || []).map((run) => run.source_id).filter(Boolean));
  const liveSourceCount = liveSources.size || (monitoring.adapter?.id === "visionWebDetection" ? 1 : 0);
  const latestCandidates = monitoring.run_scope?.candidates_attempted ?? 0;
  const lastRunLabel = formatDateForLocale(monitoring.completed_at || monitoring.generated_at, locale);
  const stageCounts = channels.reduce(
    (acc, channel) => {
      acc[channel.status] += 1;
      return acc;
    },
    { manual: 0, queued: 0, search: 0 },
  );
  return (
    <div className="max-w-[1240px] px-6 py-7 md:px-9">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <PageHead
          dot={C.blue}
          eyebrow={zh ? "監控通路" : "Patrol channels"}
          title={zh ? "巡檢來源與通路導入狀態" : "Patrol source and channel-integration status"}
          desc={
            zh
              ? "目前已運作的自動巡檢來源是 Google Vision Web Detection；下列 14 個通路是監控範圍與導入狀態，不代表每個通路都已接上直接爬蟲。"
              : "The live automated patrol source is Google Vision Web Detection. The 14 named channels below are monitoring scope and integration status, not proof that each has a direct crawler."
          }
          hint={
            zh
              ? "怎麼看：上方看目前真正執行的巡檢來源；下方每張卡表示指定通路的導入狀態。右上「查看最近巡檢」只播放最新巡檢流程，不會從瀏覽器直接啟動 GitHub Actions。"
              : "How to read: the summary shows the real patrol source; each card shows the named channel's integration status. “Review latest patrol” only replays the latest patrol flow and does not start GitHub Actions from the browser."
          }
        />
        <button type="button" onClick={onRunPatrol} className="rounded-[9px] bg-[#1A1A1A] px-[18px] py-2.5 text-[12.5px] font-semibold text-[#F4E9D5]">
          ＋ {zh ? "查看最近巡檢" : "Review latest patrol"}
        </button>
      </div>

      <div className="mb-5 grid gap-3.5 lg:grid-cols-3">
        <div className="rounded-[14px] border border-[#1a1a1a12] bg-white p-4">
          <p className="text-[11px] font-semibold text-[#1a1a1a80]" style={{ fontFamily: MONO }}>
            {zh ? "已運作巡檢來源" : "Live patrol source"}
          </p>
          <p className="mt-2 text-[22px] font-semibold" style={{ fontFamily: MONO }}>
            Vision Web Detection
          </p>
          <p className="mt-1 text-[12px] leading-5 text-[#1a1a1a80]">
            {zh ? `最新 run 來源 ${liveSourceCount} 個，候選影像 ${latestCandidates} 筆。` : `${liveSourceCount} live source(s), ${latestCandidates} candidate image(s) in the latest run.`}
          </p>
        </div>
        <div className="rounded-[14px] border border-[#1a1a1a12] bg-white p-4">
          <p className="text-[11px] font-semibold text-[#1a1a1a80]" style={{ fontFamily: MONO }}>
            {zh ? "通路導入狀態" : "Named channels"}
          </p>
          <p className="mt-2 text-[22px] font-semibold" style={{ fontFamily: MONO }}>
            {channels.length}
          </p>
          <p className="mt-1 text-[12px] leading-5 text-[#1a1a1a80]">
            {zh
              ? `搜尋線索 ${stageCounts.search}、人工複核 ${stageCounts.manual}、待授權 ${stageCounts.queued}。`
              : `${stageCounts.search} search lead(s), ${stageCounts.manual} manual-review source(s), ${stageCounts.queued} needs auth.`}
          </p>
        </div>
        <div className="rounded-[14px] border border-[#1a1a1a12] bg-white p-4">
          <p className="text-[11px] font-semibold text-[#1a1a1a80]" style={{ fontFamily: MONO }}>
            {zh ? "最近巡檢時間" : "Latest patrol"}
          </p>
          <p className="mt-2 text-[18px] font-semibold" style={{ fontFamily: MONO }}>
            {lastRunLabel}
          </p>
          <p className="mt-1 text-[12px] leading-5 text-[#1a1a1a80]">
            {zh ? "候選仍需通過本地指紋比對與人工複核後，才會形成外部主張。" : "Candidates still need local fingerprint matching and human review before any external claim."}
          </p>
        </div>
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
              <p className="mt-1 text-[11px] leading-4 text-[#1a1a1a73]">
                {chNote(c.status, locale)}
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
                {zh ? `相關警報 ${c.hits}` : `${c.hits} related alerts`}
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
        hint={zh ? "怎麼看：每列是一份存證報告，含關聯案件、類型與可驗證存證憑證；點「匯出（示範）」不會真的產生檔案。" : "How to read: each row is an evidence report with its linked case, type, and a verifiable certificate. “PDF/Export” is a demo — no file is actually produced."}
      />
      <div className="overflow-hidden rounded-[14px] border border-[#1a1a1a12] bg-white">
        <div className="flex items-center gap-3.5 bg-[#EFE3CC] px-5 py-3 text-[10px] tracking-[0.08em] text-[#1a1a1a8c]" style={{ fontFamily: MONO }}>
          <span className="w-[88px] flex-none">{zh ? "報告編號" : "REPORT"}</span>
          <span className="flex-1">{zh ? "關聯案件 / 類型" : "CASE / TYPE"}</span>
          <span className="w-[150px] flex-none">{zh ? "存證憑證" : "CERTIFICATE"}</span>
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
            <span className="flex w-[150px] flex-none items-center gap-1 truncate text-[11px] font-semibold text-[#4f6a4e]">
              <ShieldCheck size={13} className="flex-none" /> {zh ? "可驗證" : "Verifiable"}
            </span>
            <span className="w-[66px] flex-none">
              <button
                type="button"
                onClick={() => props.onExport(r.id)}
                className="flex items-center gap-1 rounded-[7px] border border-[#1a1a1a33] px-2.5 py-1.5 text-[11px] font-semibold"
              >
                <Download size={12} /> {zh ? "匯出（示範）" : "PDF"}
              </button>
            </span>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-[#1a1a1a73]">{zh ? "尚無存證報告。在案件詳情點「產生存證報告」即可建立一份（示範）。" : "No reports yet. Open a case and click “Generate report” to create one (demo)."}</p>
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
                {zh ? "原創憑證" : "ORIGINAL CERTIFICATE"}
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

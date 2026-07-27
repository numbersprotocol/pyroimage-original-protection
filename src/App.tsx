import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Download,
  ExternalLink,
  FileText,
  Images,
  Info,
  LayoutDashboard,
  Lightbulb,
  Menu,
  Radar,
  ScanLine,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useOriginRadarData } from "./data/useOriginRadarData";
import type {
  EvidenceReportDocument,
  Locale,
  MonitoringRun,
  VerificationDocument,
  VerificationQuery,
  VerificationTopMatch,
} from "./data/originRadarTypes";
import {
  GRADS,
  buildAlerts,
  buildChannels,
  buildWorks,
  formatDateForLocale,
  metricDisplay,
  shortFp,
  type AlertVM,
  type ChannelVM,
  type TimelineItem,
  type WorkVM,
} from "./domain/originRadarViewModels";

/* ============================================================
 * OriginRadar · Original-image theft detection (PyroImage MVP)
 * UI = provenance-patrol console. Backend architecture unchanged:
 * every substantive value is read from the shipped patrol JSON
 * data files. Interactive scan / case actions are clearly-labelled
 * workflow demonstrations (local state only — no backend writes).
 * ============================================================ */

type View = "dashboard" | "verify" | "alerts" | "case" | "vault" | "channels" | "reports";
type CasesTab = "open" | "confirmed" | "reports";
type DemoCaseState = "open" | "confirmed" | "reported";

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

/* onboarding checklist + intro collapse state (localStorage, non-critical) */
function readOnbState(): { hide: boolean; steps: [boolean, boolean, boolean] } {
  try {
    return {
      hide: window.localStorage.getItem(`${ONBOARD_STORAGE_KEY}-hide`) === "1",
      steps: [
        window.localStorage.getItem(`${ONBOARD_STORAGE_KEY}-s1`) === "1",
        window.localStorage.getItem(`${ONBOARD_STORAGE_KEY}-s2`) === "1",
        window.localStorage.getItem(`${ONBOARD_STORAGE_KEY}-s3`) === "1",
      ],
    };
  } catch {
    return { hide: false, steps: [false, false, false] };
  }
}

function persistOnbKey(suffix: string) {
  try {
    window.localStorage.setItem(`${ONBOARD_STORAGE_KEY}-${suffix}`, "1");
  } catch {
    /* non-critical preference persistence */
  }
}

function readIntroOpen(): boolean {
  try {
    return window.localStorage.getItem(`${ONBOARD_STORAGE_KEY}-intro`) !== "0";
  } catch {
    return true;
  }
}

function persistIntroOpen(open: boolean) {
  try {
    window.localStorage.setItem(`${ONBOARD_STORAGE_KEY}-intro`, open ? "1" : "0");
  } catch {
    /* non-critical preference persistence */
  }
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
  // Task-oriented IA (redesign 2026-07-10): home → verify → cases → vault → sources.
  { id: "dashboard", icon: LayoutDashboard, zh: "總覽", en: "Home", eyebrow: "HOME", descZh: "現在安全嗎、要做什麼", descEn: "Am I safe & what to do next" },
  { id: "verify", icon: ShieldCheck, zh: "查一張圖", en: "Verify", eyebrow: "VERIFY", descZh: "用圖前，先查來源與授權", descEn: "Check origin before using an image" },
  { id: "alerts", icon: Bell, zh: "警報與存證", en: "Cases", eyebrow: "CASES", descZh: "疑似盜用複審、法務報告", descEn: "Review alerts & evidence reports" },
  { id: "vault", icon: Images, zh: "我的原創", en: "Vault", eyebrow: "VAULT", descZh: "已簽署保護的原創作品", descEn: "Signed & protected originals" },
  { id: "channels", icon: Radar, zh: "監控通路", en: "Channels", eyebrow: "SOURCES", descZh: "巡檢範圍與通路狀態", descEn: "Patrol scope & channel status" },
];

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
      {locale === "zh-TW" ? "展示案件" : "Preview case"}
    </span>
  );
}

/* ---------------- main component ---------------- */

export function TtdMvpDashboard() {
  const loadState = useOriginRadarData();
  const [locale, setLocale] = useState<Locale>(getInitialLocale);
  const [clock, setClock] = useState<string>(() => formatClock(new Date()));

  const [view, setView] = useState<View>("dashboard");
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [certAssetId, setCertAssetId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; kind: "ok" | "alert" } | null>(null);

  const [scanning, setScanning] = useState(false);
  const [scanPct, setScanPct] = useState(0);
  const [scanChannel, setScanChannel] = useState("");

  // cases page: active tab + DEMO case walkthrough state (UI demonstration only, never counted)
  const [casesTab, setCasesTab] = useState<CasesTab>("open");
  const [demoCase, setDemoCase] = useState<DemoCaseState>("open");

  // onboarding checklist (in-page, dismissible, remembered) + collapsible intro
  const [onb, setOnb] = useState(readOnbState);
  const [introOpen, setIntroOpen] = useState(readIntroOpen);

  // "sign a new work" modal (clearly-labelled demonstration — no backend write)
  const [showSign, setShowSign] = useState(false);

  // mobile navigation drawer (redesign 2026-07-10)
  const [menuOpen, setMenuOpen] = useState(false);

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

  const handleLocale = (next: Locale) => {
    setLocale(next);
    saveLocale(next);
  };

  const markOnbStep = (n: 1 | 2 | 3) => {
    persistOnbKey(`s${n}`);
    setOnb((prev) => {
      const steps: [boolean, boolean, boolean] = [...prev.steps];
      steps[n - 1] = true;
      return { ...prev, steps };
    });
  };

  const hideOnb = () => {
    persistOnbKey("hide");
    setOnb((prev) => ({ ...prev, hide: true }));
  };

  const toggleIntro = () => {
    setIntroOpen((prev) => {
      persistIntroOpen(!prev);
      return !prev;
    });
  };

  const go = (next: View) => {
    setMenuOpen(false);
    // "reports" is now a tab inside the merged Cases page.
    if (next === "reports") {
      setCasesTab("reports");
      setView("alerts");
    } else {
      if (next === "vault") markOnbStep(3);
      setView(next);
    }
    const main = document.getElementById("ttd-main");
    if (main) main.scrollTo(0, 0);
  };

  const openCases = (tab: CasesTab) => {
    setMenuOpen(false);
    setCasesTab(tab);
    setView("alerts");
    const main = document.getElementById("ttd-main");
    if (main) main.scrollTo(0, 0);
  };

  const showToast = (msg: string, kind: "ok" | "alert" = "ok") => {
    setToast({ msg, kind });
    window.setTimeout(() => setToast(null), 3200);
  };

  const data = loadState.status === "ready" ? loadState.data : null;

  const works = useMemo(() => (data ? buildWorks(data.demoAssets, 48) : []), [data]);
  const channels = useMemo(
    () => (data ? buildChannels(data.monitoredSources.monitored_sources, data.alerts, locale) : []),
    [data, locale],
  );
  const alerts = useMemo(() => (data ? buildAlerts(data, statusOverride) : []), [data, statusOverride]);

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
      dmca: { t: now, zh: "已在本案軌跡記錄 DMCA 下架通知", en: "Logged DMCA takedown in this case trail" },
      report: { t: now, zh: "已在本頁建立存證報告預覽", en: "Created an evidence-report preview in this page" },
      archive: { t: now, zh: "已在本案軌跡記錄證據封存", en: "Logged evidence archive in this case trail" },
      contact: { t: now, zh: "已在本案軌跡記錄聯絡通知", en: "Logged contact notice in this case trail" },
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
          typeZh: "本頁預覽存證報告",
          typeEn: "Evidence report preview",
        },
        ...prev,
      ]);
    }
    const msg: Record<typeof type, string> = {
      dmca: locale === "zh-TW" ? "已在本案軌跡記錄下架通知" : "Takedown notice logged in this case trail",
      report: locale === "zh-TW" ? "已建立本頁存證報告預覽" : "Evidence-report preview created in this page",
      archive: locale === "zh-TW" ? "已在本案軌跡記錄封存動作" : "Archive action logged in this case trail",
      contact: locale === "zh-TW" ? "已在本案軌跡記錄聯絡通知" : "Contact notice logged in this case trail",
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
  if (loadState.status === "network-error" || loadState.status === "contract-error") {
    const isContractError = loadState.status === "contract-error";
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F4E9D5] px-6">
        <div className="max-w-lg rounded-[12px] border border-[#ED5D29] bg-white p-6">
          <TriangleAlert className="mb-3 text-[#ED5D29]" size={24} />
          <h1 className="text-lg font-semibold text-[#1A1A1A]">
            {isContractError
              ? locale === "zh-TW"
                ? "資料契約驗證失敗"
                : "Data contract validation failed"
              : locale === "zh-TW"
                ? "資料載入失敗"
                : "Failed to load data"}
          </h1>
          <p className="mt-2 text-sm text-[#6b5f4f]">{loadState.message}</p>
          {isContractError ? (
            <ul className="mt-3 space-y-1 text-xs text-[#6b5f4f]">
              {loadState.errors.slice(0, 4).map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : null}
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
  const realPatrolMatches = alerts.filter((a) => !a.simulated).length;
  const lastPatrol = formatDateForLocale(loadState.data.monitoring.completed_at || loadState.data.monitoring.generated_at, locale);
  const lastRunSources = new Set(
    (loadState.data.monitoring.source_runs || []).map((run) => run.source_id || run.source_name).filter(Boolean),
  );
  const lastRunSourceCount = lastRunSources.size || Number(channelsActiveDisplay.replace(/,/g, "")) || channels.length;
  const lastRunCandidates = loadState.data.monitoring.run_scope?.candidates_attempted ?? 0;
  const lastRunAlerts = loadState.data.monitoring.run_scope?.alerts_created ?? alerts.length;
  const patrolModeLabel = (() => {
    const adapter = loadState.data.monitoring.adapter;
    if (adapter?.id?.includes("visionWebDetection") && adapter.id.includes("namedChannelCrawler") && adapter.paid_api_used) {
      return locale === "zh-TW" ? "巡檢模式：Vision + 公開通路自動巡檢" : "Mode: Vision + public-channel auto patrol";
    }
    if (adapter?.id?.includes("visionWebDetection") && adapter.id.includes("namedChannelCrawler")) {
      return locale === "zh-TW" ? "巡檢模式：Vision 試跑 + 公開通路自動巡檢" : "Mode: Vision dry run + public-channel auto patrol";
    }
    if (adapter?.id === "visionWebDetection" && adapter.paid_api_used) {
      return locale === "zh-TW" ? "巡檢模式：Vision 真實巡檢（預算控管）" : "Mode: live Vision patrol (budget guarded)";
    }
    if (adapter?.id === "visionWebDetection") {
      return locale === "zh-TW" ? "巡檢模式：Vision 試跑（不計費）" : "Mode: Vision dry run (no cost)";
    }
    if (adapter?.id === "namedChannelCrawler") {
      return locale === "zh-TW" ? "巡檢模式：公開通路自動巡檢" : "Mode: public-channel auto patrol";
    }
    if (adapter?.id === "seedUrls") {
      return locale === "zh-TW" ? "巡檢模式：真實抓取種子來源（零付費）" : "Mode: real seed-source fetch (zero cost)";
    }
    return locale === "zh-TW" ? "巡檢模式：讀取最新巡檢產物" : "Mode: latest patrol artifact";
  })();
  const patrolStatus = (() => {
    const raw = loadState.data.monitoring.status || "unknown";
    if (raw === "completed") return locale === "zh-TW" ? "已完成" : "completed";
    if (raw === "completed_with_candidate_errors") {
      return locale === "zh-TW" ? "已完成（部分候選圖無法存取）" : "completed, some candidates unreachable";
    }
    if (raw === "unknown") return locale === "zh-TW" ? "尚無巡檢紀錄" : "no patrol record yet";
    return raw.replace(/_/g, " ");
  })();

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
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="flex-none rounded-[8px] border border-[#ffffff26] p-2 text-[#CEC0A3] md:hidden"
            aria-label={locale === "zh-TW" ? "開啟選單" : "Open menu"}
          >
            <Menu size={16} />
          </button>
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

          {/* mobile nav drawer (hamburger-driven; redesign 2026-07-10) */}
          {menuOpen && (
            <div
              className="fixed inset-0 z-40 bg-[#1a1a1a73] md:hidden"
              onClick={(e) => {
                if (e.target === e.currentTarget) setMenuOpen(false);
              }}
            >
              <nav className="flex h-full w-[286px] flex-col gap-1.5 overflow-y-auto bg-[#F4E9D5] p-4 shadow-[12px_0_40px_rgba(17,17,16,0.28)]">
                <div className="flex items-center justify-between px-2 pb-2">
                  <p className="text-[9px] tracking-[0.18em] text-[#1a1a1a66]" style={{ fontFamily: MONO }}>
                    {T.menu[locale]}
                  </p>
                  <button type="button" onClick={() => setMenuOpen(false)} className="p-1.5 text-[#5c584a]" aria-label={locale === "zh-TW" ? "關閉選單" : "Close menu"}>
                    <X size={15} />
                  </button>
                </div>
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
                        <span className="flex-none rounded-full bg-[#ED5D29] px-2 py-0.5 text-[11px] font-semibold text-white" style={{ fontFamily: MONO }}>
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
                  <p className="text-[24px] font-bold leading-none" style={{ fontFamily: MONO }}>
                    {protectedDisplay}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#CEC0A3]">{T.protectedOriginals[locale]}</p>
                </div>
              </nav>
            </div>
          )}

          {view === "dashboard" && (
            <HomeView
              locale={locale}
              openCount={openCount}
              realPatrolMatches={realPatrolMatches}
              lastPatrol={lastPatrol}
              protectedDisplay={protectedDisplay}
              lastRunSourceCount={lastRunSourceCount}
              lastRunCandidates={lastRunCandidates}
              lastRunAlerts={lastRunAlerts}
              patrolModeLabel={patrolModeLabel}
              patrolStatus={patrolStatus}
              reportCount={reportCount}
              suspectedActual={suspectedActual}
              alerts={alerts}
              onb={onb}
              onHideOnb={hideOnb}
              introOpen={introOpen}
              onToggleIntro={toggleIntro}
              onOpenCases={openCases}
              onNavigate={go}
              onRunPatrol={runPatrol}
              onOpenSign={() => setShowSign(true)}
            />
          )}

          {view === "verify" && (
            <VerificationView
              locale={locale}
              verification={loadState.data.verification}
              works={works}
              onOpenCert={(id) => setCertAssetId(id)}
              onRanExample={() => markOnbStep(2)}
              onOpenSign={() => setShowSign(true)}
              showToast={showToast}
            />
          )}

          {view === "alerts" && (
            <CasesView
              locale={locale}
              tab={casesTab}
              setTab={setCasesTab}
              alerts={alerts}
              demoCase={demoCase}
              setDemoCase={setDemoCase}
              demoWork={works[0] || null}
              backendReports={reportsBackend}
              addedReports={addedReports}
              works={works}
              onOpenCase={(id) => {
                setActiveCaseId(id);
                go("case");
              }}
              onDemoReported={() => markOnbStep(1)}
              showToast={showToast}
              onExport={(id) =>
                showToast(locale === "zh-TW" ? `已預覽匯出存證報告 ${id}` : `Previewed evidence report export ${id}`, "ok")
              }
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
            <VaultView
              locale={locale}
              works={works}
              onOpenCert={(id) => setCertAssetId(id)}
              protectedDisplay={protectedDisplay}
              indexedRows={loadState.data.verification.library.indexed_rows}
              channelsTotal={channelsTotalDisplay}
              onOpenSign={() => setShowSign(true)}
              onNavigate={go}
              showToast={showToast}
            />
          )}

          {view === "channels" && (
            <ChannelsView
              locale={locale}
              channels={channels}
              monitoring={loadState.data.monitoring}
              onRunPatrol={runPatrol}
              showToast={showToast}
            />
          )}
        </div>
      </div>

      {certWork && <CertModal locale={locale} work={certWork} onClose={() => setCertAssetId(null)} />}
      {showSign && <SignModal locale={locale} onClose={() => setShowSign(false)} showToast={showToast} />}
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


/* ---------------- home view (task-oriented, redesign 2026-07-10) ---------------- */

function HomeView(props: {
  locale: Locale;
  openCount: number;
  realPatrolMatches: number;
  lastPatrol: string;
  protectedDisplay: string;
  lastRunSourceCount: number;
  lastRunCandidates: number;
  lastRunAlerts: number;
  patrolModeLabel: string;
  patrolStatus: string;
  reportCount: number;
  suspectedActual: string;
  alerts: AlertVM[];
  onb: { hide: boolean; steps: [boolean, boolean, boolean] };
  onHideOnb: () => void;
  introOpen: boolean;
  onToggleIntro: () => void;
  onOpenCases: (tab: CasesTab) => void;
  onNavigate: (v: View) => void;
  onRunPatrol: () => void;
  onOpenSign: () => void;
}) {
  const {
    locale,
    openCount,
    lastPatrol,
    lastRunSourceCount,
    lastRunCandidates,
    lastRunAlerts,
    patrolModeLabel,
    patrolStatus,
    reportCount,
    suspectedActual,
    onb,
  } = props;
  const zh = locale === "zh-TW";
  const suspectedNum = Number(suspectedActual.replace(/,/g, "")) || 0;
  const allClear = suspectedNum === 0 && openCount === 0;
  const onbDone = onb.steps.filter(Boolean).length;

  const tasks: Array<{ q: string; title: string; stat?: string; unit?: string; desc: string; goText: string; onGo: () => void }> = [
    {
      q: zh ? "TASK 01 · 用圖前" : "TASK 01 · BEFORE USING",
      title: zh ? "這張圖能不能用？" : "Can I use this image?",
      desc: zh
        ? "貼上圖片網址或用範例查驗，立即查它的來源憑證、權利人與授權脈絡，避免誤用來源不明素材。"
        : "Paste an image URL or run a sample check to see its origin certificate, rights holder, and license context before using it.",
      goText: zh ? "前往查驗" : "Go verify",
      onGo: () => props.onNavigate("verify"),
    },
    {
      q: zh ? "TASK 02 · 發布後" : "TASK 02 · AFTER PUBLISHING",
      title: zh ? "我的作品有被拿去用嗎？" : "Is my work being used?",
      stat: openCount.toString(),
      unit: zh ? "件疑似盜用" : "suspected copies",
      desc: zh
        ? "系統每天自動比對監控通路上的候選影像，發現高相似使用就會在這裡向你警報。"
        : "The system compares candidate images from monitored channels daily and alerts you on high-similarity use.",
      goText: zh ? "查看警報" : "Open alerts",
      onGo: () => props.onOpenCases("open"),
    },
    {
      q: zh ? "TASK 03 · 需要行動時" : "TASK 03 · WHEN ACTION IS NEEDED",
      title: zh ? "要提出主張怎麼辦？" : "How do I make a claim?",
      stat: reportCount.toString(),
      unit: zh ? "份存證報告" : "evidence reports",
      desc: zh
        ? "確認侵權後，產生含電子憑證與來源軌跡的存證報告，可交付法務或作為授權溝通依據。"
        : "After confirming infringement, generate an evidence report with certificates and a source trail for legal or licensing use.",
      goText: zh ? "前往存證" : "Open reports",
      onGo: () => props.onOpenCases("reports"),
    },
  ];

  const onbItems: Array<{ t: string; d: string; onGo: () => void; done: boolean }> = [
    {
      t: zh ? "走一遍示範案件" : "Walk through the demo case",
      d: zh ? "體驗「發現 → 複審 → 確認 → 存證」完整流程" : "Experience the full detect → review → confirm → certify flow",
      onGo: () => props.onOpenCases("open"),
      done: onb.steps[0],
    },
    {
      t: zh ? "查一張圖" : "Verify an image",
      d: zh ? "用範例試跑，看查驗結果長什麼樣" : "Run a sample check and see what a verdict looks like",
      onGo: () => props.onNavigate("verify"),
      done: onb.steps[1],
    },
    {
      t: zh ? "看看你的原創庫" : "Browse your vault",
      d: zh ? "了解已受保護的作品與原創憑證" : "See protected originals and their certificates",
      onGo: () => props.onNavigate("vault"),
      done: onb.steps[2],
    },
  ];

  const steps: Array<{ n: string; t: string; d: string; actionText?: string; onAction?: () => void }> = [
    {
      n: "STEP 01",
      t: zh ? "入庫簽署" : "Register",
      d: zh ? "為作品建立數位指紋與來源憑證（改圖也認得出）。" : "Fingerprint each work and sign its origin certificate — edits are still recognized.",
      actionText: zh ? "簽署新作品 →" : "Sign a new work →",
      onAction: props.onOpenSign,
    },
    { n: "STEP 02", t: zh ? "雷達巡檢" : "Patrol", d: zh ? "Vision 與公開通路每日自動尋找網路上的相似影像。" : "Vision and public channels search the web for similar images daily." },
    { n: "STEP 03", t: zh ? "警報複審" : "Review", d: zh ? "高相似候選自動警報，由你人工確認是否為真實侵權。" : "High-similarity candidates raise alerts; you confirm real infringement." },
    { n: "STEP 04", t: zh ? "存證交付" : "Certify", d: zh ? "產生上鏈存證報告，交付法務或啟動授權溝通。" : "Generate an on-chain evidence report for legal handoff or licensing." },
  ];

  return (
    <div className="max-w-[1180px] px-6 py-7 md:px-9">
      <p className="mb-2 flex items-center gap-2 text-[11px] tracking-[0.2em] text-[#1a1a1a73]" style={{ fontFamily: MONO }}>
        <span className="ttd-pulse inline-block h-[8px] w-[8px] rounded-full bg-[#7F9C7E]" />
        {zh ? "總覽 · ORIGINRADAR" : "HOME · ORIGINRADAR"}
      </p>
      <h1 className="text-[26px] font-black leading-tight sm:text-[32px]">
        {zh ? "替你的原創影像站崗" : "Standing guard over your originals"}
      </h1>
      <p className="mt-2 max-w-[640px] text-[14.5px] leading-6 text-[#5c584a]">
        {zh ? (
          <>原創雷達替每張作品建立數位指紋，持續巡檢公開網路。<b>作品被使用、轉載、改作之前</b>，你就有可追溯的來源、可檢查的授權脈絡，與可行動的報告。</>
        ) : (
          <>OriginRadar fingerprints every work and keeps patrolling the public web — so <b>before your work is used, reposted, or adapted</b>, you already have traceable origin, checkable license context, and actionable reports.</>
        )}
      </p>

      {/* one-line answer: am I safe? (real patrol data) */}
      <div
        className={`mt-6 flex flex-col gap-3 rounded-[12px] border border-[#1a1a1a14] bg-white p-5 sm:flex-row sm:items-center sm:gap-5 sm:px-7 ${
          allClear ? "border-l-[6px] border-l-[#7F9C7E]" : "border-l-[6px] border-l-[#ED5D29]"
        }`}
      >
        <span
          className={`flex h-[52px] w-[52px] flex-none items-center justify-center rounded-full ${
            allClear ? "bg-[#eef4ea] text-[#4f6a4e]" : "bg-[#fbe9e0] text-[#c4502e]"
          }`}
        >
          {allClear ? <ShieldCheck size={26} /> : <TriangleAlert size={26} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[18px] font-black sm:text-[20px]">
            {allClear
              ? zh
                ? "目前一切正常，沒有發現疑似盜用"
                : "All clear — no suspected copies found"
              : zh
              ? `有 ${openCount} 件疑似盜用等你複審`
              : `${openCount} suspected cop${openCount === 1 ? "y" : "ies"} awaiting your review`}
          </span>
          <span className="mt-0.5 block text-[13px] text-[#5c584a]">
            {zh
              ? `最近一次巡檢（${lastPatrol}）檢查了 ${lastRunCandidates} 筆網路候選影像，${lastRunAlerts === 0 ? "皆未達疑似盜用門檻" : `${lastRunAlerts} 筆達門檻並已建立警報`}。`
              : `The latest patrol (${lastPatrol}) checked ${lastRunCandidates} web candidates; ${lastRunAlerts === 0 ? "none crossed the suspected-copy threshold" : `${lastRunAlerts} crossed the threshold and raised alerts`}.`}
          </span>
        </span>
        <span className="flex-none text-left sm:text-right">
          <span className="block text-[10px] tracking-[0.15em] text-[#8d8873]" style={{ fontFamily: MONO }}>
            {zh ? "確認侵權 / 待複審" : "CONFIRMED / TO REVIEW"}
          </span>
          <span className="mt-1 block text-[14px] font-bold" style={{ fontFamily: MONO }}>
            {suspectedActual}{zh ? " 件" : ""} / {openCount}{zh ? " 件" : ""}
          </span>
        </span>
      </div>

      {/* onboarding checklist (dismissible, remembered) */}
      {!onb.hide && (
        <div className="mt-4 rounded-[12px] border border-[#1a1a1a14] bg-white px-5 py-4">
          {onbDone === 3 ? (
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="font-black text-[#4f6a4e]">✓ {zh ? "三步驟都完成了！" : "All three steps done!"}</span>
              <span className="text-[13px] text-[#5c584a]">
                {zh ? "原創雷達已經在替你站崗。" : "OriginRadar is standing guard for you."}
              </span>
              <button type="button" onClick={props.onHideOnb} className="ml-auto px-1.5 text-[#8d8873]" aria-label={zh ? "不再顯示" : "Dismiss"}>
                <X size={15} />
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2.5">
                <b className="text-[15px]">{zh ? "三步驟上手原創雷達" : "Get started in three steps"}</b>
                <span className="text-[11px] text-[#8d8873]" style={{ fontFamily: MONO }}>
                  {onbDone} / 3
                </span>
                <button type="button" onClick={props.onHideOnb} className="ml-auto px-1.5 text-[#8d8873]" aria-label={zh ? "不再顯示" : "Dismiss"}>
                  <X size={15} />
                </button>
              </div>
              {onbItems.map((it, i) => (
                <button
                  key={it.t}
                  type="button"
                  onClick={it.onGo}
                  className="group mt-2 flex w-full items-center gap-3 border-t border-[#f4ede0] pt-2.5 text-left"
                >
                  <span
                    className={`flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full border text-[12px] ${
                      it.done ? "border-[#7F9C7E] bg-[#eef4ea] text-[#4f6a4e]" : "border-[#1a1a1a26] text-[#5c584a]"
                    }`}
                    style={{ fontFamily: MONO }}
                  >
                    {it.done ? "✓" : i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className={`block text-[13.5px] ${it.done ? "text-[#8d8873] line-through" : "group-hover:text-[#4f6a4e]"}`}>{it.t}</b>
                    <span className="block text-[12px] text-[#5c584a]">{it.d}</span>
                  </span>
                  <ArrowRight size={14} className="flex-none text-[#4f6a4e]" />
                </button>
              ))}
            </>
          )}
        </div>
      )}

      {/* three tasks */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {tasks.map((t) => (
          <button
            key={t.q}
            type="button"
            onClick={t.onGo}
            className="flex h-full flex-col gap-2.5 rounded-[12px] border border-[#1a1a1a14] bg-white p-5 text-left transition-all hover:-translate-y-0.5 hover:shadow-[0_6px_22px_rgba(60,50,20,0.10)]"
          >
            <span className="text-[10px] tracking-[0.18em] text-[#8d8873]" style={{ fontFamily: MONO }}>
              {t.q}
            </span>
            <span className="text-[17px] font-black leading-snug">{t.title}</span>
            {t.stat !== undefined && (
              <span className="text-[32px] font-bold leading-none text-[#4f6a4e]" style={{ fontFamily: MONO }}>
                {t.stat} <span className="text-[13px] font-normal text-[#8d8873]">{t.unit}</span>
              </span>
            )}
            <span className="flex-1 text-[12.5px] leading-5 text-[#5c584a]">{t.desc}</span>
            <span className="flex items-center gap-1.5 text-[13px] font-bold text-[#4f6a4e]">
              {t.goText} <ArrowRight size={13} />
            </span>
          </button>
        ))}
      </div>

      {/* honesty note: demo/real boundary, kept from the pilot convention */}
      <div className="mt-4 flex items-start gap-2 rounded-[10px] border border-[#cfe0cb] bg-[#eef4ea] px-4 py-3 text-xs leading-5 text-[#3f5a3e]">
        <ShieldCheck size={15} className="mt-0.5 flex-none text-[#4f6a4e]" />
        <span>
          {zh
            ? `目前真實侵權案件：${suspectedActual} 件。警報頁的示範案件僅供體驗流程，不列入統計。`
            : `Real infringement cases so far: ${suspectedActual}. The demo case on the Cases page is for walkthrough only and is never counted.`}
        </span>
      </div>

      {/* intro: collapsible for returning users */}
      <div className="mt-7 flex items-baseline justify-between">
        <h2 className="text-[18px] font-black">
          {zh ? "認識原創雷達" : "Meet OriginRadar"}{" "}
          <span className="text-[12px] font-normal text-[#8d8873]">{zh ? "· 給第一次使用的你" : "· for first-time users"}</span>
        </h2>
        <button type="button" onClick={props.onToggleIntro} className="text-[13px] font-bold text-[#4f6a4e]">
          {props.introOpen ? (zh ? "收合 ▴" : "Collapse ▴") : (zh ? "展開 ▾" : "Expand ▾")}
        </button>
      </div>
      {props.introOpen && (
        <>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div className="flex items-start gap-3.5 rounded-[12px] border border-dashed border-[#1a1a1a1f] bg-[#f8f2e3] px-5 py-4">
              <span className="mt-0.5 flex-none rounded-[6px] bg-[#1A1A1A] px-2 py-1 text-[10px] tracking-[0.1em] text-[#e8dfab]" style={{ fontFamily: MONO }}>
                {zh ? "給媒體編輯" : "FOR EDITORS"}
              </span>
              <p className="text-[13px] leading-5 text-[#5c584a]">
                <b className="text-[#1A1A1A]">{zh ? "不踩雷。" : "No landmines."}</b>{" "}
                {zh
                  ? "發稿前先查一張圖的來源與授權脈絡，省下人工查核時間，避免誤用來源不明素材。"
                  : "Check an image's origin and license context before publishing — less manual vetting, no untraceable assets."}
              </p>
            </div>
            <div className="flex items-start gap-3.5 rounded-[12px] border border-dashed border-[#1a1a1a1f] bg-[#f8f2e3] px-5 py-4">
              <span className="mt-0.5 flex-none rounded-[6px] bg-[#1A1A1A] px-2 py-1 text-[10px] tracking-[0.1em] text-[#e8dfab]" style={{ fontFamily: MONO }}>
                {zh ? "給創作者" : "FOR CREATORS"}
              </span>
              <p className="text-[13px] leading-5 text-[#5c584a]">
                <b className="text-[#1A1A1A]">{zh ? "不被悄悄拿走價值。" : "No silent value loss."}</b>{" "}
                {zh
                  ? "作品照常曝光，但每一次被使用都留有紀錄，成為後續授權與溝通的依據。"
                  : "Your work stays public, but every use leaves a record — the basis for licensing and follow-up."}
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-[12px] border border-[#1a1a1a14] bg-white px-6 py-5">
            <div className="mb-3.5 flex items-baseline gap-3">
              <h3 className="text-[15px] font-black">{zh ? "運作方式" : "How it works"}</h3>
              <span className="text-[10px] tracking-[0.18em] text-[#8d8873]" style={{ fontFamily: MONO }}>
                HOW IT WORKS
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:gap-0">
              {steps.map((s, i) => (
                <div key={s.n} className={`xl:px-4 ${i > 0 ? "xl:border-l xl:border-[#1a1a1a12]" : "xl:pl-0"}`}>
                  <p className="text-[10px] font-bold tracking-[0.14em] text-[#4f6a4e]" style={{ fontFamily: MONO }}>
                    {s.n}
                  </p>
                  <p className="mt-1 text-[14px] font-bold">{s.t}</p>
                  <p className="mt-0.5 text-[12px] leading-5 text-[#5c584a]">
                    {s.d}
                    {s.actionText && s.onAction && (
                      <>
                        {" "}
                        <button type="button" onClick={s.onAction} className="font-bold text-[#4f6a4e] hover:underline">
                          {s.actionText}
                        </button>
                      </>
                    )}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* patrol record: proof the radar keeps running (latest real run only — history accrues) */}
      <div className="mt-7 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[18px] font-black">
          {zh ? "巡檢紀錄" : "Patrol record"}{" "}
          <span className="text-[12px] font-normal text-[#8d8873]">{zh ? "· 持續站崗中" : "· continuously on guard"}</span>
        </h2>
        <button type="button" onClick={() => props.onNavigate("channels")} className="text-[13px] font-bold text-[#4f6a4e]">
          {zh ? "查看監控通路 →" : "View channels →"}
        </button>
      </div>
      <div className="mt-3 overflow-hidden rounded-[12px] border border-[#1a1a1a14] bg-white">
        <div className="flex items-center gap-3.5 bg-[#EFE3CC] px-5 py-3 text-[10px] tracking-[0.08em] text-[#1a1a1a8c]" style={{ fontFamily: MONO }}>
          <span className="w-[190px] flex-none">{zh ? "巡檢時間" : "TIME"}</span>
          <span className="flex-1">{zh ? "來源" : "SOURCES"}</span>
          <span className="w-[120px] flex-none">{zh ? "候選影像" : "CANDIDATES"}</span>
          <span className="w-[76px] flex-none">{zh ? "形成警報" : "ALERTS"}</span>
          <span className="w-[190px] flex-none">{zh ? "狀態" : "STATUS"}</span>
        </div>
        <div className="flex flex-wrap items-center gap-3.5 border-t border-[#1a1a1a0f] px-5 py-3.5 text-[13px]">
          <span className="w-[190px] flex-none font-bold" style={{ fontFamily: MONO }}>
            {lastPatrol}{" "}
            <span className="text-[10px] font-normal text-[#4f6a4e]">{zh ? "最新" : "latest"}</span>
          </span>
          <span className="min-w-[140px] flex-1">{patrolModeLabel.replace(/^(巡檢模式：|Mode: )/, "")}</span>
          <span className="w-[120px] flex-none" style={{ fontFamily: MONO }}>
            {lastRunCandidates}{zh ? " 筆" : ""}{" "}
            <span className="text-[11px] text-[#8d8873]">{zh ? `· ${lastRunSourceCount} 個來源` : `· ${lastRunSourceCount} sources`}</span>
          </span>
          <span className="w-[76px] flex-none font-bold text-[#4f6a4e]" style={{ fontFamily: MONO }}>
            {lastRunAlerts}{zh ? " 件" : ""}
          </span>
          <span className="w-[190px] flex-none">
            <span className="rounded-full bg-[#eef4ea] px-2.5 py-1 text-[11px] font-semibold text-[#4f6a4e]">{patrolStatus}</span>
          </span>
        </div>
        <p className="border-t border-[#1a1a1a0f] bg-[#f8f2e3] px-5 py-2.5 text-[12px] text-[#5c584a]">
          {zh
            ? "本頁顯示最新一次巡檢的真實產物；歷史紀錄會隨每日巡檢持續累積。"
            : "This shows the latest real patrol artifact; history accrues with each daily run."}
        </p>
      </div>
      <div className="mt-3.5 flex items-start gap-2.5 rounded-[10px] border border-[#1a1a1a14] bg-[#f8f2e3] px-4 py-3 text-[13px] leading-5 text-[#5c584a]">
        <span aria-hidden>⏱</span>
        <span>
          <b className="text-[#1A1A1A]">{zh ? "下次自動巡檢：每日 11:17（台北時間）" : "Next automatic patrol: daily at 11:17 (Taipei time)"}</b>
          {zh ? "，由 GitHub Actions 排程執行；發現疑似盜用會直接列進警報頁待你複審。" : ", scheduled via GitHub Actions. Suspected copies are queued on the Cases page for your review."}
        </span>
      </div>
    </div>
  );
}

function chDot(status: ChannelVM["status"]) {
  return status === "automated" ? C.green : status === "search" ? C.blue : status === "queued" ? C.orange : C.stone;
}
function chLabel(status: ChannelVM["status"], locale: Locale) {
  const zh = { automated: "自動巡檢", manual: "人工複核", search: "查詢線索", queued: "待授權" };
  const en = { automated: "Auto patrol", manual: "Manual review", search: "Query lead", queued: "Needs auth" };
  return (locale === "zh-TW" ? zh : en)[status];
}
function chNote(status: ChannelVM["status"], locale: Locale) {
  const zh = {
    automated: "已接上公開頁面巡檢；系統會抓取候選圖片並送入本地指紋比對。",
    manual: "尚未接直接爬蟲，作為人工複核與後續導入來源。",
    search: "僅提供查詢入口或人工複核線索，目前不會自動爬取此平台。",
    queued: "需要平台授權、API 或合規確認後才能自動化。",
  };
  const en = {
    automated: "Connected to public-page patrol; image candidates are fetched and sent through local fingerprint comparison.",
    manual: "Not connected to a direct crawler yet; used for manual review and future integration.",
    search: "Query entry or manual-review lead only; this platform is not auto-crawled yet.",
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
      ? `距離 ${match.combined_distance}，低於門檻 ${threshold}，系統判定與已收錄原作相符。數字越低代表越像。`
      : `距離 ${match.combined_distance}，高於門檻 ${threshold}，目前未找到對應原作。數字越低代表越像。`;
  }
  return passed
    ? `Distance ${match.combined_distance}, below the ${threshold} threshold, so the system treats it as a match. Lower means more similar.`
    : `Distance ${match.combined_distance}, above the ${threshold} threshold, so the system does not treat it as a match. Lower means more similar.`;
}

function verificationVerdictText(verdict: VerificationQuery["verdict"], locale: Locale) {
  if (locale !== "zh-TW") return verdict.en;
  if (verdict.code === "registered_original") return "與已收錄原作相符";
  if (verdict.code === "registered_derivative") return "疑似同一原作，需複核";
  if (verdict.code === "not_registered") return "未找到對應原作";
  return verdict.zh;
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
  onRanExample,
  onOpenSign,
  showToast,
}: {
  locale: Locale;
  verification: VerificationDocument;
  works: WorkVM[];
  onOpenCert: (id: string) => void;
  onRanExample?: () => void;
  onOpenSign: () => void;
  showToast: (msg: string, kind?: "ok" | "alert") => void;
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
    onRanExample?.();
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

  const copySummary = () => {
    const verdictText = verificationVerdictText(activeQuery.verdict, locale);
    const lines = zh
      ? [
          "【原創雷達 查驗摘要】",
          `判定：${verdictText}`,
          `最接近的已收錄原作：${topMatch?.display_title || "未找到對應原作"}`,
          `判定距離：${topMatch ? `${topMatch.combined_distance}（門檻 ${verification.library.threshold}，越低越像）` : "未進行比對"}`,
          `相似程度：${topMatch ? `${Math.round(topMatch.similarity_score * 10000) / 100}%` : "無"}`,
          `本機視覺指紋：${shortFp(activeQuery.query_fingerprint.fingerprint_value)}`,
          `驗證連結：${topMatch?.certificate_link && activeQuery.result.pass_threshold ? topMatch.certificate_link : "（未找到對應原創憑證）"}`,
          "（本摘要僅供來源查驗；實際主張仍需原創憑證與人工複核）",
        ]
      : [
          "[OriginRadar verification summary]",
          `Verdict: ${verdictText}`,
          `Closest indexed original: ${topMatch?.display_title || "no match"}`,
          `Decision distance: ${topMatch ? `${topMatch.combined_distance} (threshold ${verification.library.threshold}, lower = more similar)` : "not compared"}`,
          `Similarity: ${topMatch ? `${Math.round(topMatch.similarity_score * 10000) / 100}%` : "n/a"}`,
          `Local fingerprint: ${shortFp(activeQuery.query_fingerprint.fingerprint_value)}`,
          `Verification link: ${topMatch?.certificate_link && activeQuery.result.pass_threshold ? topMatch.certificate_link : "(no matching origin certificate)"}`,
          "(Origin-check summary only; claims still require the origin certificate and human review)",
        ];
    const text = lines.join("\n");
    const done = () => showToast(zh ? "已複製查驗摘要，可貼進訊息或稿件備註" : "Summary copied — paste it into a message or draft note");
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(done)
        .catch(() => showToast(zh ? "此環境無法自動複製，請手動選取" : "Clipboard unavailable here — please copy manually", "alert"));
    } else {
      showToast(zh ? "此環境無法自動複製，請手動選取" : "Clipboard unavailable here — please copy manually", "alert");
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
          label={zh ? "相似判定門檻" : "Match line"}
          sub={zh ? "低於此數字，視為同一原作" : "lower than this means match"}
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
          {/* paste-first (redesign 2026-07-10); still honestly scoped to indexed samples */}
          <p className="mb-2 text-[11px] font-semibold tracking-[0.12em] text-[#1a1a1a8c]" style={{ fontFamily: MONO }}>
            {zh ? "貼上圖片網址或資產 ID" : "PASTE AN IMAGE URL OR ASSET ID"}
          </p>
          <form onSubmit={submitVerification} className="flex gap-2">
            <input
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              placeholder={zh ? "https://… 或 asset:bafybei…" : "https://… or asset:bafybei…"}
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
            <div className="mt-3 rounded-[9px] border border-[#e0d3ad] bg-[#FBF6EC] px-3.5 py-2.5 text-[12px] leading-5 text-[#80621c]">
              {zh
                ? "這張圖還查不到：它尚未建立指紋索引，所以不會產生判定，也不會建立警報。查不到不代表沒有問題。"
                : "This image can't be checked yet: it has no fingerprint index, so no verdict and no alert is produced. Not found does not mean no issue."}
              <span className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={onOpenSign}
                  className="rounded-[8px] bg-[#4c6b3c] px-3 py-1.5 text-[11px] font-semibold text-white"
                >
                  {zh ? "這是我的作品，簽署保護" : "This is my work — sign & protect"}
                </button>
                <button
                  type="button"
                  onClick={() => showToast(zh ? "已記下！正式版開放任意圖片查驗時會通知你（示範）" : "Noted! We'll let you know when arbitrary-image checks open (demo)")}
                  className="rounded-[8px] border border-[#1a1a1a33] px-3 py-1.5 text-[11px] font-semibold text-[#1A1A1A]"
                >
                  {zh ? "正式版開放時通知我" : "Notify me at launch"}
                </button>
              </span>
            </div>
          ) : (
            <p className="mt-2.5 flex items-start gap-1.5 text-[11px] leading-4 text-[#1a1a1a80]">
              <Info size={13} className="mt-px flex-none" />
              {zh
                ? "目前 MVP 只查已建立指紋的樣本；查不到不會產生判定或警報。正式版將支援任意圖片即時查驗。"
                : "The MVP only checks indexed samples; unsupported inputs produce no verdict or alert. Arbitrary-image checks arrive in the full version."}
            </p>
          )}

          {/* examples: the fastest way to see a real verdict */}
          <p className="mb-2 mt-5 text-[11px] font-semibold tracking-[0.12em] text-[#1a1a1a8c]" style={{ fontFamily: MONO }}>
            {zh ? "或先用範例試跑" : "OR TRY A SAMPLE FIRST"}
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
        </section>

        <section className="rounded-[14px] border border-[#1a1a1a12] bg-white p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[12px] text-[#1a1a1a80]" style={{ fontFamily: MONO }}>
                {zh ? "查驗結果" : "Verification result"}
              </p>
              <h2 className="mt-1 text-[24px] font-semibold leading-tight" style={{ fontFamily: MONO }}>
                {verificationVerdictText(activeQuery.verdict, locale)}
              </h2>
              <p className="mt-2 max-w-[520px] text-[12px] leading-5 text-[#1a1a1a80]">
                {topMatch
                  ? distanceHelpText(topMatch, verification.library.threshold, locale)
                  : zh
                  ? "目前原創庫沒有找到足以判定為同一原作的作品。"
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
                  value={topMatch?.display_title || (zh ? "未找到對應原作" : "No match")}
                />
                <CaseField
                  label={zh ? "判定距離" : "Decision distance"}
                  value={
                    topMatch
                      ? topMatch.combined_distance <= verification.library.threshold
                        ? zh
                          ? "低於門檻，判定為同一原作"
                          : "Below threshold, match"
                        : zh
                        ? "高於門檻，未找到對應原作"
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
                        ? "未找到對應原作"
                        : "No origin match"
                      : zh
                      ? "僅供來源查驗"
                      : "Origin verification only"
                  }
                />
              </div>
              {activeQuery.result.pass_threshold && topMatch ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      showToast(zh ? "示範原型：正式版將在此開啟授權申請，並通知權利人" : "Demo prototype: production opens the licensing request here and notifies the rights holder")
                    }
                    className="rounded-[9px] bg-[#4c6b3c] px-3.5 py-2 text-[12px] font-semibold text-white"
                  >
                    {zh ? "申請授權 / 聯繫權利人" : "Request license / contact holder"}
                  </button>
                  {matchWork && (
                    <button
                      type="button"
                      onClick={() => onOpenCert(topMatch.asset_id)}
                      className="rounded-[9px] bg-[#7F9C7E] px-3.5 py-2 text-[12px] font-semibold text-[#1A1A1A]"
                    >
                      {zh ? "檢視原創憑證" : "View certificate"}
                    </button>
                  )}
                  {topMatch.certificate_link && (
                    <a
                      href={topMatch.certificate_link}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 rounded-[9px] border border-[#1a1a1a26] px-3.5 py-2 text-[12px] font-semibold"
                    >
                      <ExternalLink size={14} /> {zh ? "開啟公開驗證頁" : "Open public verification"}
                    </a>
                  )}
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={onOpenSign}
                    className="rounded-[9px] bg-[#4c6b3c] px-3.5 py-2 text-[12px] font-semibold text-white"
                  >
                    {zh ? "這是我的作品，簽署保護" : "This is my work — sign & protect"}
                  </button>
                  <button
                    type="button"
                    onClick={() => showToast(zh ? "已記下！正式版開放任意圖片查驗時會通知你（示範）" : "Noted! We'll let you know when arbitrary-image checks open (demo)")}
                    className="rounded-[9px] border border-[#1a1a1a26] px-3.5 py-2 text-[12px] font-semibold"
                  >
                    {zh ? "正式版開放時通知我" : "Notify me at launch"}
                  </button>
                </div>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={copySummary}
                  className="flex items-center gap-1.5 rounded-[9px] border border-[#1a1a1a26] px-3 py-1.5 text-[11.5px] font-semibold"
                >
                  <FileText size={12} /> {zh ? "複製查驗摘要" : "Copy summary"}
                </button>
                <span className="text-[11px] text-[#1a1a1a73]">
                  {zh ? "純文字摘要，可貼進訊息或稿件備註" : "Plain-text summary for messages or draft notes"}
                </span>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="rounded-[14px] border border-[#1a1a1a12] bg-white">
        <div className="border-b border-[#1a1a1a0f] px-5 py-4">
          <h3 className="text-[15px] font-semibold">{zh ? "系統比對結果" : "Candidate originals compared by the system"}</h3>
          <p className="mt-1 max-w-[880px] text-[12px] leading-5 text-[#1a1a1a80]">
            {zh
              ? `系統會把輸入圖和已收錄原創逐一比對。判定距離越低越像；低於 ${verification.library.threshold} 代表可能是同一原作。相似程度是輔助閱讀，實際主張仍要看原創憑證與人工複核。`
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
                  {isPass ? (zh ? "同一原作" : "Match") : zh ? "未找到對應原作" : "No match"}
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

/* ---------------- cases view (alerts + evidence reports, merged; redesign 2026-07-10) ---------------- */

function CasesView(props: {
  locale: Locale;
  tab: CasesTab;
  setTab: (t: CasesTab) => void;
  alerts: AlertVM[];
  demoCase: DemoCaseState;
  setDemoCase: (s: DemoCaseState) => void;
  demoWork: WorkVM | null;
  backendReports: EvidenceReportDocument["reports"];
  addedReports: Array<{ id: string; work: string; caseId: string; typeZh: string; typeEn: string }>;
  works: WorkVM[];
  onOpenCase: (id: string) => void;
  onDemoReported: () => void;
  showToast: (msg: string, kind?: "ok" | "alert") => void;
  onExport: (id: string) => void;
}) {
  const { locale, tab, setTab, alerts, demoCase, setDemoCase, demoWork } = props;
  const zh = locale === "zh-TW";
  const [demoModal, setDemoModal] = useState<"case" | "report" | null>(null);

  const openAlerts = alerts.filter((a) => a.status === "new" || a.status === "reviewing");
  const confirmedAlerts = alerts.filter((a) => a.status === "action" || a.status === "resolved" || a.status === "dismissed");
  const reportType = (label?: string) => {
    if (label === "simulated") return zh ? "展示報告" : "Preview report";
    if (label === "actual_pending_review") return zh ? "真實巡檢存證（待複審）" : "Real patrol evidence (pending review)";
    return zh ? "內部存證報告" : "Internal evidence report";
  };
  const primaryWork = alerts[0]?.work ? `${alerts[0].work} ${alerts[0].workEn}`.trim() : props.works[0]?.name || "—";
  const reportRows = [
    ...props.addedReports.map((r) => ({ id: r.id, work: r.work, caseId: r.caseId, type: zh ? r.typeZh : r.typeEn })),
    ...props.backendReports.map((r) => ({
      id: r.report_id.replace("REPORT-", "R-").slice(0, 12),
      work: r.sections?.protected_original?.title || primaryWork,
      caseId: r.case_id || r.alert_id || alerts[0]?.id || "—",
      type: reportType(r.sections?.public_use_label?.label),
    })),
  ];

  const tabs: Array<{ key: CasesTab; label: string; n: number }> = [
    { key: "open", label: zh ? "待複審" : "To review", n: openAlerts.length },
    { key: "confirmed", label: zh ? "已確認侵權" : "Confirmed", n: confirmedAlerts.length },
    { key: "reports", label: zh ? "存證報告" : "Reports", n: reportRows.length },
  ];

  // demo walkthrough row placement per tab (never counted in the tab numbers above)
  const demoRowKey: "open" | "confirmed" | "reported" | "report" | null =
    tab === "open" && demoCase === "open"
      ? "open"
      : tab === "confirmed" && demoCase === "confirmed"
      ? "confirmed"
      : tab === "confirmed" && demoCase === "reported"
      ? "reported"
      : tab === "reports" && demoCase === "reported"
      ? "report"
      : null;

  const realRows = tab === "open" ? openAlerts : tab === "confirmed" ? confirmedAlerts : [];
  const tabEmpty = tab === "reports" ? reportRows.length === 0 && !demoRowKey : realRows.length === 0 && !demoRowKey;

  const emptyCopy =
    tab === "open"
      ? {
          icon: "✓",
          b: zh ? "目前沒有待複審的警報 —— 這是好事。" : "No alerts to review — that's good news.",
          d: zh ? "代表監控通路上尚未發現你的原創被盜用。" : "No copies of your originals have surfaced on monitored channels.",
        }
      : tab === "confirmed"
      ? {
          icon: "✓",
          b: zh ? "尚無確認侵權的案件。" : "No confirmed infringement yet.",
          d: zh ? "待複審警報經你確認後，會列在這裡並可產生存證報告。" : "Alerts you confirm land here, ready for evidence reports.",
        }
      : {
          icon: "📄",
          b: zh ? "尚無存證報告。" : "No evidence reports yet.",
          d: zh
            ? "在已確認侵權的案件中點「產生存證報告」，即可建立含電子憑證與來源軌跡的報告。"
            : "Open a confirmed case and click “Generate report” to create one with certificates and a source trail.",
        };

  const demoStateLabel = demoCase === "open" ? (zh ? "待複審" : "To review") : demoCase === "confirmed" ? (zh ? "已確認侵權" : "Confirmed") : zh ? "已完成存證" : "Certified";

  const confirmDemo = () => {
    setDemoCase("confirmed");
    setDemoModal(null);
    setTab("confirmed");
    props.showToast(
      zh ? "DEMO：已確認侵權，案件移至「已確認侵權」—— 下一步：產生存證報告" : "DEMO: confirmed — case moved to Confirmed. Next: generate the evidence report",
    );
  };
  const reportDemo = () => {
    setDemoCase("reported");
    setDemoModal(null);
    setTab("reports");
    props.onDemoReported();
    props.showToast(zh ? "DEMO：存證報告 RPT-DEMO-001 已產生，點擊該列可預覽" : "DEMO: evidence report RPT-DEMO-001 generated — click the row to preview");
  };
  const resetDemo = () => {
    setDemoCase("open");
    setTab("open");
    setDemoModal(null);
    props.showToast(zh ? "DEMO 已重設回「待複審」" : "DEMO reset to “To review”");
  };

  const demoNote =
    demoRowKey === "open"
      ? zh
        ? "☝ 這是一件示範案件（DEMO），不列入統計 —— 你可以實際走完「複審 → 確認侵權 → 產生存證報告」整條流程。點擊該列開始。"
        : "☝ This is a DEMO case (never counted). Walk the full review → confirm → certify flow — click the row to start."
      : demoRowKey === "confirmed"
      ? zh
        ? "☝ DEMO：已確認侵權。點擊該列即可產生存證報告，完成最後一步。"
        : "☝ DEMO: infringement confirmed. Click the row to generate the evidence report and finish."
      : demoRowKey === "reported"
      ? zh
        ? "☝ DEMO：此案件已完成存證。切到「存證報告」分頁可預覽報告內容。"
        : "☝ DEMO: this case is certified. Switch to the Reports tab to preview the report."
      : demoRowKey === "report"
      ? zh
        ? "☝ DEMO：點擊該列可預覽報告內容 —— 正式版可下載 PDF 並交付法務。"
        : "☝ DEMO: click the row to preview the report — the production version exports a legal-ready PDF."
      : "";

  return (
    <div className="max-w-[1240px] px-6 py-7 md:px-9">
      <PageHead
        dot={C.orange}
        eyebrow={zh ? "警報與存證 · CASES" : "Cases & evidence"}
        title={zh ? "疑似盜用警報與存證報告" : "Alerts & evidence reports"}
        desc={
          zh
            ? "巡檢發現的高相似使用會進到這裡：先由你複審確認，確認侵權後即可產生存證報告交付法務，或作為授權溝通的依據。"
            : "High-similarity uses land here: review and confirm them, then generate evidence reports for legal handoff or licensing talks."
        }
        hint={
          zh
            ? "怎麼看：三個分頁對應處理階段（待複審 → 已確認侵權 → 存證報告）。標「DEMO」的示範案件僅供體驗流程，不列入統計。"
            : "How to read: the three tabs follow the workflow (review → confirmed → reports). Rows tagged DEMO are walkthrough-only and never counted."
        }
      />

      <div className="mb-3.5 flex flex-wrap gap-2.5">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-full border px-4 py-2 text-[13px] font-semibold ${
              tab === t.key ? "border-[#1A1A1A] bg-[#1A1A1A] text-[#F4E9D5]" : "border-[#1a1a1a33] text-[#1A1A1A]"
            }`}
          >
            {t.label} <span className="opacity-55" style={{ fontFamily: MONO }}>{t.n}</span>
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-[14px] border border-[#1a1a1a12] bg-white">
        <div
          className="flex items-center gap-3.5 bg-[#EFE3CC] px-5 py-3 text-[10px] tracking-[0.08em] text-[#1a1a1a8c]"
          style={{ fontFamily: MONO }}
        >
          {tab === "reports" ? (
            <>
              <span className="w-[110px] flex-none">{zh ? "報告編號" : "REPORT"}</span>
              <span className="flex-1">{zh ? "報告內容" : "CONTENTS"}</span>
              <span className="w-[88px] flex-none">{zh ? "狀態" : "STATUS"}</span>
            </>
          ) : (
            <>
              <span className="w-[60px] flex-none">{zh ? "證據" : "EVIDENCE"}</span>
              <span className="flex-1">{zh ? "原創影像 / 發現位置" : "ORIGINAL / FOUND AT"}</span>
              <span className="w-[120px] flex-none">{zh ? "相似度" : "MATCH"}</span>
              <span className="w-[110px] flex-none">{zh ? "狀態" : "STATUS"}</span>
            </>
          )}
        </div>

        {/* real rows */}
        {tab !== "reports" &&
          realRows.map((a) => (
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
                <span className="text-[15px] font-bold" style={{ fontFamily: MONO, color: simColor(a.sim) }}>
                  {a.sim}%
                </span>
                <span className="mt-1.5 block h-[5px] overflow-hidden rounded-full bg-[#1a1a1a14]">
                  <span className="block h-full rounded-full" style={{ width: `${a.sim}%`, background: simColor(a.sim) }} />
                </span>
              </span>
              <span className="w-[110px] flex-none">
                <StatusPill status={a.status} locale={locale} />
              </span>
            </button>
          ))}

        {/* real report rows */}
        {tab === "reports" &&
          reportRows.map((r) => (
            <div key={r.id} className="flex items-center gap-3.5 border-t border-[#1a1a1a0f] px-5 py-4">
              <span className="w-[110px] flex-none text-[13px] font-bold" style={{ fontFamily: MONO }}>
                {r.id}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold">{r.work}</span>
                <span className="block truncate text-[11px] text-[#1a1a1a80]" style={{ fontFamily: MONO }}>
                  {r.caseId} · {r.type}
                </span>
              </span>
              <span className="w-[88px] flex-none">
                <button
                  type="button"
                  onClick={() => props.onExport(r.id)}
                  className="flex items-center gap-1 rounded-[7px] border border-[#1a1a1a33] px-2.5 py-1.5 text-[11px] font-semibold"
                >
                  <Download size={12} /> {zh ? "預覽匯出" : "Preview"}
                </button>
              </span>
            </div>
          ))}

        {/* demo walkthrough row */}
        {demoRowKey && demoRowKey !== "report" && (
          <button
            type="button"
            onClick={() => setDemoModal("case")}
            className="flex w-full items-center gap-3.5 border-t border-[#1a1a1a0f] px-5 py-3.5 text-left transition-colors hover:bg-[#FBF6EC]"
          >
            <Thumb src={demoWork?.thumb} grad={demoWork?.grad || "linear-gradient(135deg,#7fa06b,#33492e)"} sepia className="h-[42px] w-[42px] flex-none rounded-[6px]" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate text-[14px] font-semibold">
                  {demoWork?.name || "1.jpg"} → Yahoo News Taiwan {zh ? "文章頁" : "article page"}
                </span>
                <DemoTag locale={locale} />
              </span>
              <span className="block truncate text-[11.5px] text-[#1a1a1a8c]" style={{ fontFamily: MONO }}>
                {zh
                  ? demoRowKey === "open"
                    ? "發現於 2026/7/8 · 自動巡檢"
                    : demoRowKey === "confirmed"
                    ? "2026/7/8 發現 · 已人工複審確認"
                    : "2026/7/8 發現 · 已確認 · 已產生存證報告"
                  : demoRowKey === "open"
                  ? "Found 2026/7/8 · auto patrol"
                  : demoRowKey === "confirmed"
                  ? "Found 2026/7/8 · confirmed by human review"
                  : "Found 2026/7/8 · confirmed · report generated"}
              </span>
            </span>
            <span className="w-[120px] flex-none">
              <span className="text-[15px] font-bold" style={{ fontFamily: MONO, color: simColor(98) }}>
                98%
              </span>
              <span className="block text-[10px] text-[#1a1a1a66]" style={{ fontFamily: MONO }}>
                {zh ? "距離 3 · 門檻 16" : "distance 3 · threshold 16"}
              </span>
            </span>
            <span className="w-[110px] flex-none text-[11px] font-semibold">
              <span
                className={`rounded-full px-2.5 py-1 ${
                  demoRowKey === "open" ? "bg-[#fbe9e0] text-[#c4502e]" : demoRowKey === "confirmed" ? "bg-[#fbe9e0] text-[#c4502e]" : "bg-[#eef4ea] text-[#4f6a4e]"
                }`}
              >
                {demoStateLabel}
              </span>
            </span>
          </button>
        )}
        {demoRowKey === "report" && (
          <button
            type="button"
            onClick={() => setDemoModal("report")}
            className="flex w-full items-center gap-3.5 border-t border-[#1a1a1a0f] px-5 py-4 text-left transition-colors hover:bg-[#FBF6EC]"
          >
            <span className="w-[110px] flex-none text-[13px] font-bold" style={{ fontFamily: MONO }}>
              RPT-DEMO-001
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate text-[13.5px] font-semibold">
                  {zh ? "侵權存證報告：" : "Evidence report: "}
                  {demoWork?.name || "1.jpg"} × Yahoo News Taiwan
                </span>
                <DemoTag locale={locale} />
              </span>
              <span className="block truncate text-[11px] text-[#1a1a1a80]" style={{ fontFamily: MONO }}>
                {zh ? "含電子憑證、相似度比對、來源軌跡、複審紀錄" : "certificates · similarity comparison · source trail · review record"}
              </span>
            </span>
            <span className="w-[88px] flex-none">
              <span className="rounded-full bg-[#eef4ea] px-2.5 py-1 text-[11px] font-semibold text-[#4f6a4e]">{zh ? "可預覽" : "Preview"}</span>
            </span>
          </button>
        )}

        {/* demo note */}
        {demoRowKey && (
          <p className="border-t border-[#1a1a1a0f] bg-[#f8f2e3] px-5 py-3 text-[12.5px] leading-5 text-[#5c584a]">
            {demoNote}
            {demoCase !== "open" && (
              <button type="button" onClick={resetDemo} className="ml-2 font-bold text-[#4f6a4e]">
                {zh ? "重設示範 →" : "Reset demo →"}
              </button>
            )}
          </p>
        )}

        {/* empty state */}
        {tabEmpty && (
          <div className="border-t border-[#1a1a1a0f] px-6 py-12 text-center text-[#8d8873]">
            <p className="text-[32px]">{emptyCopy.icon}</p>
            <p className="mt-1 text-[14px] font-bold text-[#5c584a]">{emptyCopy.b}</p>
            <p className="mt-1 text-[13px]">{emptyCopy.d}</p>
            <p className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[11px]" style={{ fontFamily: MONO }}>
              {(zh
                ? ["巡檢發現高相似", "你複審確認", "確認侵權", "產生存證報告"]
                : ["patrol finds a match", "you review it", "confirm infringement", "generate the report"]
              ).map((s, i, arr) => (
                <span key={s} className="flex items-center gap-2">
                  <span className="rounded-full border border-[#1a1a1a1f] bg-[#f8f2e3] px-3 py-1 text-[#5c584a]">{s}</span>
                  {i < arr.length - 1 && <span aria-hidden>→</span>}
                </span>
              ))}
            </p>
          </div>
        )}
      </div>

      <div className="mt-5 flex items-start gap-2.5 rounded-[10px] border border-[#1a1a1a14] bg-[#f8f2e3] px-4 py-3 text-[13px] leading-5 text-[#5c584a]">
        <FileText size={15} className="mt-0.5 flex-none" />
        <span>
          <b className="text-[#1A1A1A]">{zh ? "存證報告內容：" : "Report contents: "}</b>
          {zh
            ? "每份皆含電子憑證、相似度比對、來源軌跡與人工複審狀態，上鏈可驗證，可直接交付法務。"
            : "each report bundles certificates, the similarity comparison, the source trail, and the review state — on-chain verifiable and legal-ready."}
        </span>
      </div>
      <div className="mt-2.5 flex items-start gap-2.5 rounded-[10px] border border-[#1a1a1a14] bg-[#f8f2e3] px-4 py-3 text-[13px] leading-5 text-[#5c584a]">
        <Bell size={15} className="mt-0.5 flex-none" />
        <span>
          {zh ? "發現新警報時的通知管道（Email / LINE）為正式版功能。" : "Alert notifications (Email / LINE) are a production-version feature."}
          <button
            type="button"
            onClick={() => props.showToast(zh ? "示範原型：正式版將在此設定 Email / LINE 通知管道" : "Demo prototype: notification channels will be configured here in production")}
            className="ml-2 font-bold text-[#4f6a4e]"
          >
            {zh ? "設定通知 →" : "Set up →"}
          </button>
        </span>
      </div>

      {/* demo case modal */}
      {demoModal === "case" && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#1a1a1a80] p-5"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDemoModal(null);
          }}
        >
          <div className="relative my-8 w-full max-w-[640px] rounded-[14px] border border-[#1a1a1a1f] bg-[#F4E9D5] p-7 shadow-[0_20px_60px_rgba(17,17,16,0.35)]" role="dialog" aria-modal="true">
            <button type="button" onClick={() => setDemoModal(null)} className="absolute right-3.5 top-3.5 p-1.5 text-[#5c584a]" aria-label={zh ? "關閉" : "Close"}>
              <X size={16} />
            </button>
            <p className="text-[10px] tracking-[0.18em] text-[#c4502e]" style={{ fontFamily: MONO }}>
              {zh ? `示範案件 · DEMO · ${demoStateLabel}` : `DEMO CASE · ${demoStateLabel.toUpperCase()}`}
            </p>
            <h3 className="mt-1.5 text-[20px] font-black">
              {zh ? "Yahoo News Taiwan 發現高相似使用" : "High-similarity use found on Yahoo News Taiwan"}
            </h3>
            <p className="mt-1 text-[13px] text-[#5c584a]">
              {zh
                ? "2026/7/8 自動巡檢發現 · 相似度 98%（距離 3，低於門檻 16）· 高風險通路"
                : "Found by auto patrol on 2026/7/8 · 98% similarity (distance 3, below threshold 16) · high-risk channel"}
            </p>
            <div className="mt-4 grid gap-3.5 sm:grid-cols-2">
              <div>
                <p className="mb-1.5 text-[10px] tracking-[0.14em] text-[#8d8873]" style={{ fontFamily: MONO }}>
                  {zh ? `你的原作 · ${demoWork?.name || "1.jpg"}` : `YOUR ORIGINAL · ${demoWork?.name || "1.jpg"}`}
                </p>
                <Thumb src={demoWork?.thumb} grad={demoWork?.grad || "linear-gradient(135deg,#7fa06b,#33492e)"} className="h-[150px] w-full rounded-[10px]" />
              </div>
              <div>
                <p className="mb-1.5 text-[10px] tracking-[0.14em] text-[#8d8873]" style={{ fontFamily: MONO }}>
                  {zh ? "發現位置 · tw.news.yahoo.com/…" : "FOUND AT · tw.news.yahoo.com/…"}
                </p>
                <Thumb src={demoWork?.thumb} grad={demoWork?.grad || "linear-gradient(135deg,#7fa06b,#33492e)"} sepia className="h-[150px] w-full rounded-[10px]" />
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-[10px] tracking-[0.14em] text-[#8d8873]" style={{ fontFamily: MONO }}>
                  {zh ? "發現通路" : "CHANNEL"}
                </p>
                <p className="mt-0.5 text-[14px] font-bold">
                  Yahoo News Taiwan <span className="block text-[12px] font-normal text-[#5c584a]">{zh ? "新聞匯流 · 自動巡檢" : "news aggregator · auto patrol"}</span>
                </p>
              </div>
              <div>
                <p className="text-[10px] tracking-[0.14em] text-[#8d8873]" style={{ fontFamily: MONO }}>
                  {zh ? "複審重點" : "REVIEW FOCUS"}
                </p>
                <p className="mt-0.5 text-[14px] font-bold">
                  {zh ? "來源脈絡與授權" : "Source context & license"}
                  <span className="block text-[12px] font-normal text-[#5c584a]">
                    {zh ? "確認對方是否取得授權或屬合理使用" : "check whether the use is licensed or fair use"}
                  </span>
                </p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2.5">
              {demoCase === "open" ? (
                <>
                  <button type="button" onClick={confirmDemo} className="rounded-[9px] bg-[#4c6b3c] px-5 py-2.5 text-[13px] font-bold text-white">
                    {zh ? "確認侵權" : "Confirm infringement"}
                  </button>
                  <button
                    type="button"
                    onClick={() => props.showToast(zh ? "DEMO：正式版將標記誤判並優化比對" : "DEMO: production will mark false positives to tune matching")}
                    className="rounded-[9px] border border-[#1a1a1a33] px-4 py-2.5 text-[13px] font-bold"
                  >
                    {zh ? "標記誤判" : "Mark false positive"}
                  </button>
                </>
              ) : demoCase === "confirmed" ? (
                <>
                  <button type="button" onClick={reportDemo} className="rounded-[9px] bg-[#4c6b3c] px-5 py-2.5 text-[13px] font-bold text-white">
                    {zh ? "產生存證報告" : "Generate evidence report"}
                  </button>
                  <button type="button" onClick={resetDemo} className="rounded-[9px] border border-[#1a1a1a33] px-4 py-2.5 text-[13px] font-bold">
                    {zh ? "重設示範" : "Reset demo"}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setDemoModal(null);
                      setTab("reports");
                    }}
                    className="rounded-[9px] bg-[#4c6b3c] px-5 py-2.5 text-[13px] font-bold text-white"
                  >
                    {zh ? "前往存證報告" : "Open reports"}
                  </button>
                  <button type="button" onClick={resetDemo} className="rounded-[9px] border border-[#1a1a1a33] px-4 py-2.5 text-[13px] font-bold">
                    {zh ? "重設示範" : "Reset demo"}
                  </button>
                </>
              )}
            </div>
            <p className="mt-3.5 text-[12px] text-[#8d8873]">
              {zh
                ? "此為示範案件，僅供體驗流程，不列入統計、不會產生真實報告。"
                : "This demo case is for walkthrough only — never counted and never produces a real report."}
            </p>
          </div>
        </div>
      )}

      {/* demo report modal */}
      {demoModal === "report" && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#1a1a1a80] p-5"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDemoModal(null);
          }}
        >
          <div className="relative my-8 w-full max-w-[640px] rounded-[14px] border border-[#1a1a1a1f] bg-[#F4E9D5] p-7 shadow-[0_20px_60px_rgba(17,17,16,0.35)]" role="dialog" aria-modal="true">
            <button type="button" onClick={() => setDemoModal(null)} className="absolute right-3.5 top-3.5 p-1.5 text-[#5c584a]" aria-label={zh ? "關閉" : "Close"}>
              <X size={16} />
            </button>
            <p className="text-[10px] tracking-[0.18em] text-[#8d8873]" style={{ fontFamily: MONO }}>
              {zh ? "存證報告 · RPT-DEMO-001 · DEMO" : "EVIDENCE REPORT · RPT-DEMO-001 · DEMO"}
            </p>
            <h3 className="mt-1.5 text-[20px] font-black">{zh ? "侵權存證報告" : "Infringement evidence report"}</h3>
            <p className="mt-1 text-[13px] text-[#5c584a]">
              {zh
                ? `關聯案件：${demoWork?.name || "1.jpg"} × Yahoo News Taiwan 文章頁 · 2026/7/8 發現、人工複審確認侵權`
                : `Linked case: ${demoWork?.name || "1.jpg"} × Yahoo News Taiwan article · found 2026/7/8, confirmed by human review`}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {(zh
                ? [
                    ["電子憑證", "已附上", "原作簽署憑證 + 發現當下網頁快照"],
                    ["相似度比對", "98%", "距離 3，低於門檻 16，判定同一原作"],
                    ["來源軌跡", "已記錄", "發現網址、時間戳、巡檢來源"],
                    ["人工複審", "已確認", "複審人與確認時間已入紀錄"],
                    ["上鏈紀錄", "Numbers 主網", "報告雜湊已上鏈，可公開驗證"],
                  ]
                : [
                    ["CERTIFICATES", "Attached", "origin certificate + page snapshot at discovery"],
                    ["SIMILARITY", "98%", "distance 3, below threshold 16 — same original"],
                    ["SOURCE TRAIL", "Recorded", "URL, timestamp, and patrol source"],
                    ["HUMAN REVIEW", "Confirmed", "reviewer and confirmation time on record"],
                    ["ON-CHAIN RECORD", "Numbers Mainnet", "report hash anchored, publicly verifiable"],
                  ]
              ).map(([k, v, d]) => (
                <div key={k}>
                  <p className="text-[10px] tracking-[0.14em] text-[#8d8873]" style={{ fontFamily: MONO }}>
                    {k}
                  </p>
                  <p className="mt-0.5 text-[14px] font-bold">
                    {v} <span className="block text-[12px] font-normal text-[#5c584a]">{d}</span>
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={() => props.showToast(zh ? "DEMO：正式版將下載可交付法務的 PDF 報告" : "DEMO: production exports a legal-ready PDF report")}
                className="rounded-[9px] bg-[#4c6b3c] px-5 py-2.5 text-[13px] font-bold text-white"
              >
                {zh ? "下載 PDF 報告" : "Download PDF"}
              </button>
              <button
                type="button"
                onClick={() => props.showToast(zh ? "已複製驗證連結（示範）" : "Verification link copied (demo)")}
                className="rounded-[9px] border border-[#1a1a1a33] px-4 py-2.5 text-[13px] font-bold"
              >
                {zh ? "複製驗證連結" : "Copy verify link"}
              </button>
            </div>
            <p className="mt-3.5 text-[12px] text-[#8d8873]">
              {zh ? "DEMO 報告僅供預覽，不具法律效力、不列入統計。" : "The DEMO report is preview-only — no legal effect, never counted."}
            </p>
          </div>
        </div>
      )}
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
            ? "怎麼看：左右對照「原創 vs 巡檢發現」，中央圓圈是相似度，下方「來源軌跡」是完整證據時間線。底部行動按鈕為安全操作，只會記錄到本案軌跡。"
            : "How to read: compare original vs detected side by side, the ring shows similarity, and the provenance trace below is the full evidence timeline. The action buttons are safe-mode actions and only log to this case."
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
              {zh ? "安全操作" : "SAFE MODE"}
            </span>
          </div>
          <p className="mt-0.5 text-[10px] tracking-[0.08em] text-[#CEC0A3]" style={{ fontFamily: MONO }}>
            {zh ? "MVP 試營運 · 僅記錄到本案軌跡，不會真的送出外部通知" : "MVP pilot · logged to this case only; no external notice is sent"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button type="button" title={zh ? "安全操作：僅記錄到本案時間軸，不會真的送出下架" : "Safe mode: only logs to this case timeline; no real takedown is sent"} onClick={() => props.onAction("dmca")} className="rounded-[9px] bg-[#ED5D29] px-4 py-2.5 text-[12.5px] font-semibold text-white">
            {zh ? "發出 DMCA 下架" : "Send DMCA"}
          </button>
          <button type="button" title={zh ? "安全操作：於本頁產生一筆存證報告預覽" : "Safe mode: adds an evidence-report preview to this page"} onClick={() => props.onAction("report")} className="rounded-[9px] bg-[#7F9C7E] px-4 py-2.5 text-[12.5px] font-semibold text-[#1A1A1A]">
            {zh ? "產生存證報告" : "Generate report"}
          </button>
          <button type="button" title={zh ? "安全操作：記錄封存動作" : "Safe mode: logs an archive action"} onClick={() => props.onAction("archive")} className="rounded-[9px] border border-[#f4e9d54d] px-4 py-2.5 text-[12.5px] font-semibold text-[#F4E9D5]">
            {zh ? "封存證據" : "Archive"}
          </button>
          <button type="button" title={zh ? "安全操作：記錄聯絡通知" : "Safe mode: logs a contact notice"} onClick={() => props.onAction("contact")} className="rounded-[9px] border border-[#f4e9d54d] px-4 py-2.5 text-[12.5px] font-semibold text-[#F4E9D5]">
            {zh ? "聯絡對方" : "Contact"}
          </button>
          <button type="button" title={zh ? "安全操作：將本案標記為誤判" : "Safe mode: marks this case as a false positive"} onClick={() => props.onAction("dismiss")} className="rounded-[9px] px-3 py-2.5 text-[12.5px] font-semibold text-[#CEC0A3]">
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

function VaultView({
  locale,
  works,
  onOpenCert,
  protectedDisplay,
  indexedRows,
  channelsTotal,
  onOpenSign,
  onNavigate,
  showToast,
}: {
  locale: Locale;
  works: WorkVM[];
  onOpenCert: (id: string) => void;
  protectedDisplay: string;
  indexedRows: number;
  channelsTotal: string;
  onOpenSign: () => void;
  onNavigate: (v: View) => void;
  showToast: (msg: string, kind?: "ok" | "alert") => void;
}) {
  const zh = locale === "zh-TW";
  const [query, setQuery] = useState("");
  const [visible, setVisible] = useState(9);
  const [chip, setChip] = useState<"all" | "indexed" | "indexing">("all");
  const q = query.trim().toLowerCase();
  const filtered = q
    ? works.filter((w) => `${w.name} ${w.en} ${w.author} ${w.owner}`.toLowerCase().includes(q))
    : works;
  const shown = filtered.slice(0, visible);
  const protectedNum = Number(protectedDisplay.replace(/,/g, "")) || works.length;
  const indexingRest = Math.max(0, protectedNum - indexedRows);

  return (
    <div className="max-w-[1240px] px-6 py-7 md:px-9">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <PageHead
            dot={C.green}
            eyebrow={zh ? "我的原創 · VAULT" : "My originals · Vault"}
            title={zh ? "受保護的原創影像" : "Protected originals"}
            desc={
              zh
                ? "每張作品都建立了不可逆的視覺指紋（改圖也認得出）與來源憑證。點卡片可檢視著作憑證：創作者、權利人、指紋、可驗證連結。"
                : "Each work has an irreversible visual fingerprint (edits are still recognized) and an origin certificate. Click a card for creator, rights holder, fingerprint, and a verifiable link."
            }
            hint={
              zh
                ? "怎麼看：上排是保護現況統計；下方卡片為示範縮圖樣本。點「＋簽署新作品」可看入庫流程（示範）。"
                : "How to read: the top row shows protection stats; the cards below are sample thumbnails. “Sign a new work” shows the intake flow (demo)."
            }
          />
        </div>
        <button
          type="button"
          onClick={onOpenSign}
          className="mt-1 flex-none rounded-[9px] bg-[#4c6b3c] px-4 py-2.5 text-[13px] font-semibold text-white"
        >
          ＋ {zh ? "簽署新作品" : "Sign a new work"}
        </button>
      </div>

      <div className="mb-5 grid gap-3.5 sm:grid-cols-3">
        <div className="rounded-[12px] bg-[#1A1A1A] p-5 text-[#F4E9D5]">
          <p className="text-[10px] tracking-[0.16em] text-[#7F9C7E]" style={{ fontFamily: MONO }}>
            {zh ? "已保護 · PROTECTED" : "PROTECTED"}
          </p>
          <p className="mt-1.5 text-[30px] font-bold leading-none" style={{ fontFamily: MONO, color: "#9fbb87" }}>
            {protectedDisplay}
          </p>
          <p className="mt-1.5 text-[12px] text-[#CEC0A3]">{zh ? "張作品已建立指紋與來源憑證" : "works fingerprinted & certified"}</p>
        </div>
        <div className="rounded-[12px] border border-[#1a1a1a14] bg-white p-5">
          <p className="text-[10px] tracking-[0.16em] text-[#8d8873]" style={{ fontFamily: MONO }}>
            {zh ? "可查驗樣本 · INDEXED" : "INDEXED"}
          </p>
          <p className="mt-1.5 text-[30px] font-bold leading-none text-[#4f6a4e]" style={{ fontFamily: MONO }}>
            {indexedRows.toLocaleString("en-US")}
          </p>
          <p className="mt-1.5 text-[12px] leading-5 text-[#5c584a]">
            {zh
              ? `已可在「查一張圖」即時查驗；其餘 ${indexingRest.toLocaleString("en-US")} 張批次建立索引中`
              : `checkable in Verify today; the other ${indexingRest.toLocaleString("en-US")} are being indexed in batches`}
          </p>
        </div>
        <div className="rounded-[12px] border border-[#1a1a1a14] bg-white p-5">
          <p className="text-[10px] tracking-[0.16em] text-[#8d8873]" style={{ fontFamily: MONO }}>
            {zh ? "監控通路 · SOURCES" : "SOURCES"}
          </p>
          <p className="mt-1.5 text-[30px] font-bold leading-none" style={{ fontFamily: MONO }}>
            {channelsTotal}
          </p>
          <p className="mt-1.5 text-[12px] leading-5 text-[#5c584a]">
            {zh ? "其中 3 個已自動巡檢，" : "3 of them auto-patrolled — "}
            <button type="button" onClick={() => onNavigate("channels")} className="font-bold text-[#4f6a4e]">
              {zh ? "看通路狀態 →" : "channel status →"}
            </button>
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setVisible(9);
          }}
          placeholder={zh ? "搜尋檔名、主題或創作者…" : "Search file name, subject, or creator…"}
          className="min-w-[220px] flex-1 rounded-[9px] border border-[#1a1a1a26] bg-white px-3.5 py-2.5 text-[13px] outline-none placeholder:text-[#1a1a1a4d] focus:border-[#7F9C7E]"
          aria-label={zh ? "搜尋原創作品" : "Search originals"}
        />
        <span className="text-[12px] text-[#5c584a]" style={{ fontFamily: MONO }}>
          {q
            ? zh
              ? `搜尋結果 ${filtered.length} 張（示範縮圖 ${works.length} 張）`
              : `${filtered.length} result(s) of ${works.length} sample thumbnails`
            : zh
            ? `顯示 ${Math.min(visible, filtered.length)} / ${protectedDisplay} 張（已載入示範縮圖 ${works.length} 張）`
            : `Showing ${Math.min(visible, filtered.length)} / ${protectedDisplay} (${works.length} sample thumbnails loaded)`}
        </span>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          {(
            [
              { key: "all" as const, label: zh ? `全部 ${protectedDisplay}` : `All ${protectedDisplay}` },
              { key: "indexed" as const, label: zh ? `已可查驗 ${indexedRows}` : `Verifiable ${indexedRows}` },
              { key: "indexing" as const, label: zh ? `索引建立中 ${indexingRest.toLocaleString()}` : `Indexing ${indexingRest.toLocaleString()}` },
            ]
          ).map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => {
                setChip(c.key);
                if (c.key !== "all") {
                  showToast(zh ? "示範原型：正式版將依索引狀態篩選作品" : "Demo prototype: production filters works by index status");
                }
              }}
              className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                chip === c.key
                  ? "border-[#1A1A1A] bg-[#1A1A1A] text-[#F4E9D5]"
                  : "border-[#1a1a1a26] bg-white text-[#5c584a] hover:border-[#7F9C7E]"
              }`}
              style={{ fontFamily: MONO }}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <button
          type="button"
          onClick={onOpenSign}
          className="flex min-h-[220px] flex-col items-center justify-center gap-1.5 rounded-[14px] border-2 border-dashed border-[#1a1a1a26] bg-[#f8f2e3] p-5 text-center text-[#5c584a] transition-colors hover:border-[#7F9C7E] hover:text-[#4f6a4e]"
        >
          <span className="text-[30px] leading-none">＋</span>
          <span className="text-[14px] font-bold">{zh ? "簽署新作品" : "Sign a new work"}</span>
          <span className="text-[12px]">{zh ? "上傳後建立指紋與來源憑證，納入巡檢" : "Upload to fingerprint, certify, and patrol"}</span>
        </button>
        {shown.map((w) => (
          <button
            key={w.assetId}
            type="button"
            onClick={() => onOpenCert(w.assetId)}
            className="overflow-hidden rounded-[14px] border border-[#1a1a1a12] bg-white text-left transition-colors hover:border-[#7F9C7E]"
          >
            <div className="relative">
              <Thumb src={w.thumb} grad={w.grad} className="aspect-[16/10] w-full" />
              <span className="absolute right-2.5 top-2.5 rounded-full bg-[#1a1a1ad1] px-2.5 py-1 text-[9px] font-semibold text-[#e8dfab]" style={{ fontFamily: MONO }}>
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
      {filtered.length === 0 && (
        <p className="mt-5 rounded-[10px] border border-[#1a1a1a14] bg-white px-5 py-6 text-center text-[13px] text-[#8d8873]">
          {zh ? "沒有符合搜尋的示範樣本。全庫搜尋將在正式版提供。" : "No sample matches this search. Full-library search arrives in the production version."}
        </p>
      )}
      {visible < filtered.length && (
        <div className="mt-5 flex items-center justify-center gap-3.5 text-[13px] text-[#5c584a]">
          <button
            type="button"
            onClick={() => setVisible((v) => v + 9)}
            className="rounded-[9px] border border-[#1a1a1a33] px-4 py-2 font-semibold"
          >
            {zh ? "載入更多" : "Load more"}
          </button>
          <span>
            {zh
              ? `示範已載入 ${works.length} 張縮圖；全庫分頁載入將在正式版提供`
              : `${works.length} sample thumbnails available; full-library paging arrives in production`}
          </span>
        </div>
      )}
    </div>
  );
}

/* ---------------- sign-a-new-work modal (clearly-labelled demonstration) ---------------- */

function SignModal({
  locale,
  onClose,
  showToast,
}: {
  locale: Locale;
  onClose: () => void;
  showToast: (msg: string, kind?: "ok" | "alert") => void;
}) {
  const zh = locale === "zh-TW";
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#1a1a1a80] p-5"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative my-10 w-full max-w-[620px] rounded-[14px] border border-[#1a1a1a1f] bg-[#F4E9D5] p-7 shadow-[0_20px_60px_rgba(17,17,16,0.35)]" role="dialog" aria-modal="true">
        <button type="button" onClick={onClose} className="absolute right-3.5 top-3.5 p-1.5 text-[#5c584a]" aria-label={zh ? "關閉" : "Close"}>
          <X size={16} />
        </button>
        <p className="text-[10px] tracking-[0.18em] text-[#8d8873]" style={{ fontFamily: MONO }}>
          {zh ? "簽署新作品 · PROTECT" : "SIGN A NEW WORK · PROTECT"}
        </p>
        <h3 className="mt-1.5 text-[20px] font-black">{zh ? "為新作品建立保護" : "Protect a new work"}</h3>
        <p className="mt-1 text-[13px] leading-5 text-[#5c584a]">
          {zh
            ? "上傳後系統會建立不可逆的視覺指紋與來源憑證，之後的每日巡檢就會涵蓋這件作品。"
            : "After upload, the system builds an irreversible visual fingerprint and origin certificate, and daily patrols start covering the work."}
        </p>
        <button
          type="button"
          onClick={() => showToast(zh ? "示範原型：正式版將在此上傳影像並完成簽署" : "Demo prototype: production uploads and signs the image here")}
          className="mt-4 w-full rounded-[12px] border-2 border-dashed border-[#1a1a1a26] bg-white px-5 py-9 text-center font-bold text-[#5c584a] transition-colors hover:border-[#7F9C7E] hover:text-[#4f6a4e]"
        >
          ⬆ {zh ? "拖曳或點擊上傳影像" : "Drag or click to upload"}
          <span className="mt-1 block text-[12px] font-normal text-[#8d8873]">
            {zh ? "支援 JPG / PNG / TIFF · 可批次上傳（示範）" : "JPG / PNG / TIFF · batch upload supported (demo)"}
          </span>
        </button>
        <p className="mt-4 flex flex-wrap items-center gap-2 text-[11px]" style={{ fontFamily: MONO }}>
          {(zh
            ? ["上傳影像", "建立指紋", "簽署來源憑證", "納入巡檢"]
            : ["upload image", "build fingerprint", "sign certificate", "join patrol"]
          ).map((s, i, arr) => (
            <span key={s} className="flex items-center gap-2">
              <span className="rounded-full border border-[#1a1a1a1f] bg-[#f8f2e3] px-3 py-1 text-[#5c584a]">{s}</span>
              {i < arr.length - 1 && <span aria-hidden>→</span>}
            </span>
          ))}
        </p>
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
  showToast,
}: {
  locale: Locale;
  channels: ChannelVM[];
  monitoring: MonitoringRun;
  onRunPatrol: () => void;
  showToast: (msg: string, kind?: "ok" | "alert") => void;
}) {
  const zh = locale === "zh-TW";
  const [showSuggest, setShowSuggest] = useState(false);
  const [suggestValue, setSuggestValue] = useState("");
  const liveSources = new Set((monitoring.source_runs || []).map((run) => run.source_id).filter(Boolean));
  const liveSourceCount = liveSources.size || (monitoring.adapter?.id?.includes("visionWebDetection") ? 1 : 0);
  const latestCandidates = monitoring.run_scope?.candidates_attempted ?? 0;
  const lastRunLabel = formatDateForLocale(monitoring.completed_at || monitoring.generated_at, locale);
  const stageCounts = channels.reduce(
    (acc, channel) => {
      acc[channel.status] += 1;
      return acc;
    },
    { automated: 0, manual: 0, queued: 0, search: 0 },
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
              ? "目前已運作的自動巡檢來源包含 Google Vision Web Detection 與 3 個公開頁面通路；其餘通路仍是查詢線索、人工複核或待授權狀態。"
              : "Live automated patrol now includes Google Vision Web Detection plus 3 public-page channels. Other channels remain query leads, manual review, or authorization-needed."
          }
          hint={
            zh
              ? "怎麼看：上方看目前真正執行的巡檢來源；下方每張卡表示指定通路的導入狀態。自動巡檢會抓取公開頁候選圖片並送入本地指紋比對；查詢線索不等於已接平台爬蟲。"
              : "How to read: the summary shows real patrol sources; each card shows integration status. Auto patrol fetches public-page image candidates for local fingerprint comparison; query leads are not platform crawlers."
          }
        />
        <button type="button" onClick={onRunPatrol} className="rounded-[9px] bg-[#1A1A1A] px-[18px] py-2.5 text-[12.5px] font-semibold text-[#F4E9D5]">
          ＋ {zh ? "查看最近巡檢" : "Review latest patrol"}
        </button>
      </div>

      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[17px] font-black">
          {zh
            ? `${channels.length} 個通路 · 4 種導入狀態`
            : `${channels.length} channels · 4 integration stages`}
        </h2>
        <span className="text-[11px] text-[#8d8873]" style={{ fontFamily: MONO }}>
          {zh ? `最近巡檢 ${lastRunLabel} · 每日 11:17（台北時間）自動執行` : `Latest patrol ${lastRunLabel} · runs daily at 11:17 Taipei`}
        </span>
      </div>

      {/* 4 integration-stage group cards (real counts) */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(
          [
            { key: "automated" as const, n: stageCounts.automated, t: zh ? "自動巡檢" : "Auto patrol", d: zh ? "已接公開頁巡檢，自動比對指紋" : "Public-page patrol with fingerprint matching" },
            { key: "search" as const, n: stageCounts.search, t: zh ? "查詢線索" : "Query leads", d: zh ? "提供查詢入口與人工複核線索" : "Query entry points and review leads" },
            { key: "manual" as const, n: stageCounts.manual, t: zh ? "人工複核" : "Manual review", d: zh ? "尚未接爬蟲，作為複核來源" : "No crawler yet; used as review sources" },
            { key: "queued" as const, n: stageCounts.queued, t: zh ? "待授權" : "Needs auth", d: zh ? "需平台授權或 API 才能自動化" : "Needs platform permission or API access" },
          ]
        ).map((g) => (
          <div key={g.key} className="rounded-[12px] border border-[#1a1a1a14] bg-white px-4 py-3.5">
            <p className="flex items-center gap-2">
              <span className="h-[9px] w-[9px] rounded-full" style={{ background: chDot(g.key) }} />
              <span className="text-[22px] font-bold leading-none" style={{ fontFamily: MONO }}>
                {g.n}
              </span>
            </p>
            <p className="mt-1.5 text-[13px] font-bold">{g.t}</p>
            <p className="mt-0.5 text-[11.5px] leading-4 text-[#5c584a]">{g.d}</p>
          </div>
        ))}
      </div>

      {/* live-source honesty line */}
      <div className="mb-4 flex items-start gap-2.5 rounded-[10px] border border-[#cfe0cb] bg-[#eef4ea] px-4 py-3 text-[12.5px] leading-5 text-[#3f5a3e]">
        <Radar size={15} className="mt-0.5 flex-none" />
        <span>
          {zh
            ? `目前真正執行的自動巡檢來源：Google Vision Web Detection + 3 個公開頁面通路（最新 run 來源 ${liveSourceCount} 個、候選影像 ${latestCandidates} 筆）。候選仍需本地指紋比對與人工複核後，才會形成外部主張。`
            : `Live automated sources today: Google Vision Web Detection + 3 public-page channels (${liveSourceCount} source(s), ${latestCandidates} candidate image(s) in the latest run). Candidates still need local fingerprint matching and human review before any external claim.`}
        </span>
      </div>

      {/* channel list */}
      <div className="overflow-hidden rounded-[14px] border border-[#1a1a1a12] bg-white">
        {channels.map((c, i) => (
          <div key={c.id} className={`flex flex-wrap items-center gap-x-3.5 gap-y-1.5 px-5 py-3.5 ${i > 0 ? "border-t border-[#1a1a1a0f]" : ""}`}>
            <span className="w-full min-w-0 flex-none text-[14px] font-bold sm:w-[230px]">{c.name}</span>
            <span className="w-[110px] flex-none text-[11px] text-[#8d8873]" style={{ fontFamily: MONO }}>
              {c.type}
            </span>
            <span className="min-w-[200px] flex-1 text-[12px] leading-4 text-[#5c584a]">{chNote(c.status, locale)}</span>
            <span
              className="flex-none rounded-full px-2.5 py-1 text-[11px] font-semibold"
              style={{ fontFamily: MONO, color: chDot(c.status), background: `${chDot(c.status)}1f` }}
            >
              {chLabel(c.status, locale)}
            </span>
            {c.status === "queued" && (
              <button
                type="button"
                onClick={() =>
                  showToast(zh ? "示範原型：正式版將引導平台授權與 API 接入申請" : "Demo prototype: production guides the platform-authorization and API onboarding request")
                }
                className="flex-none text-[12px] font-bold text-[#4f6a4e]"
              >
                {zh ? "申請接入 →" : "Request access →"}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* suggest a new channel */}
      <button
        type="button"
        onClick={() => setShowSuggest(true)}
        className="mt-4 w-full rounded-[12px] border-2 border-dashed border-[#1a1a1a26] bg-[#f8f2e3] px-5 py-4 text-center text-[#5c584a] transition-colors hover:border-[#7F9C7E] hover:text-[#4f6a4e]"
      >
        <span className="block text-[14px] font-bold">＋ {zh ? "建議新增監控通路" : "Suggest a new channel"}</span>
        <span className="mt-0.5 block text-[12px]">
          {zh ? "想監控特定網站或平台？告訴我們，我們會評估接入。" : "Want a specific site or platform patrolled? Tell us and we'll evaluate it."}
        </span>
      </button>

      {/* suggest modal */}
      {showSuggest && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#1a1a1a80] p-5"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowSuggest(false);
          }}
        >
          <div className="relative my-10 w-full max-w-[560px] rounded-[14px] border border-[#1a1a1a1f] bg-[#F4E9D5] p-7 shadow-[0_20px_60px_rgba(17,17,16,0.35)]" role="dialog" aria-modal="true">
            <button type="button" onClick={() => setShowSuggest(false)} className="absolute right-3.5 top-3.5 p-1.5 text-[#5c584a]" aria-label={zh ? "關閉" : "Close"}>
              <X size={16} />
            </button>
            <p className="text-[10px] tracking-[0.18em] text-[#8d8873]" style={{ fontFamily: MONO }}>
              {zh ? "建議通路 · SUGGEST" : "SUGGEST A CHANNEL"}
            </p>
            <h3 className="mt-1.5 text-[20px] font-black">{zh ? "想監控哪個網站或平台？" : "Which site or platform should we patrol?"}</h3>
            <p className="mt-1 text-[13px] leading-5 text-[#5c584a]">
              {zh
                ? "告訴我們你希望納入巡檢的通路，我們會評估爬蟲可行性與平台授權需求。"
                : "Tell us which channel to include; we'll evaluate crawler feasibility and platform-authorization needs."}
            </p>
            <form
              className="mt-4 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!suggestValue.trim()) {
                  showToast(zh ? "請先填入網址" : "Please enter a URL first", "alert");
                  return;
                }
                setShowSuggest(false);
                setSuggestValue("");
                showToast(zh ? "已收到你的通路建議（示範）—— 正式版將進入評估佇列並回報進度" : "Suggestion received (demo) — production queues it for evaluation and reports progress");
              }}
            >
              <input
                value={suggestValue}
                onChange={(e) => setSuggestValue(e.target.value)}
                placeholder="https://example.com"
                className="min-w-0 flex-1 rounded-[9px] border border-[#1a1a1a26] bg-white px-3.5 py-2.5 text-[12px] outline-none placeholder:text-[#1a1a1a4d] focus:border-[#7F9C7E]"
                style={{ fontFamily: MONO }}
                aria-label={zh ? "通路網址" : "Channel URL"}
              />
              <button type="submit" className="flex-none rounded-[9px] bg-[#1A1A1A] px-4 py-2.5 text-[12px] font-semibold text-[#F4E9D5]">
                {zh ? "送出建議" : "Submit"}
              </button>
            </form>
          </div>
        </div>
      )}
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

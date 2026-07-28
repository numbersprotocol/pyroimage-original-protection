import type { AlertRecord, DashboardMetric, DemoAsset, Locale, MonitoredSource, TtdMvpData } from "../data/originRadarTypes";

export const GRADS = [
  "linear-gradient(180deg,#C1E1DC 0%,#8aab89 45%,#6f8a6e 70%,#9a8d6e 100%)",
  "linear-gradient(180deg,#F4E9D5 0%,#D8B76A 40%,#a89a78 75%,#8f8266 100%)",
  "linear-gradient(180deg,#C1E1DC 0%,#7F9C7E 45%,#5f7a5e 78%,#4a604a 100%)",
  "linear-gradient(180deg,#F9C6C0 0%,#CEC0A3 40%,#8aab89 75%,#6f8a6e 100%)",
];

export interface WorkVM {
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

export interface ChannelVM {
  id: string;
  name: string;
  type: string;
  risk: string;
  status: "automated" | "manual" | "queued" | "search";
  hits: number;
}

export interface TimelineItem {
  t?: string;
  zh: string;
  en: string;
}

export interface AlertVM {
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

export function shortFp(value?: string) {
  if (!value) return "N/A";
  if (value.length <= 22) return value;
  return `${value.slice(0, 14)}…${value.slice(-6)}`;
}

export function formatDateForLocale(value: string | undefined, locale: Locale) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(locale, { timeZone: "Asia/Taipei" });
}

export function getMetric(metrics: DashboardMetric[], id: string) {
  return metrics.find((metric) => metric.id === id);
}

export function metricDisplay(metrics: DashboardMetric[], id: string, fallback: string) {
  return getMetric(metrics, id)?.value_display ?? fallback;
}

export function buildWorks(assets: DemoAsset[], limit: number): WorkVM[] {
  return assets
    .filter((asset) => asset.media_refs?.thumbnail_url)
    .slice(0, limit)
    .map((asset, index) => ({
      assetId: asset.asset_id,
      name: asset.display_title || asset.headline || "—",
      en: asset.caption || "",
      author: asset.creator_name || "—",
      owner: asset.rights_holder_owner_name || asset.creator_name || "—",
      fp: shortFp(asset.cid || asset.asset_id),
      sealed: asset.uploaded_at,
      thumb: asset.media_refs?.thumbnail_url || "",
      grad: GRADS[index % GRADS.length],
      certificate: asset.certificate_link,
      c2pa: asset.c2pa_status,
      provenance: asset.provenance_status,
      reviewStatus: asset.labels?.visual_review_status,
    }));
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

export function buildChannels(sources: MonitoredSource[], alerts: AlertRecord[], locale: Locale): ChannelVM[] {
  const hits: Record<string, number> = {};
  alerts.forEach((alert) => {
    hits[alert.source_id] = (hits[alert.source_id] || 0) + 1;
  });
  return sources.map((source) => ({
    id: source.source_id,
    name: source.source_name,
    type: sourceTypeText(source.source_type, locale),
    risk: source.risk_level,
    status:
      source.crawl_method === "automated_public_page"
        ? "automated"
        : source.crawl_method === "not_automated"
          ? "queued"
          : source.crawl_method === "search_query_only"
            ? "search"
            : "manual",
    hits: hits[source.source_id] || 0,
  }));
}

function buildAlert(
  alert: AlertRecord,
  assetById: Map<string, DemoAsset>,
  sourceById: Map<string, MonitoredSource>,
  index: number,
): AlertVM {
  const asset = assetById.get(alert.protected_asset_id);
  const source = sourceById.get(alert.source_id);
  const sim = Math.round(alert.similarity_score * 10000) / 100;
  const status = alert.review_status === "pending_human_review" ? "reviewing" : alert.alert_status || "reviewing";
  return {
    id: alert.alert_id,
    assetId: alert.protected_asset_id,
    work: asset?.display_title || asset?.headline || alert.protected_asset_id,
    workEn: asset?.caption || "",
    author: asset?.creator_name || "—",
    fp: shortFp(asset?.cid || alert.protected_asset_id),
    channel: alert.source_name || source?.source_name || alert.source_id,
    sourceUrl: alert.source_url,
    sim,
    risk: sim >= 90 ? "high" : sim >= 80 ? "med" : "low",
    status,
    simulated: alert.evidence_label === "simulated",
    caseLabel: alert.display_copy?.case_label || "",
    detected: alert.retrieved_at,
    thumb: asset?.media_refs?.thumbnail_url || "",
    grad: GRADS[index % GRADS.length],
    distance: alert.similarity_distance,
    threshold: alert.similarity_threshold,
    notice: alert.display_copy?.public_use_notice || "",
    reviewerPrompt: alert.display_copy?.reviewer_prompt || "",
    transformation: alert.transformation_notes || "",
    certificate: asset?.certificate_link,
    baseTimeline: [
      { t: asset?.uploaded_at, zh: "原創影像簽署封存", en: "Original sealed" },
      { t: asset?.uploaded_at, zh: "數位指紋寫入指紋庫", en: "Fingerprint indexed" },
      { t: alert.retrieved_at, zh: "通路巡檢偵測到高相似影像", en: "Patrol detected high-similarity image" },
      { t: alert.retrieved_at, zh: "證據快照待人工複審", en: "Evidence snapshot pending human review" },
    ],
  };
}

export function buildAlerts(data: TtdMvpData, statusOverride: Record<string, string>): AlertVM[] {
  const assetById = new Map(data.demoAssets.map((asset) => [asset.asset_id, asset]));
  const sourceById = new Map(data.monitoredSources.monitored_sources.map((source) => [source.source_id, source]));
  return data.alerts.map((alert, index) => {
    const vm = buildAlert(alert, assetById, sourceById, index);
    return { ...vm, status: statusOverride[vm.id] || vm.status };
  });
}

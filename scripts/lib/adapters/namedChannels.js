import crypto from "node:crypto";
import fs from "node:fs";
import { redactUrl } from "../perceptualHash.js";

const DEFAULT_SOURCE_IDS = ["SRC-01", "SRC-04", "SRC-12"];
const DEFAULT_MAX_CANDIDATES_PER_SOURCE = 1;
const DEFAULT_FETCH_TIMEOUT_MS = 10000;
const DEFAULT_MAX_HTML_BYTES = 900_000;
const USER_AGENT = "Numbers-OriginRadar-MVP-channel-patrol/1.0";
const AUTOMATED_CRAWL_METHOD = "automated_public_page";

function sha256Text(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function compactText(value, length = 16) {
  return sha256Text(value).slice(0, length);
}

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function attributeValue(tag, name) {
  const pattern = new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i");
  return tag.match(pattern)?.[1] || "";
}

function toAbsoluteUrl(value, baseUrl) {
  if (!value || value.startsWith("data:") || value.startsWith("blob:")) return "";
  try {
    return new URL(value.replace(/&amp;/g, "&"), baseUrl).href;
  } catch {
    return "";
  }
}

function firstSrcsetUrl(value) {
  return String(value || "").split(",")[0]?.trim().split(/\s+/)[0] || "";
}

function looksLikeContentImage(url) {
  const normalized = url.toLowerCase();
  if (!/^https?:\/\//.test(normalized)) return false;
  return ![
    "favicon",
    "sprite",
    "/logo",
    "logo_",
    "placeholder",
    "blank.",
    "1x1",
    "pixel",
    "tracking",
  ].some((pattern) => normalized.includes(pattern));
}

function extractImageUrls(html, baseUrl) {
  const urls = [];
  const push = (raw) => {
    const absolute = toAbsoluteUrl(raw, baseUrl);
    if (absolute && looksLikeContentImage(absolute)) urls.push(absolute);
  };

  for (const metaTag of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = metaTag[0];
    const key = `${attributeValue(tag, "property")} ${attributeValue(tag, "name")}`.toLowerCase();
    if (key.includes("og:image") || key.includes("twitter:image")) {
      push(attributeValue(tag, "content"));
    }
  }

  for (const imgTag of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = imgTag[0];
    push(attributeValue(tag, "src"));
    push(attributeValue(tag, "data-src"));
    push(attributeValue(tag, "data-original"));
    push(attributeValue(tag, "data-lazy-src"));
    push(firstSrcsetUrl(attributeValue(tag, "srcset")));
    push(firstSrcsetUrl(attributeValue(tag, "data-srcset")));
  }

  return [...new Set(urls)];
}

async function fetchTextWithLimit(url, { timeoutMs, maxBytes }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "User-Agent": USER_AGENT,
      },
      signal: controller.signal,
    });
    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();
    if (text.length > maxBytes) {
      throw new Error(`HTML response exceeds max bytes (${text.length} > ${maxBytes})`);
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    if (!contentType.includes("text/html")) {
      throw new Error(`non-HTML response content-type=${contentType || "blank"}`);
    }
    return { text, contentType, status: response.status, bytes: text.length };
  } finally {
    clearTimeout(timeout);
  }
}

function buildPageCandidate({ source, protectedAsset, imageUrl, index, page }) {
  return {
    candidate_id: `channel_${source.source_id}_${compactText(`${protectedAsset.asset_id}|${imageUrl}|${index}`)}`,
    protected_asset_id: protectedAsset.asset_id,
    image_url: imageUrl,
    image_ref: redactUrl(imageUrl),
    source_id: source.source_id,
    source_name: source.source_name,
    source_type: source.source_type,
    source_url: redactUrl(source.source_url),
    source_page: redactUrl(source.source_url),
    retrieved_via: "namedChannelCrawler",
    run_mode: "automated_public_channel_crawl",
    screenshot_path_or_status: "not_captured_mvp_public_page_crawl",
    transform: "none",
    expected: "unknown",
    channel_crawl_status: page.status,
    channel_crawl_content_type: page.contentType,
    notes:
      "Image candidate discovered by fetching a configured public channel page. No login, paywall, age gate, anti-bot, or access-control bypass was used; candidate still requires local fingerprint comparison and human review.",
  };
}

export function createNamedChannelCrawlerAdapter(options = {}) {
  const monitoredSourcesPath = options.monitoredSourcesPath;
  const maxCandidatesPerSource = Number(
    options.maxCandidatesPerSource ||
      process.env.TTD_CHANNEL_PATROL_MAX_CANDIDATES_PER_SOURCE ||
      DEFAULT_MAX_CANDIDATES_PER_SOURCE,
  );
  const timeoutMs = Number(options.timeoutMs || process.env.TTD_CHANNEL_PATROL_TIMEOUT_MS || DEFAULT_FETCH_TIMEOUT_MS);
  const maxHtmlBytes = Number(options.maxHtmlBytes || process.env.TTD_CHANNEL_PATROL_MAX_HTML_BYTES || DEFAULT_MAX_HTML_BYTES);
  const configuredSourceIds = parseCsv(process.env.TTD_CHANNEL_PATROL_SOURCE_IDS);
  const sourceIds = configuredSourceIds.length > 0 ? configuredSourceIds : DEFAULT_SOURCE_IDS;
  const monitoredSources = readJson(monitoredSourcesPath).monitored_sources || [];
  const sourceById = new Map(monitoredSources.map((source) => [source.source_id, source]));
  const sources = sourceIds
    .map((sourceId) => sourceById.get(sourceId))
    .filter(Boolean)
    .filter((source) => source.crawl_method === AUTOMATED_CRAWL_METHOD);
  const pageCache = new Map();
  const stats = {
    dry_run: false,
    billable_enabled: false,
    paid_api_used: false,
    budget_guard_respected: true,
    automated_channel_count: sources.length,
    automated_channel_source_ids: sources.map((source) => source.source_id),
    pages_fetched: 0,
    page_fetch_errors: 0,
    images_discovered: 0,
    candidates_returned: 0,
    max_candidates_per_source: maxCandidatesPerSource,
  };

  async function crawlSource(source) {
    if (pageCache.has(source.source_id)) return pageCache.get(source.source_id);

    const result = await fetchTextWithLimit(source.source_url, { timeoutMs, maxBytes: maxHtmlBytes })
      .then((page) => {
        const imageUrls = extractImageUrls(page.text, source.source_url).slice(0, maxCandidatesPerSource);
        stats.pages_fetched += 1;
        stats.images_discovered += imageUrls.length;
        return {
          ok: true,
          status: page.status,
          contentType: page.contentType,
          bytes: page.bytes,
          imageUrls,
        };
      })
      .catch((error) => {
        stats.page_fetch_errors += 1;
        return {
          ok: false,
          status: "fetch_failed",
          contentType: "",
          bytes: 0,
          imageUrls: [],
          error: error.message,
        };
      });

    pageCache.set(source.source_id, result);
    return result;
  }

  return {
    id: "namedChannelCrawler",
    mode: "automated_public_channel_crawl",
    async getCandidates(protectedAsset) {
      const candidates = [];
      for (const source of sources) {
        const page = await crawlSource(source);
        page.imageUrls.forEach((imageUrl, index) => {
          candidates.push(buildPageCandidate({ source, protectedAsset, imageUrl, index, page }));
        });
      }
      stats.candidates_returned += candidates.length;
      return candidates;
    },
    getRunSummary() {
      return { ...stats };
    },
  };
}

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Fix the "破圖" (broken image) problem in the TTD MVP library.
 *
 * Root cause: demo-assets.json stored CDN URLs with the signed query string
 * stripped (`*_query_redacted: true`), so dia-cdn.numbersprotocol.io returns
 * HTTP 403. This script re-fetches each demo asset live from the public DIA API
 * and writes the long-lived `asset_file_thumbnail` (Expires ~ year 2126) into
 * `media_refs.thumbnail_url`, keeping the full query string so <img> works.
 *
 * The thumbnails are public PyroImage assets; embedding the long-lived signed
 * thumbnail URL is safe and uses no paid API.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_DIR = process.env.TTD_OUTPUT_DIR || path.resolve(__dirname, "../public/ttd-mvp");
const DEMO_ASSETS = path.join(OUTPUT_DIR, "demo-assets.json");

const API_BASE = "https://dia-backend.numbersprotocol.io/api/v3/assets";
// How many demo assets to enrich with live thumbnails. The library grid + asset
// detail only need a couple dozen; keep this bounded so the build stays fast.
const ENRICH_LIMIT = Number(process.env.TTD_THUMB_LIMIT || 48);
const CONCURRENCY = 6;
const REQUEST_TIMEOUT_MS = 15000;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

async function fetchAssetThumbnail(assetId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}/${encodeURIComponent(assetId)}/`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ok: false, status: res.status };
    }
    const body = await res.json();
    const thumbnail = body.asset_file_thumbnail || body.sharable_copy || "";
    return {
      ok: Boolean(thumbnail),
      status: res.status,
      thumbnail,
      thumbnail_source: body.asset_file_thumbnail ? "asset_file_thumbnail" : "sharable_copy",
      mime_type: body.asset_file_mime_type || "",
    };
  } catch (error) {
    return { ok: false, status: 0, error: String(error?.message || error) };
  } finally {
    clearTimeout(timer);
  }
}

async function runPool(items, worker, concurrency) {
  const results = new Array(items.length);
  let cursor = 0;
  async function next() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, next));
  return results;
}

async function main() {
  if (!fs.existsSync(DEMO_ASSETS)) {
    throw new Error(`demo-assets.json not found at ${DEMO_ASSETS}; run npm run ttd:ingest first.`);
  }
  const assets = readJson(DEMO_ASSETS);
  const targets = assets.slice(0, ENRICH_LIMIT);

  let enriched = 0;
  let failed = 0;
  const failures = [];

  await runPool(
    targets,
    async (asset) => {
      const id = asset.asset_id || asset.cid;
      if (!id) {
        failed += 1;
        failures.push({ asset_id: asset.asset_id || "", reason: "missing_asset_id" });
        return;
      }
      const result = await fetchAssetThumbnail(id);
      if (result.ok && result.thumbnail) {
        asset.media_refs = asset.media_refs || {};
        asset.media_refs.thumbnail_url = result.thumbnail;
        asset.media_refs.thumbnail_source = result.thumbnail_source;
        asset.media_refs.thumbnail_query_redacted = false;
        enriched += 1;
      } else {
        failed += 1;
        failures.push({ asset_id: id, status: result.status, error: result.error });
      }
    },
    CONCURRENCY,
  );

  writeJson(DEMO_ASSETS, assets);
  writeJson(path.join(OUTPUT_DIR, "demo-thumbnail-enrichment.json"), {
    generated_at: new Date().toISOString(),
    api_endpoint: `${API_BASE}/{asset_id}/`,
    enrich_limit: ENRICH_LIMIT,
    attempted: targets.length,
    enriched,
    failed,
    failures: failures.slice(0, 50),
    note: "Thumbnails use long-lived signed URLs (asset_file_thumbnail, Expires ~ year 2126). No paid API used.",
  });

  console.log(
    JSON.stringify(
      { attempted: targets.length, enriched, failed, output: path.relative(process.cwd(), DEMO_ASSETS) },
      null,
      2,
    ),
  );

  if (enriched === 0) {
    throw new Error("No thumbnails enriched; check DIA API availability.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

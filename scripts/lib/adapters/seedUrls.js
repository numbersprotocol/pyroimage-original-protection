import fs from "node:fs";
import { redactUrl } from "../perceptualHash.js";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assetMediaUrl(asset, field) {
  if (!asset?.media_refs) return "";
  if (field === "thumbnail_url") return asset.media_refs.thumbnail_url || "";
  if (field === "snapshot_url_ref") return asset.media_refs.snapshot_url_ref || "";
  if (field === "original_url_ref") return asset.media_refs.original_url_ref || "";
  return "";
}

function resolveSeedImageUrl(seed, assetById) {
  if (seed.image_url) return seed.image_url;
  const assetId = seed.image_url_from?.asset_id;
  const field = seed.image_url_from?.field || "thumbnail_url";
  return assetMediaUrl(assetById.get(assetId), field);
}

export function createSeedUrlsAdapter(options) {
  const seedDocument = readJson(options.seedFilePath);
  const expectedFilter = options.expectedFilter || "all";
  const assetById = new Map(options.demoAssets.map((asset) => [asset.asset_id, asset]));
  const seeds = (seedDocument.seeds || []).filter((seed) => {
    if (seed.enabled === false) return false;
    if (expectedFilter !== "all" && seed.expected !== expectedFilter) return false;
    return true;
  });

  return {
    id: "seedUrls",
    mode: "zero_cost_seed_urls",
    seedDocument,
    async getCandidates(protectedAsset) {
      return seeds
        .filter((seed) => seed.protected_asset_id === protectedAsset.asset_id)
        .map((seed) => {
          const imageUrl = resolveSeedImageUrl(seed, assetById);
          return {
            candidate_id: seed.seed_id,
            protected_asset_id: seed.protected_asset_id,
            image_url: imageUrl,
            image_ref: redactUrl(imageUrl),
            source_id: seed.source_id || "SEED-URLS",
            source_name: seed.source_name || "Seed URL adapter",
            source_type: seed.source_type || "seed_url",
            source_url: seed.source_url || `seed://ttd-mvp/${seed.seed_id}`,
            source_page: seed.source_page || seed.source_url || `seed://ttd-mvp/${seed.seed_id}`,
            retrieved_via: "seedUrls",
            run_mode: "automated_seed_url_fetch",
            screenshot_path_or_status: "not_captured_phase_1_seed_adapter",
            transform: seed.transform || "none",
            expected: seed.expected || "unknown",
            notes: seed.notes || "",
          };
        });
    },
    getRunSummary() {
      return {
        dry_run: false,
        billable_enabled: false,
        paid_api_used: false,
        budget_guard_respected: true,
        seeds_available: seeds.length,
        expected_filter: expectedFilter,
      };
    },
  };
}

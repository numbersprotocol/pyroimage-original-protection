import fs from "node:fs";
import { performance } from "node:perf_hooks";
import { hammingDistance } from "./perceptualHash.js";

export const DEFAULT_MATCH_THRESHOLD = 16;

export function readJsonl(filePath) {
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

export function loadIndexedEntries(indexPath) {
  return readJsonl(indexPath).filter((row) => row.index_status === "indexed" && row.ahash64 && row.dhash64);
}

export function distanceBetween(query, candidate) {
  const ahash_distance = hammingDistance(query.ahash64, candidate.ahash64);
  const dhash_distance = hammingDistance(query.dhash64, candidate.dhash64);
  const combined_distance = ahash_distance + dhash_distance;
  return {
    ahash_distance,
    dhash_distance,
    combined_distance,
    similarity_score: Number((1 - combined_distance / 128).toFixed(4)),
  };
}

export function queryIndex(query, indexedEntries, options = {}) {
  const started = performance.now();
  const limit = options.limit || 5;
  const matches = indexedEntries
    .map((candidate) => ({
      asset_id: candidate.asset_id,
      display_title: candidate.display_title,
      media_ref: candidate.media_ref,
      ...distanceBetween(query, candidate),
      match_basis: "local aHash64+dHash64 hamming distance; lower distance is more similar",
    }))
    .sort((a, b) => {
      if (a.combined_distance !== b.combined_distance) return a.combined_distance - b.combined_distance;
      if (a.asset_id === query.asset_id) return -1;
      if (b.asset_id === query.asset_id) return 1;
      return a.asset_id.localeCompare(b.asset_id);
    });
  const queryTimeMs = Number((performance.now() - started).toFixed(3));

  return {
    query_asset_id: query.asset_id,
    query_title: query.display_title || "",
    query_time_ms: queryTimeMs,
    threshold: {
      exact_match_distance: 0,
      likely_same_or_controlled_transform_max_combined_distance: DEFAULT_MATCH_THRESHOLD,
      distance_scale: "0 to 128 combined Hamming distance across aHash64 and dHash64; lower is more similar",
    },
    top_match: matches[0] || null,
    top_matches: matches.slice(0, limit),
  };
}

export function matchCandidateToProtectedAsset(candidateFingerprint, protectedEntry, options = {}) {
  const threshold = Number(options.threshold ?? DEFAULT_MATCH_THRESHOLD);
  const distance = distanceBetween(candidateFingerprint, protectedEntry);
  const pass = distance.combined_distance <= threshold;

  return {
    protected_asset_id: protectedEntry.asset_id,
    protected_title: protectedEntry.display_title || "",
    ...distance,
    threshold,
    pass,
    verdict: pass ? "match" : "no_match",
    match_basis: "real fetched candidate image compared to protected asset via local aHash64+dHash64 hamming distance",
  };
}

export function buildIndexByAssetId(indexedEntries) {
  return new Map(indexedEntries.map((entry) => [entry.asset_id, entry]));
}

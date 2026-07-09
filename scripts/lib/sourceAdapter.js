export function assertCandidate(candidate) {
  const missing = ["candidate_id", "protected_asset_id", "source_id", "source_name", "source_url"].filter(
    (field) => !candidate[field],
  );
  if (missing.length > 0) {
    throw new Error(`SourceAdapter candidate is missing required field(s): ${missing.join(", ")}`);
  }
}

export async function getCandidatesForAsset(adapter, protectedAsset) {
  if (!adapter || typeof adapter.getCandidates !== "function") {
    throw new Error("SourceAdapter requires a getCandidates(protectedAsset) function.");
  }
  const candidates = await adapter.getCandidates(protectedAsset);
  candidates.forEach(assertCandidate);
  return candidates;
}

export function combineAdapters(adapters, options = {}) {
  return {
    id: adapters.map((adapter) => adapter.id).join("+"),
    mode: options.mode || adapters.map((adapter) => adapter.mode || adapter.id).join("+"),
    async getCandidates(protectedAsset) {
      const groups = await Promise.all(adapters.map((adapter) => getCandidatesForAsset(adapter, protectedAsset)));
      return groups.flat();
    },
    getRunSummary() {
      const summaries = adapters.map((adapter) => ({
        id: adapter.id,
        mode: adapter.mode || adapter.id,
        summary: typeof adapter.getRunSummary === "function" ? adapter.getRunSummary() : {},
      }));
      return {
        dry_run: summaries.every((item) => item.summary.dry_run === true),
        billable_enabled: summaries.some((item) => item.summary.billable_enabled === true),
        paid_api_used: summaries.some((item) => item.summary.paid_api_used === true),
        budget_guard_respected: summaries.every((item) => item.summary.budget_guard_respected !== false),
        per_adapter: summaries,
      };
    },
  };
}

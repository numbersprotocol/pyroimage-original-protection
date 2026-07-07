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

export function combineAdapters(adapters) {
  return {
    id: adapters.map((adapter) => adapter.id).join("+"),
    async getCandidates(protectedAsset) {
      const groups = await Promise.all(adapters.map((adapter) => getCandidatesForAsset(adapter, protectedAsset)));
      return groups.flat();
    },
  };
}

export type Locale = "en" | "zh-TW";

export type EvidenceLabel = "actual" | "sample" | "simulated" | "target" | "TBD";

export interface DashboardMetric {
  id: string;
  label: string;
  value: number | string;
  value_display: string;
  evidence_label: EvidenceLabel;
  label_display?: string;
  source?: string;
  note?: string;
}

export interface TtdDashboardMetrics {
  generated_at: string;
  metrics: DashboardMetric[];
}

export interface DemoAsset {
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

export interface MonitoredSource {
  source_id: string;
  source_name: string;
  source_type: string;
  crawl_method: string;
  risk_level: string;
  demo_subset?: boolean;
}

export interface AlertRecord {
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

export interface EvidenceReportDocument {
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

export interface VerificationDocument {
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

export interface VerificationTopMatch {
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

export interface VerificationQuery {
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

export interface MonitoringRun {
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

export interface TtdMvpData {
  dashboard: TtdDashboardMetrics;
  demoAssets: DemoAsset[];
  monitoredSources: { monitored_sources: MonitoredSource[] };
  monitoring: MonitoringRun;
  alerts: AlertRecord[];
  evidenceReport: EvidenceReportDocument;
  verification: VerificationDocument;
}

export type LoadState =
  | { status: "loading" }
  | { status: "network-error"; message: string }
  | { status: "contract-error"; message: string; errors: string[] }
  | { status: "ready"; data: TtdMvpData };

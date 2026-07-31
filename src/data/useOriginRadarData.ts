import { useEffect, useState } from "react";
import { formatContractErrors, validateOriginRadarArtifacts } from "../contracts/artifactContracts.js";
import type {
  AlertRecord,
  DemoAsset,
  EvidenceReportDocument,
  LoadState,
  MonitoredSourcesDocument,
  MonitoringRun,
  TtdDashboardMetrics,
  TtdMvpData,
  VerificationDocument,
} from "./originRadarTypes";

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

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return (await response.json()) as T;
}

async function loadOriginRadarData(): Promise<TtdMvpData> {
  const [dashboard, demoAssets, monitoredSources, monitoring, alerts, evidenceReport, verification] = await Promise.all([
    fetchJson<TtdDashboardMetrics>(DATA_PATHS.dashboard),
    fetchJson<DemoAsset[]>(DATA_PATHS.demoAssets),
    fetchJson<MonitoredSourcesDocument>(DATA_PATHS.monitoredSources),
    fetchJson<MonitoringRun>(DATA_PATHS.monitoring),
    fetchJson<AlertRecord[]>(DATA_PATHS.alerts),
    fetchJson<EvidenceReportDocument>(DATA_PATHS.evidenceReport),
    fetchJson<VerificationDocument>(DATA_PATHS.verification),
  ]);

  const data = { dashboard, demoAssets, monitoredSources, monitoring, alerts, evidenceReport, verification };
  const contractResult = validateOriginRadarArtifacts(data);
  if (!contractResult.ok) {
    const message = `OriginRadar artifact contract mismatch: ${formatContractErrors(contractResult.errors)}`;
    throw Object.assign(new Error(message), {
      contractErrors: contractResult.errors,
      isContractError: true,
    });
  }

  return data;
}

export function useOriginRadarData(): LoadState {
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    loadOriginRadarData()
      .then((data) => {
        if (!alive) return;
        setLoadState({ status: "ready", data });
      })
      .catch((error: Error & { isContractError?: boolean; contractErrors?: string[] }) => {
        if (!alive) return;
        if (error.isContractError) {
          setLoadState({
            status: "contract-error",
            message: error.message,
            errors: error.contractErrors || [error.message],
          });
          return;
        }
        setLoadState({ status: "network-error", message: error.message });
      });
    return () => {
      alive = false;
    };
  }, []);

  return loadState;
}

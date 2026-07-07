# PyroImage Original Protection

PyroImage original-image active-protection MVP for provenance patrol, local visual-fingerprint verification, evidence packaging, and budget-guarded Google Cloud Vision `WEB_DETECTION`.

## Commands

```bash
npm ci
npm run ttd:patrol
npm run ttd:report
npm run ttd:verify
npm run ttd:dashboard
npm run ttd:handback
npm run lint
npm run build:pages
```

## Deployment

GitHub Pages deploys the static Vite build from `dist/` using `.github/workflows/deploy-pages.yml`.

The default GitHub Pages route is:

```text
/pyroimage-original-protection/
```

Patrol artifacts are served under:

```text
/pyroimage-original-protection/ttd-mvp/
```

## Patrol Runtime

The scheduled patrol workflow is `.github/workflows/ttd-patrol.yml`.

Required repo secret for billable Vision patrol:

```text
GCP_TTD_PATROL_SA_JSON
```

Recommended repo variable:

```text
TTD_GCP_PROJECT_ID=pyroimage-x402
```

GCP project reference:

```text
Project name: PyroImage x402
Project ID: pyroimage-x402
Project number: 249023052956
```

If the secret is missing, the workflow forces Vision dry-run mode and does not make billable Vision calls.

Budget guard defaults:

```text
TTD_VISION_MONTHLY_CAP_NTD=1000
TTD_VISION_STOP_RATIO=0.9
```

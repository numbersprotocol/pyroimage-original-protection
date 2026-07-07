# PyroImage Original Protection

PyroImage TTD MVP for original-image active protection, provenance patrol, local visual-fingerprint verification, evidence packaging, and budget-guarded Google Cloud Vision `WEB_DETECTION`.

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

The build uses relative asset paths so it works on both GitHub's private Pages environment URL and the public project route if Pages visibility is later changed to public.

Current private Pages environment URL:

```text
https://upgraded-adventure-r2go1ky.pages.github.io/
```

Public project route, if enabled:

```text
https://numbersprotocol.github.io/pyroimage-original-protection/
```

Patrol artifacts are served relative to the active Pages root:

```text
./ttd-mvp/
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

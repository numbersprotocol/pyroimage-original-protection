# Harness Configuration

## Developer Model
- Model: gpt-5.5 (main loop = Developer); this UI-opt-v3 turn implemented interactively by the Developer role

## Daily Report Destination
- Z Entity Type: none
- Z Record ID: N/A — autonomous default, no Z tracking record
- Z Record Link: N/A

## Agent Ticket Assignee
- Primary Assignee: Sofia Yan
- Profile ID: (conversation creator)
- Note: autonomous default — assignee = conversation creator

## Daily Report Mentions (Z App)
- (empty)

## Auto Merge & Deploy
- Enabled: false  (human merges)

## Dev Monitor
- Enabled: false

## Deploy Mode
- Mode: ci-on-merge
- Production URL: https://upgraded-adventure-r2go1ky.pages.github.io/ (GitHub Pages, currently private)
- Preview URL: local vite preview (base `./`)
- CI Workflow: .github/workflows/deploy-pages.yml (Deploy Pages)

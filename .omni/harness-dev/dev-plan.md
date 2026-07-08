# Development Plan — UI Optimization v2 (P0+P1+P2)

Generated 2026-07-08 from ui-optimization-proposal-v2.md. Sofia approved P0+P1+P2.

## Scoring Criteria (Max 5 Points)
| # | Criterion | Points |
|---|-----------|--------|
| 1 | P0 done: 原創查驗不再撞牆 (範例升主, 輸入降級+即時說明, nav承諾精準, 正向提示) + 歡迎彈窗補現況一行且四步不重複 | 1 |
| 2 | P1 done: 首屏信任錨 + KPI改用戶關心數字/白話巡檢狀態(無unknown/dry_run raw) + 報告顯價值非hash + dashboard主CTA | 1 |
| 3 | P2 done: 繁中頁移除英文/程式碼外露(snake_case判定碼, combined distance, Fixture check, ALLCAPS主標, 時間軸中英重複) + 專業名詞白話 + 卡片雜訊收斂 | 1 |
| 4 | 無回歸: 僅src/App.tsx改動; JSON契約/巡檢script未動; EN/繁中雙語正確; 0破圖; honesty/demo標示保留 | 1 |
| 5 | 交付: lint + build:pages 綠; PR 開好 targeting main (ci-on-merge, 人工merge) | 1 |

Approved by: Sofia Yan (chose "P0 + P1 + P2（含全部用詞打磨）").

## Project Config
- Deploy mode: ci-on-merge; Repository: numbersprotocol/pyroimage-original-protection; branch feat/ui-opt-v2-p0p1p2 → main
- Test strategy: local vite preview + agent browser smoke; lint + build:pages
- Infrastructure Dependencies: None (pure frontend presentation change)

## Phase 1: Implement P0+P1+P2 in src/App.tsx
### Sprint Contract
- What: all proposal items (see Scoring Criteria)
- Acceptance: criteria 1-5 above
- Status: COMPLETED (Reviewer claude-opus-4-7 PASS 5/5 on 2026-07-08; see review-notes.md)

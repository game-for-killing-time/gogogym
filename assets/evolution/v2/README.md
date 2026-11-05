# 服裝素材 v2

2026-11-05，使用內建 imagegen 依 C01 既有正背面角色補畫，保留 v1 原檔。

- `characters/c01-tee-joggers-front.png`：珊瑚短袖、深藍訓練長褲正面。
- `characters/c01-tee-joggers-back.png`：同套衣著背面。
- 兩圖均為 1024 × 1536 透明 PNG；衣領、縫線、束口、抽繩和薄荷側線可重用。
- `prompts.json` 保存實際生成提示。

角色頁由 `src/character-art.mjs` 組合上下裝、保留原畫陰影，依五階體型調整寬度。會員外套、夜跑外套仍由 v1 街角外套適配。這些站姿圖不是逐格動作圖集；遊戲動作由 `src/garments.mjs` 和 `src/exercise-art.mjs` 繪製。

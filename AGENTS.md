# Pixel Gym 製作指引

本資料夾是一個獨立遊戲專案。修改前先讀 `README.md`、`docs/game-design.md`、`docs/prototype-plan.md`。

製作或修改任何角色、美術、場景、UI 或動畫前，必須先讀 `docs/art-direction.md`，並實際查看與任務相關的參考圖片。不要只靠文字重新想像風格。

主視覺基準為 `assets/concepts/gym-main-screen-v1.png`，使用者已確認喜歡此風格。角色、場景及擺設設計補充在 `assets/art-reference/`。沿用 C01–C12、P01–P20 編號，新增版本用 v2、v3，保留原檔。新的設計圖尚未經使用者逐項確認，不能描述為全部已批准。

介面佈局以使用者已確認的 `assets/concepts/gym-overlay-hud-v2.png` 為準。遊戲場景佔滿畫面，HUD 與操作浮在場景上；訓練直接在器材位置進行，不恢復固定側欄或遮罩式小遊戲。更多規則見 `docs/overlay-hud-v2.md`。

這些圖片是視覺設計參考，不是已切好的遊戲素材。實作前需統一像素網格、比例、錨點、遮擋層與碰撞區。不要將圖集連同編號標籤直接當遊戲物件，也不要將概念圖或模擬玩家描述為已完成多人遊戲。

此倉庫是從 pixel-gym 交接而來的獨立 gogogym 專案。保持修改在此倉庫內，不借用外層專案的帳戶、機密設定或後端。Cloudflare 接管狀態見 docs/cloudflare-handoff.md；不要把尚未部署的設定描述為已上線，也不要將玩家資料備份提交到公開 GitHub。

# 角色進化、衣櫃及多人外觀整合

2026-11-05。以 GitHub main `9ce433e0d12fc5548a95cbd478e9afbcd331f704` 為基礎，移入 pixel-gym 已製作的角色進化與外觀 v2，保留 GoGoGym 後續的本機五角色、共用暱稱、精簡 HUD 及健身室命名。

## 功能與存檔

十個肌群按五類訓練能力計算，不另加重複成長；五階體型要求整體和均衡能力。六件上衣、三件下裝、兩雙鞋、三件配件依訓練解鎖，可保存日常／訓練／合照三套穿搭。衣物僅改外觀。

每個角色的 `progress.appearance`、`completedWeeks`、`lastTraining` 隨本機檔案保存。沒有這些欄位的舊備份仍可讀取。匯入會檢查衣物、解鎖及欄位；非法資料會拒絕，不默默丟掉衣櫃。存衣服與訓練結算共用既有 Web Locks，重新讀取最新資料；玩家或角色切換後，舊衣櫃的保存請求會拒絕。共用每日三張券不受換裝或匯入舊備份影響。

角色進化頁右上角保留「角色選擇／備份」入口，沒有重新加入 Firebase 登入流程。素材在 `assets/evolution/v1`、`assets/evolution/v2`；v2 保存新增短袖／長褲的透明原圖、內建 imagegen 提示及取用說明。

四方向行走及五類訓練使用同一體型與衣著資料。房間加入、同步與重連傳送白名單外觀 ID 和階段，與動作共用序號檢查。保留自訂房間名稱；舊客戶端未傳外觀時保留原值或採基本衣著。此資料是本機玩家的外觀宣告，不是可信進度或衣物所有權證明。

站姿由原畫及體型適配製作，場景動作是關節式程式繪圖；不是每階、每件衣物的手繪逐格圖集。同步沿用 HTTP，沒有改為 WebSocket。

## 發布前置條件

新增 `migrations/0004_appearance.sql`，只替 `gym_players` 加上可空的 `look_json` 欄位。保留 `0003_room_names.sql`，不可用舊專案的 0003 編號覆蓋它。

**本分支尚未合併 main 或部署。** 本機 Cloudflare 登入缺少 `d1:write` 權限，讀取遠端遷移清單回傳 7403。未擴大授權，也未修改線上資料庫。GitHub main 推送會自動建置，必須由有 D1 權限的擁有者先檢查及套用這個加欄位遷移，再合併 main，避免新版本讀取不存在欄位。正常指令：

```sh
npx wrangler d1 migrations list gogogym --remote
npx wrangler d1 migrations apply gogogym --remote
```

先確認清單只有預期未套用的遷移。舊版程式可與新增的可空欄位共存。官方流程：[Cloudflare D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)。

## 驗收

72 項自動測試通過，包含房間名稱、12 人容量、外觀序號與重連、五類動畫、舊存檔、衣櫃備份往返、換角色隔離、同時換裝與訓練結算，以及共用每日額度。`npm run check:deploy` 建置與 Worker dry-run 通過；不是實際部署。

本機瀏覽器已驗證建立玩家、入場、肌群及衣櫃、保存合照配搭、返回角色管理及建立第二個角色；第二個角色仍使用自己的日常配搭。亦修正本機伺服器 SVG 類型，確保肌群及介面圖示能正常顯示。

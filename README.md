# GoGoGym · 街角像素健身室

12 人共享日式像素健身室：五類訓練、場景內操作、多人房間，以及瀏覽器本機玩家檔案。

目前使用本機玩家檔案，無需 Email、密碼或 Google 登入。最多五個角色，獨立成長、共用每日三張訓練券。每次進入顯示角色選擇並標示上次角色；右下角「角色」提供編輯與匯出／匯入。詳見 [本機檔案規格](docs/local-profiles-v1.md)。

正式網站：[GoGoGym](https://gogogym.hoho-events.workers.dev/play/)。GitHub main 推送會觸發擁有者 Cloudflare Workers Builds。D1 負責多人房間；本版角色成長存於瀏覽器，清除網站資料會造成遺失，請定期匯出備份。舊雲端角色資料保留，未自動搬遷或刪除。

## 本機試玩

本分支加入角色進化、肌群進度、三套衣櫃及多人外觀同步。入場後按「角色」查看肌群或衣櫃，右上「角色選擇／備份」保留五角色管理。穿搭逐角色保存，隨備份匯出／匯入，行走及五類訓練保持目前體型與衣著。整合及發布前置條件見 [外觀整合紀錄](docs/appearance-integration.md)。

安裝 Node.js 22.18 或更新版本後執行：

```sh
npm ci
npm start
```

開啟 http://localhost:4178 。`npm test` 執行測試。普通本機伺服器使用記憶體資料庫，關閉後本機伺服器房間會清空；瀏覽器訪客存檔另行保留。

## 由自己管理的部署

見 [Cloudflare 接管步驟](docs/cloudflare-handoff.md)。先建立自己的 D1，再部署測試網址，驗證後才決定資料搬遷及切換。`npm run check:deploy` 僅檢查打包，不上傳。

## 程式與設計

- `src/`、`index.html`、`style.css`：全畫面遊戲與介面。
- `account-server/`：Firebase 身份驗證、角色及訓練結算。
- `multiplayer-server/`：最多 12 人的 HTTP 房間同步。
- `worker/`、`wrangler.jsonc`：獨立 Cloudflare 入口。
- `migrations/`：D1 資料表；不包含玩家資料。
- `assets/`、`docs/`：角色、場景、原型及設計紀錄。
- [遊戲構思](docs/game-design.md)、[美術規範](docs/art-direction.md)、[會員功能](docs/accounts-v1.md)。

Firebase 使用現有 `pixel-gym-c54cf` 專案。`firebase-web.json` 是瀏覽器所需公開設定，不是 Firebase 管理員私鑰。不要提交服務帳戶、Cloudflare API token、登入快取、資料庫匯出或 `.env`。

人物沿用 C01，名牌配色與角色衣櫃分開；多人仍是 HTTP 同步，Durable Objects / WebSocket 尚未實作。訪客存檔不自動匯入雲端。歷史製作紀錄見 [project-history.md](docs/project-history.md)，以本頁及最新功能文件為準。

# GoGoGym · 街角像素健身室

12 人共享日式像素健身室：五類訓練、每日三類成長、場景內操作、多人房間、Firebase 登入及角色存檔。

## 目前交接進度

第一步：遊戲原始碼、素材、設計文件及測試移交到此 GitHub 倉庫。這份版本可直接開發，並已準備 Cloudflare Workers + D1 部署入口，不依賴 Sites 的建置工具。

現有遊戲仍在 [Sites 網址](https://pixel-gym-club.magicforeveryone2026.chatgpt.site/play/) 運作。此倉庫尚未部署至擁有者的 Cloudflare 帳戶；提交程式不會自動搬移現有玩家資料或更換遊戲網址。

## 本機試玩

安裝 Node.js 22.18 或更新版本後執行：

```sh
npm ci
npm start
```

開啟 http://localhost:4178 。`npm test` 執行測試。普通本機伺服器使用記憶體資料庫，關閉後雲端測試角色及房間會清空；瀏覽器訪客存檔另行保留。

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

目前人物仍沿用 C01，會員配色並非完整換裝；多人仍是 HTTP 同步，Durable Objects / WebSocket 尚未實作。訪客存檔不自動匯入雲端。歷史製作紀錄見 [project-history.md](docs/project-history.md)，以本頁及最新功能文件為準。

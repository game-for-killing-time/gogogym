# 逐步接管網站

## 1. GitHub 原始碼

目的倉庫：https://github.com/game-for-killing-time/gogogym 。已備妥獨立前端、Worker、資料表與素材；沒有複製 Sites 的內部部署憑證或線上玩家資料。Firebase 專案繼續使用 pixel-gym-c54cf。

## 2. 自己的 Cloudflare 測試部署（尚未執行）

先登入自己的 Cloudflare 帳戶，再在此倉庫執行：

```sh
npm ci
npx wrangler login
npx wrangler d1 create gogogym
```

將回傳 database_id 填入根目錄 wrangler.jsonc 的 DB 設定，替換零值佔位 ID。不要填 Sites 原有資料庫 ID。

本機 Cloudflare 驗證：

```sh
npm run db:local
npm run dev:cloudflare
```

準備好測試部署後，明確對自己的新資料庫套用資料表，再發布：

```sh
npx wrangler d1 migrations apply DB --remote
npm run deploy
```

在 Firebase Console → Authentication → Settings → Authorized domains 加入實際獲得的 workers.dev 主機名稱（不含 https:// 或路徑），才測試 Google 登入。Email 登入、角色、訓練結算、重新登入取回進度、兩個裝置進房都須驗證。

首次部署不需要將 Cloudflare token 放入 GitHub。之後可在 Cloudflare Workers Builds 連接此倉庫，自訂 build 為 `npm run build`、deploy 為 `npx wrangler deploy`。資料庫 migration 先人工審閱及執行；不預設每次提交自動改資料庫。

## 3. 搬遷與正式切換（尚未執行）

Firebase 登入帳戶仍屬同一專案，無須重新註冊；但角色進度在 D1，不會跟程式碼自動搬移。先決定保留哪些 Sites D1 資料、安排暫停寫入與備份，再安全匯入自己帳戶的 D1，逐筆核對 uid 與進度。備份不得放公開 GitHub。房間屬暫時資料，可重新開房；新網址亦無法自動讀取舊網址的訪客 localStorage。

未完成上述驗證前，繼續保留原 Sites 網址。新網址確認可用後再分享給朋友，最後才考慮停用舊站。Durable Objects / WebSocket 是另一個階段，不與本次搬遷混在一起。

官方參考：[Workers 靜態素材](https://developers.cloudflare.com/workers/static-assets/binding/)、[D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)。

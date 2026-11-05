# 會員與雲端角色 v1

2026-11-05。Firebase 專案：pixel-gym-c54cf。Email／密碼及 Google 登入已開通。

遊戲內由「角色 → 登入／建立角色」進入。建立角色可選名字及會員配色；目前遊戲人物沿用 C01，尚未提供完整髮型、服裝編輯。

Firebase Authentication 負責登入；Sites 的 Cloudflare Worker 驗證 Firebase ID token，角色與進度存於 D1。每個 Firebase uid 各自一份角色。Firebase web config 為公開設定，不包含服務帳戶私鑰。部署程式勿加入 Firebase CLI 的登入檔或 debug log。

正式訓練先由伺服器建立訓練紀錄，完成後回放輸入並計分，依伺服器時間檢查每日限額，以版本比較及收據防止重複派獎。這不等於完整防作弊：機械化或偽造有效輸入仍需後續防濫用措施。

訪客仍使用本機存檔；舊存檔不會自動匯入雲端。登入狀態使用分頁工作階段保存。未完成訓練不支援跨裝置續玩；結算失敗可在原畫面重試，應先成功儲存才關閉。

多人房間仍沿用 HTTP 同步，尚未轉成 Durable Objects／WebSocket，也未將房間身份完全綁定會員。Firebase token 驗證包含簽章、到期時間、專案及發行者，未逐次查詢撤銷狀態。

驗證：51 項自動測試通過；實際 Firebase 即棄帳戶完成註冊、登入、角色建立、訓練結算、重複收據及重新登入讀回進度。測試 Firebase 帳戶隨後刪除；D1 可保留無登入能力的測試紀錄。Google 的實際帳戶授權流程需由使用者試登入確認。

Sites 第2版已發布。網上瀏覽器已實際驗證 Email 登入、建立角色、重新整理後讀回名字及配色、登出。完整訓練結算的真實 Firebase 測試在本機後端通過；線上命令列請求被 Cloudflare 403 擋住，未把它描述為網上訓練結算驗證。驗收圖：`assets/concepts/account-cloud-verified-v1.png`。

本機使用 `node server.mjs`；目前預設記憶體資料庫會在重啟後清空，網上 D1 才是持久存檔。自動測試使用 `npm test`，真實連線驗證可用 `node scripts/verify-live-account.mjs <遊戲網址>`，此指令會建立並移除即棄 Firebase 登入帳戶。

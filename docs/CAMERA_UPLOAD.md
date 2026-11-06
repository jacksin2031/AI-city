# 參加者手機拍照上傳（2026-11-06）

Owner：Main。此修復只影響已啟用私人照片收件功能的 `SpineParticipantFlow`（`/join`）及 `SpinePhotoPanel`（`/join/spine`）；不改變僅用於本地預覽、不向後端傳照片的 `LocalPhoto` 契約。

## 問題與處理

舊前端只接受 MIME 正好為 `image/jpeg`、`image/png`、`image/webp` 且不超過 8 MiB 的檔案；手機直接拍攝可能產生 HEIC/HEIF、沒有 MIME、超過 8 MiB 或超高解析度的照片，導致無法提交。新流程在瀏覽器本機按檔案簽名辨識 JPEG、PNG、WebP、HEIF，利用瀏覽器圖片解碼器轉為白底、長邊最多 2048px 的 JPEG，逐步縮小至 **8 MiB 以下**，然後按既有的三項獨立同意要求上傳。上傳 API 仍只接受 JPEG/PNG/WebP，並由後端 Sharp 再驗證、移除 metadata、存入私有儲存。

相機原始檔案大小上限為 **32 MiB**。不支援的圖片及無法解碼的 HEIC 會顯示日文錯誤，絕不直接把原始檔案送上伺服器。是否可解碼 HEIC 取決於手機瀏覽器及作業系統；不能解碼時提示改用 JPEG 相機設定。瀏覽器不會刪除相簿/相機保留的原圖，沒有授權便不會上傳。選圖、重新選圖、離開畫面時亦會取消過期的轉換結果。

## 驗證

- `prepare-photo.test.ts` 驗證格式簽名、尺寸縮放、空檔與超大檔拒絕、HEIC 轉 JPEG（解碼器模擬）、解碼失敗不誤傳。
- 完整型別檢查與相關照片服務測試應通過。
- 使用獨立本機測試頁、Chromium 和 Playwright 對手機 `capture="user"` 輸入執行兩項短期驗證：超過 8 MiB 的 JPEG 拍攝檔案經轉換後成功通過前端提交流程（確認 POST 為 image/jpeg、實際 bytes 不超過 8 MiB）；偽造 HEIC 的無效檔案顯示錯誤，沒有發出 POST。這是模擬設備檔案的瀏覽器測試，不是 iOS/Android 實機或雲端儲存驗收。

仍需於實際手機和已配置的 Cloud Run/Firestore/GCS 檢查拍照 → 相片提交 → Worker 生成 → 參加者卡片 → 平板顯示的完整鏈路。

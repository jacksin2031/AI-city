# Spine 後髮高度對齊修復交接報告

**日期**：2026-11-06
**基準**：`F:\資料夾\文件\ChatGPT\AI-city-main`，branch `fix/restore-spine-3d`
**相關 commit**：`ca2e9b4`（fix(spine): align rear hair height with head-alpha-fit-008）

---

## 1. 問題起點

雲端 Spine 任務自動檢查失敗，回報：

```
Spine task held for review. {"claimed":1,"cleaned":0}
```

使用者情境：從參加者頁面上傳圖片 → 進入輪迴 → 自動檢查失敗。

---

## 2. 根因（實證，非推測）

### 2.1 `head_hair_height` 被頭部 union 夾死

`spine_skin_tool/hair_stages.py` 的 `bounds()` 原本寫成：

```python
union_top    = max(hair_top,    head_top)      # head_top = +head_height/2
union_bottom = min(hair_bottom, head_bottom)   # head_bottom = -head_height/2
head_hair_height = union_top - union_bottom
```

只要後髮「蓋滿整個頭」，`union_top` 被頭頂夾住、`union_bottom` 被頭底夾住，
於是 `head_hair_height` **恆等於頭高（249）**，與髮型實際高度完全無關。

`review.py` L138 用它判斷：

```python
if em['height_alignment']['height_difference_fraction'] > .08:
    issues.append(finding('HEIGHT_MISMATCH','HAIR_BACK',...))
```

**結論：這個指標在後髮蓋滿頭時飽和，任何擺放參數都無法讓它下降——數學上無解。**

### 2.2 搜尋自由度不足

`character.region()` 的 `width` 與 `height` 共用同一個 `scale`（等比縮放），
而 `fit_pair()` 又把 `back_top` 硬釘在 `f['head_hair_top']`。

**實際掃描證明**：

| 搜尋方式                 | 可行解數（cov≥0.98 且 delta≤0.08） |
| ------------------------ | ---------------------------------- |
| 原搜尋（僅等比寬度）     | **0**                              |
| 放開 `back_top` ±80 單位 | **0**                              |

放開 `back_top` 無效，因為它是**整體平移**，`head_hair_height` 不變。

---

## 3. 修復：`head-alpha-fit-008`

### 3.1 新增垂直縮放自由度（opt-in）

`character.py` — `region()` 新增 `vertical_scale=1.0`：

```python
sv = scale * vertical_scale
return {
  ...,
  'x': top - (h/2 - y0) * sv,     # 上緣錨定
  'height': h * sv,               # 向下延展
  ...
}, {'vertical_scale': sv, ...}
```

`vertical_scale=1.0` 時與原行為**逐位元相同**（已驗證）。

### 3.2 新增不受 union 影響的指標

`hair_stages.py` — `bounds()` 新增 `hair_height`：

```python
'hair_height': round(top - bottom, 6)   # 真實髮型高度，不經 union 夾擠
```

### 3.3 008 的搜尋策略

`fit_pair(..., non_uniform=True)`：

- **覆蓋率當硬地板**：`if cov < .98: continue`
- **真實高度當目標**：`delta = abs(b['hair_height'] - f['hair_height']) / f['hair_height']`
- 搜尋 `sy ∈ [0.70, 1.20]` × `width ∈ [1.00, 1.40] × head_width`

### 3.4 註冊

- `hair_fit.py`：允許清單加 `head-alpha-fit-008`；分派 `non_uniform=revision=='head-alpha-fit-008'`
- `runtime/versions.toml`：`hair_fit_revision = "head-alpha-fit-008"`

**`head-alpha-fit-006` 與 `-007` 的程式路徑與輸出完全不變**（`validate()` 靠重算比對，改既有 revision 會使舊 bundle 失效）。

---

## 4. 驗證結果

### 4.1 舊候選圖（本機，008 成功）

|       | 007             | 008         |
| ----- | --------------- | ----------- |
| delta | 0.1654          | **0.0012**  |
| 狀態  | REQUIRES_REVIEW | **MATCHED** |
| cov   | 0.9988          | 0.9807      |

### 4.2 雲端實跑（任務 `spine-3f6d5ec3`，008 部分成功）

| 指標                  | 007             | 008 實跑        |
| --------------------- | --------------- | --------------- |
| **`HEIGHT_MISMATCH`** | ❌ 出現         | ✅ **完全消失** |
| delta                 | 0.1067          | 0.106651        |
| `back_scale_y`        | —               | 0.95            |
| rear_cov              | —               | 0.980534        |
| 最終狀態              | REQUIRES_REVIEW | REQUIRES_REVIEW |

**008 的目標（消除 HEIGHT_MISMATCH）達成**，但 `delta` 仍 > 0.08，gate 不過。

### 4.3 為何這張新圖仍無解

掃描完整 frontier：

| 搜尋                     | 結果     |
| ------------------------ | -------- |
| `cov≥0.98 且 delta≤0.08` | **0 個** |
| 覆蓋達標時最佳 delta     | 0.1033   |
| delta≈0.0002 時覆蓋率    | 0.82     |

**對照舊圖**：覆蓋 0.9807 時 delta 可到 0.0012。

**結論：008 有效，但效力取決於生成圖的長寬比。**
當後髮圖又高又窄時，「蓋滿整個頭」與「與前髮等高」數學上互斥。
這是**圖源端生成品質波動**，不是 fit 演算法的 bug。

---

## 5. 品質保證

| 驗證項                         | 結果                                                               |
| ------------------------------ | ------------------------------------------------------------------ |
| 回歸測試（344 項，跑兩輪）     | 失敗清單 `Compare-Object` **完全一致**，0 項新失敗                 |
| 對照驗證（`git stash` 乾淨版） | 那 5 項**同樣失敗**                                                |
| 5 項失敗原因                   | `spine-lab\library` 不存在 → `FileNotFoundError`，**既有環境缺檔** |
| 確定性                         | 008 連跑 5 次、007 連跑 3 次皆一致                                 |
| 007 是否被污染                 | **無 `back_scale_y`**，行為不變                                    |

---

## 6. 未解問題

### 6.1 前髮側邊缺口

`side_boundary_max_uncovered_run_head_fraction = 0.0503`（門檻 ≤0.03）

- **007 與 008 數值完全相同** → 與本次改動無關
- 已證明：要蓋滿需把前髮放到頭寬 **1.9 倍**（明顯過大，不可接受）
- 試過在 `solve_front` 加 `side_aware` 成本項，**結果不變**，已還原
- 判定：**圖源形狀問題，非擺放可修**

### 6.2 `hard.status = UNKNOWN`

不是 `FAIL`，但也不是 `PASS`。defects 是 6 個 `RAW_ALPHA_OUTLIERS` / MINOR。

### 6.3 `spine-lab\library` 參考素材缺失

導致 344 項回歸中固定 5 項失敗。需補素材才能全綠。

---

## 7. 建議下一步

**繼續調 fit 是死路。** 真正的瓶頸在生成端：

1. 改後髮生成的 prompt，加上**具體的長寬比約束**
   （例：`REAR hair must be at most 1.05× the FRONT hair's height`）
2. 或改 `hair_stages.bare_prompt()` 中「FRONT and REAR must share the same overall
   head-plus-hair volume」這條抽象規則——**8B 級模型對抽象規則遵守度差，需具體數字**
3. 重跑生成驗證，確認新 prompt 的後髮長寬比接近前髮

---

## 8. 環境與操作要點

- **基準**：`F:\資料夾\文件\ChatGPT\AI-city-main`（唯一有效基準）
- 回歸測試入口：`python scripts/maintenance.py regression`（**344 項**，非 pytest；venv 無 pytest）
- 直接跑單項需 `PYTHONPATH=src;tests`；`tests/` 無 `__init__.py`，`unittest discover` 不接受
- 回歸一輪約 **20-25 分鐘**；測試進行中編輯 `src/` 會遇 `Win32 1175` 佔用
- **雲端 worker 在本機執行**，讀本機 `SpineSkinTool_v1.0` → 改本機 src 即改雲端行為，**不需重新部署網頁**
- 佇列：Firestore `visitorExhibitions/preview-visitors-20261019/jobs`，doc id 為 `spine-spine-<uuid>`
- Worker claim 條件（`jobs.ts` L229-236）：`state==='QUEUED'` 且 `photoStorage==='CLOUD_PRIVATE'` 且 `photoGeneration!==undefined` 且 session 未過期
- 任務狀態欄位是 **`state`**（不是 `status`）
- 列出任務需用 Node + `@google-cloud/firestore`（`gcloud` 無列 doc 子命令）

---

## 9. 本輪操作失誤（誠實記錄）

- 多次送出**佔位符與殘缺的工具參數**，誤建 `F:\資料夾\Desktop\x`、`y`、`SHORT_PLACEHOLDER`、`Desktop\資料夾\.probe-hairfit\`
- 誤寫 30 bytes 垃圾記憶（已用正確內容覆寫）
- 探索階段的探測腳本留在 `F:\資料夾\Desktop\.probe-hairfit\`（不影響專案）

**教訓：送工具參數前必須逐項確認值正確，不確定就重寫。**

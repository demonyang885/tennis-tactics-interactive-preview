# RallyPath U9 U10 戰術庫全庫審查

日期：2026-10-02（香港時間）。基線：v0.3.7，main `60c44fd8fc6c167336062f82f769ae698d0944f4`。分支：`review/u10-tactic-library`。

本輪審查 22 條戰術及 8 組組合，共 30 個條目。依使用者的新硬紅線，**保留 0、降級 0、下架 30**。所有條目都沒有符合 2–6 字要求的現行 cue，並有簡體內容；8 組組合另外缺少父層 `mistake`／`why`。下架裁決針對本版本的入庫資格，作者整改後可以重審。

報告逐條保留原句、欄位、來源及修改方向；沒有代寫戰術，也沒有修改源碼、version.json 或線上內容。沒有合格條目進入評分，本輪不提出 12–20 條精選名單。

## 範圍與判定口徑

- 依 [U9 U10 審查規則](U10_LIBRARY_REVIEW_RULES.md) 執行全庫模式。
- 讀取實際匯出結果：`library.ts` 與 `expansion.ts` 的 22 個 tactics／22 個同 id Guides，及 8 個 combinations；`next.ts` 目前沒有新增條目。組合的 16 個 variants 是其子內容，不另計 16 條戰術；19 個階段 cue 不另計 19 條組合。
- `when`／`mistake` 從 Tactic 讀取，`why` 從同 id Guide 讀取。22 條單項均有這三個欄位；沒有將資料分散在兩個物件誤報為缺欄位。
- 22 個單項 cue 為 9–16 個漢字；19 個組合階段 cue 為 14–21 個漢字。計數已排除標點，每條仍超過 6 字。
- 確定硬線失敗後停止放行與評分。下文補列同一記錄中可直接核對的語言／缺欄位證據，不用得分抵銷硬線。
- R1 未以標籤或術語推定通過／超齡；無法確定使用者執行能力的項目需家長確認。R4 與 R6 未作整庫放行，沒有只憑相似名稱判重複。signals／requires 匹配、U10 層級排序及畫板實際適配留待硬線修正後重審。

## 組合缺欄位的共同證據

[src/content/types.ts:69](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/types.ts#L69) 的原文：

```typescript
export type Combination = {
  id: string;
  name: string;
  category: Category;
  goal: string;
  when: string;
  series?: string;
  stages: CombinationStage[];
  variants: CombinationVariant[];
};
```

逐一讀取下方 8 個父組合完整物件，均沒有 `mistake` 和 `why`。`goal`、`transition` 或被引用單項的 Guide 不能由審查員代填為組合欄位。每條 R5 記錄引用自己的 when 並連到同一父物件；完整父物件的來源亦列於該節。

## 單項戰術

### serve-plus-one

- verdict：**下架**
- 一句話理由：cue 有 13 個漢字，超過 R2 的 2–6 字硬門檻；同句使用簡體字，亦不符 R3。

具體問題：

- **R2 · `cue`**：`serve-plus-one.cue`：「发球前就想好下一拍的大方向。」——[src/content/library.ts:294](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L294)。逐字計數為 13 個漢字（不計逗號、頓號、句號）；口訣上限是 6 字。這是完整句子而非 2–6 字的上場提示，硬門檻失敗即下架，不進入評分。

- **R3 · `cue`**：`serve-plus-one.cue`：「发球前就想好下一拍的大方向。」——[src/content/library.ts:294](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L294)。原句存在簡體字：「发」應為「發」；不符合繁體中文硬門檻。僅引用這個已核實的語言問題，沒有據此推定年齡能力。

修改方向：由作者另行收斂為 2–6 字、只提示一個當下動作的口訣；本次審查不提供改寫。 依繁體中文與短句規則校準文案後重新送審；硬門檻尚未全過，不評分、不列入 U10 精選。

### return-middle

- verdict：**下架**
- 一句話理由：cue 有 10 個漢字，超過 R2 的 2–6 字硬門檻；同句使用簡體字，亦不符 R3。

具體問題：

- **R2 · `cue`**：`return-middle.cue`：「缩短挥拍，先过网、再打深。」——[src/content/library.ts:303](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L303)。逐字計數為 10 個漢字（不計逗號、頓號、句號）；口訣上限是 6 字。這是完整句子而非 2–6 字的上場提示，硬門檻失敗即下架，不進入評分。

- **R3 · `cue`**：`return-middle.cue`：「缩短挥拍，先过网、再打深。」——[src/content/library.ts:303](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L303)。原句存在簡體字：「缩」應為「縮」、「挥」應為「揮」；不符合繁體中文硬門檻。僅引用這個已核實的語言問題，沒有據此推定年齡能力。

修改方向：由作者另行收斂為 2–6 字、只提示一個當下動作的口訣；本次審查不提供改寫。 依繁體中文與短句規則校準文案後重新送審；硬門檻尚未全過，不評分、不列入 U10 精選。

### three-cross-one-line

- verdict：**下架**
- 一句話理由：cue 有 11 個漢字，超過 R2 的 2–6 字硬門檻；同句使用簡體字，亦不符 R3。

具體問題：

- **R2 · `cue`**：`three-cross-one-line.cue`：「没等到短球，就继续走斜线。」——[src/content/library.ts:312](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L312)。逐字計數為 11 個漢字（不計逗號、頓號、句號）；口訣上限是 6 字。這是完整句子而非 2–6 字的上場提示，硬門檻失敗即下架，不進入評分。

- **R3 · `cue`**：`three-cross-one-line.cue`：「没等到短球，就继续走斜线。」——[src/content/library.ts:312](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L312)。原句存在簡體字：「没」應為「沒」、「继」應為「繼」；不符合繁體中文硬門檻。僅引用這個已核實的語言問題，沒有據此推定年齡能力。

修改方向：由作者另行收斂為 2–6 字、只提示一個當下動作的口訣；本次審查不提供改寫。 依繁體中文與短句規則校準文案後重新送審；硬門檻尚未全過，不評分、不列入 U10 精選。

### defend-high-middle

- verdict：**下架**
- 一句話理由：cue 有 16 個漢字，超過 R2 的 2–6 字硬門檻；同句使用簡體字，亦不符 R3。

具體問題：

- **R2 · `cue`**：`defend-high-middle.cue`：「先打高深球，再回到能兼顾两侧的位置。」——[src/content/library.ts:318](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L318)。逐字計數為 16 個漢字（不計逗號、頓號、句號）；口訣上限是 6 字。這是完整句子而非 2–6 字的上場提示，硬門檻失敗即下架，不進入評分。

- **R3 · `cue`**：`defend-high-middle.cue`：「先打高深球，再回到能兼顾两侧的位置。」——[src/content/library.ts:318](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L318)。原句存在簡體字：「顾」應為「顧」、「两」應為「兩」；不符合繁體中文硬門檻。僅引用這個已核實的語言問題，沒有據此推定年齡能力。

修改方向：由作者另行收斂為 2–6 字、只提示一個當下動作的口訣；本次審查不提供改寫。 依繁體中文與短句規則校準文案後重新送審；硬門檻尚未全過，不評分、不列入 U10 精選。

### big-target-pressure

- verdict：**下架**
- 一句話理由：cue 有 10 個漢字，超過 R2 的 2–6 字硬門檻；同句使用簡體字，亦不符 R3。

具體問題：

- **R2 · `cue`**：`big-target-pressure.cue`：「先呼吸，再选一个大目标。」——[src/content/library.ts:321](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L321)。逐字計數為 10 個漢字（不計逗號、頓號、句號）；口訣上限是 6 字。這是完整句子而非 2–6 字的上場提示，硬門檻失敗即下架，不進入評分。

- **R3 · `cue`**：`big-target-pressure.cue`：「先呼吸，再选一个大目标。」——[src/content/library.ts:321](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L321)。原句存在簡體字：「选」應為「選」、「个」應為「個」；不符合繁體中文硬門檻。僅引用這個已核實的語言問題，沒有據此推定年齡能力。

修改方向：由作者另行收斂為 2–6 字、只提示一個當下動作的口訣；本次審查不提供改寫。 依繁體中文與短句規則校準文案後重新送審；硬門檻尚未全過，不評分、不列入 U10 精選。

### body-serve

- verdict：**下架**
- 一句話理由：cue 有 14 個漢字，超過 R2 的 2–6 字硬門檻；同句使用簡體字，亦不符 R3。

具體問題：

- **R2 · `cue`**：`body-serve.cue`：「目标放大到身体周围，不追求压线。」——[src/content/library.ts:297](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L297)。逐字計數為 14 個漢字（不計逗號、頓號、句號）；口訣上限是 6 字。這是完整句子而非 2–6 字的上場提示，硬門檻失敗即下架，不進入評分。

- **R3 · `cue`**：`body-serve.cue`：「目标放大到身体周围，不追求压线。」——[src/content/library.ts:297](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L297)。原句存在簡體字：「标」應為「標」、「体」應為「體」；不符合繁體中文硬門檻。僅引用這個已核實的語言問題，沒有據此推定年齡能力。

修改方向：由作者另行收斂為 2–6 字、只提示一個當下動作的口訣；本次審查不提供改寫。 依繁體中文與短句規則校準文案後重新送審；硬門檻尚未全過，不評分、不列入 U10 精選。

### return-cross

- verdict：**下架**
- 一句話理由：cue 有 12 個漢字，超過 R2 的 2–6 字硬門檻；同句使用簡體字，亦不符 R3。

具體問題：

- **R2 · `cue`**：`return-cross.cue`：「斜线空间大，先让球多飞一段。」——[src/content/library.ts:306](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L306)。逐字計數為 12 個漢字（不計逗號、頓號、句號）；口訣上限是 6 字。這是完整句子而非 2–6 字的上場提示，硬門檻失敗即下架，不進入評分。

- **R3 · `cue`**：`return-cross.cue`：「斜线空间大，先让球多飞一段。」——[src/content/library.ts:306](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L306)。原句存在簡體字：「线」應為「線」、「间」應為「間」；不符合繁體中文硬門檻。僅引用這個已核實的語言問題，沒有據此推定年齡能力。

修改方向：由作者另行收斂為 2–6 字、只提示一個當下動作的口訣；本次審查不提供改寫。 依繁體中文與短句規則校準文案後重新送審；硬門檻尚未全過，不評分、不列入 U10 精選。

### approach-follow

- verdict：**下架**
- 一句話理由：cue 有 13 個漢字，超過 R2 的 2–6 字硬門檻；同句使用簡體字，亦不符 R3。

具體問題：

- **R2 · `cue`**：`approach-follow.cue`：「打一拍、跟一步，接近网前要分腿。」——[src/content/library.ts:315](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L315)。逐字計數為 13 個漢字（不計逗號、頓號、句號）；口訣上限是 6 字。這是完整句子而非 2–6 字的上場提示，硬門檻失敗即下架，不進入評分。

- **R3 · `cue`**：`approach-follow.cue`：「打一拍、跟一步，接近网前要分腿。」——[src/content/library.ts:315](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L315)。原句存在簡體字：「网」應為「網」；不符合繁體中文硬門檻。僅引用這個已核實的語言問題，沒有據此推定年齡能力。

修改方向：由作者另行收斂為 2–6 字、只提示一個當下動作的口訣；本次審查不提供改寫。 依繁體中文與短句規則校準文案後重新送審；硬門檻尚未全過，不評分、不列入 U10 精選。

### second-serve-target

- verdict：**下架**
- 一句話理由：cue 有 15 個漢字，超過 R2 的 2–6 字硬門檻；同句使用簡體字，亦不符 R3。

具體問題：

- **R2 · `cue`**：`second-serve-target.cue`：「保持熟悉节奏，给过网与落点留余量。」——[src/content/library.ts:300](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L300)。逐字計數為 15 個漢字（不計逗號、頓號、句號）；口訣上限是 6 字。這是完整句子而非 2–6 字的上場提示，硬門檻失敗即下架，不進入評分。

- **R3 · `cue`**：`second-serve-target.cue`：「保持熟悉节奏，给过网与落点留余量。」——[src/content/library.ts:300](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L300)。原句存在簡體字：「节」應為「節」、「给」應為「給」；不符合繁體中文硬門檻。僅引用這個已核實的語言問題，沒有據此推定年齡能力。

修改方向：由作者另行收斂為 2–6 字、只提示一個當下動作的口訣；本次審查不提供改寫。 依繁體中文與短句規則校準文案後重新送審；硬門檻尚未全過，不評分、不列入 U10 精選。

### attack-second-serve

- verdict：**下架**
- 一句話理由：cue 有 10 個漢字，超過 R2 的 2–6 字硬門檻；同句使用簡體字，亦不符 R3。

具體問題：

- **R2 · `cue`**：`attack-second-serve.cue`：「先判断弹跳，再到位打深。」——[src/content/library.ts:309](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L309)。逐字計數為 10 個漢字（不計逗號、頓號、句號）；口訣上限是 6 字。這是完整句子而非 2–6 字的上場提示，硬門檻失敗即下架，不進入評分。

- **R3 · `cue`**：`attack-second-serve.cue`：「先判断弹跳，再到位打深。」——[src/content/library.ts:309](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L309)。原句存在簡體字：「弹」應為「彈」；不符合繁體中文硬門檻。僅引用這個已核實的語言問題，沒有據此推定年齡能力。

修改方向：由作者另行收斂為 2–6 字、只提示一個當下動作的口訣；本次審查不提供改寫。 依繁體中文與短句規則校準文案後重新送審；硬門檻尚未全過，不評分、不列入 U10 精選。

### dip-at-feet

- verdict：**下架**
- 一句話理由：cue 有 16 個漢字，超過 R2 的 2–6 字硬門檻；同句使用簡體字，亦不符 R3。

具體問題：

- **R2 · `cue`**：`dip-at-feet.cue`：「先让对手低点击球，再决定穿越或挑高。」——[src/content/expansion.ts:70](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/expansion.ts#L70)。逐字計數為 16 個漢字（不計逗號、頓號、句號）；口訣上限是 6 字。這是完整句子而非 2–6 字的上場提示，硬門檻失敗即下架，不進入評分。

- **R3 · `cue`**：`dip-at-feet.cue`：「先让对手低点击球，再决定穿越或挑高。」——[src/content/expansion.ts:70](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/expansion.ts#L70)。原句存在簡體字：「让」應為「讓」、「对」應為「對」；不符合繁體中文硬門檻。僅引用這個已核實的語言問題，沒有據此推定年齡能力。

修改方向：由作者另行收斂為 2–6 字、只提示一個當下動作的口訣；本次審查不提供改寫。 依繁體中文與短句規則校準文案後重新送審；硬門檻尚未全過，不評分、不列入 U10 精選。

### first-volley-deep

- verdict：**下架**
- 一句話理由：cue 為 15 個漢字，超出 2–6 字硬門檻；原文另有繁體要求不符。

具體問題：

- **R2 · `cue`**：`first-volley-deep.cue`：「第一截击先稳深度，下一拍再找角度。」——[src/content/expansion.ts:90](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/expansion.ts#L90)。去除標點後共有 15 個漢字，超過必須 2–6 字的 cue 硬上限；已足以判定下架，未進入評分。

- **R3 · `cue`**：`first-volley-deep.cue`：「第一截击先稳深度，下一拍再找角度。」——[src/content/expansion.ts:90](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/expansion.ts#L90)。原句含簡體字「击、稳」，不符合繁體中文紅線。

修改方向：由作者將 cue 壓縮為 2–6 個漢字，聚焦第一截擊的深度優先，再重新送審。 統一繁體並整理短句，保留我方與對手的行動歸屬。 9 歲使用者能否直接執行尚未驗證，需家長確認；已有 when、mistake 及同 id guide.why，未判定缺字段。

### second-volley-open-court

- verdict：**下架**
- 一句話理由：cue 為 14 個漢字，超出 2–6 字硬門檻；原文另有繁體要求不符。

具體問題：

- **R2 · `cue`**：`second-volley-open-court.cue`：「第一拍先深，第二拍高了再找空档。」——[src/content/expansion.ts:110](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/expansion.ts#L110)。去除標點後共有 14 個漢字，超過必須 2–6 字的 cue 硬上限；已足以判定下架，未進入評分。

- **R3 · `cue`**：`second-volley-open-court.cue`：「第一拍先深，第二拍高了再找空档。」——[src/content/expansion.ts:110](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/expansion.ts#L110)。原句含簡體字「档」，不符合繁體中文紅線。

修改方向：由作者將 cue 壓縮為 2–6 個漢字，聚焦高慢回球出現後的選擇，再重新送審。 統一繁體並整理短句，保留我方與對手的行動歸屬。 9 歲使用者能否直接執行尚未驗證，需家長確認；已有 when、mistake 及同 id guide.why，未判定缺字段。

### overhead-big-target

- verdict：**下架**
- 一句話理由：cue 為 12 個漢字，超出 2–6 字硬門檻；原文另有繁體要求不符。

具體問題：

- **R2 · `cue`**：`overhead-big-target.cue`：「能到位才高压，困难球先落地。」——[src/content/expansion.ts:130](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/expansion.ts#L130)。去除標點後共有 12 個漢字，超過必須 2–6 字的 cue 硬上限；已足以判定下架，未進入評分。

- **R3 · `cue`**：`overhead-big-target.cue`：「能到位才高压，困难球先落地。」——[src/content/expansion.ts:130](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/expansion.ts#L130)。原句含簡體字「压、难」，不符合繁體中文紅線。

修改方向：由作者將 cue 壓縮為 2–6 個漢字，聚焦是否能平衡到位的判斷，再重新送審。 統一繁體並整理短句，保留我方與對手的行動歸屬。 9 歲使用者能否直接執行尚未驗證，需家長確認；已有 when、mistake 及同 id guide.why，未判定缺字段。

### wrong-foot

- verdict：**下架**
- 一句話理由：cue 為 11 個漢字，超出 2–6 字硬門檻；原文另有繁體要求不符。

具體問題：

- **R2 · `cue`**：`wrong-foot.cue`：「先看对手脚步，再决定回头。」——[src/content/library.ts:282](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L282)。去除標點後共有 11 個漢字，超過必須 2–6 字的 cue 硬上限；已足以判定下架，未進入評分。

- **R3 · `cue`**：`wrong-foot.cue`：「先看对手脚步，再决定回头。」——[src/content/library.ts:282](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L282)。原句含簡體字「对、脚、决、头」，不符合繁體中文紅線。

修改方向：由作者將 cue 壓縮為 2–6 個漢字，聚焦對手仍在回位的信號，再重新送審。 統一繁體並整理短句，保留我方與對手的行動歸屬。 9 歲使用者能否直接執行尚未驗證，需家長確認；已有 when、mistake 及同 id guide.why，未判定缺字段。

### backhand

- verdict：**下架**
- 一句話理由：cue 為 11 個漢字，超出 2–6 字硬門檻；原文另有繁體要求不符。

具體問題：

- **R2 · `cue`**：`backhand.cue`：「先找弱侧，等短球再打空档。」——[src/content/library.ts:283](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L283)。去除標點後共有 11 個漢字，超過必須 2–6 字的 cue 硬上限；已足以判定下架，未進入評分。

- **R3 · `cue`**：`backhand.cue`：「先找弱侧，等短球再打空档。」——[src/content/library.ts:283](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L283)。原句含簡體字「侧、档」，不符合繁體中文紅線。

修改方向：由作者將 cue 壓縮為 2–6 個漢字，聚焦短球出現後的選擇，再重新送審。 統一繁體並整理短句，保留我方與對手的行動歸屬。 9 歲使用者能否直接執行尚未驗證，需家長確認；已有 when、mistake 及同 id guide.why，未判定缺字段。

### drop-pass

- verdict：**下架**
- 一句話理由：cue 為 10 個漢字，超出 2–6 字硬門檻；原文另有繁體要求不符。

具體問題：

- **R2 · `cue`**：`drop-pass.cue`：「对手真的上来，才打穿越。」——[src/content/library.ts:284](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L284)。去除標點後共有 10 個漢字，超過必須 2–6 字的 cue 硬上限；已足以判定下架，未進入評分。

- **R3 · `cue`**：`drop-pass.cue`：「对手真的上来，才打穿越。」——[src/content/library.ts:284](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L284)。原句含簡體字「对、来」，不符合繁體中文紅線。

修改方向：由作者將 cue 壓縮為 2–6 個漢字，聚焦對手確實上網的信號，再重新送審。 統一繁體並整理短句，保留我方與對手的行動歸屬。 9 歲使用者能否直接執行尚未驗證，需家長確認；已有 when、mistake 及同 id guide.why，未判定缺字段。

### drop-lob

- verdict：**下架**
- 一句話理由：cue 為 13 個漢字，超出 2–6 字硬門檻；原文另有繁體要求不符。

具體問題：

- **R2 · `cue`**：`drop-lob.cue`：「挑得高、落得深，比打得快更重要。」——[src/content/library.ts:285](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L285)。去除標點後共有 13 個漢字，超過必須 2–6 字的 cue 硬上限；已足以判定下架，未進入評分。

- **R3 · `when`**：`drop-lob.when`：「对手贴近球网、重心仍向前时。」——[src/content/library.ts:285](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L285)。原句含簡體字「对、贴、网、时」，不符合繁體中文紅線。本條 cue 的字形本身簡繁共用，語言違規證據取 when，不能聲稱 cue 含簡體異體字。

修改方向：由作者將 cue 壓縮為 2–6 個漢字，聚焦挑高的高度或深度優先，再重新送審。 統一繁體並整理短句，保留我方與對手的行動歸屬。 9 歲使用者能否直接執行尚未驗證，需家長確認；已有 when、mistake 及同 id guide.why，未判定缺字段。

### wide-middle

- verdict：**下架**
- 一句話理由：cue 為 14 個漢字，超出 2–6 字硬門檻；原文另有繁體要求不符。

具體問題：

- **R2 · `cue`**：`wide-middle.cue`：「调动后打深中路，收住角度再准备。」——[src/content/library.ts:286](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L286)。去除標點後共有 14 個漢字，超過必須 2–6 字的 cue 硬上限；已足以判定下架，未進入評分。

- **R3 · `cue`**：`wide-middle.cue`：「调动后打深中路，收住角度再准备。」——[src/content/library.ts:286](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L286)。原句含簡體字「调、动、准、备」，不符合繁體中文紅線。

修改方向：由作者將 cue 壓縮為 2–6 個漢字，聚焦調動後收住角度的選擇，再重新送審。 統一繁體並整理短句，保留我方與對手的行動歸屬。 9 歲使用者能否直接執行尚未驗證，需家長確認；已有 when、mistake 及同 id guide.why，未判定缺字段。

### front-back

- verdict：**下架**
- 一句話理由：cue 為 9 個漢字，超出 2–6 字硬門檻；原文另有繁體要求不符。

具體問題：

- **R2 · `cue`**：`front-back.cue`：「短球要低，挑高要过头。」——[src/content/library.ts:287](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L287)。去除標點後共有 9 個漢字，超過必須 2–6 字的 cue 硬上限；已足以判定下架，未進入評分。

- **R3 · `cue`**：`front-back.cue`：「短球要低，挑高要过头。」——[src/content/library.ts:287](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L287)。原句含簡體字「过、头」，不符合繁體中文紅線。

修改方向：由作者將 cue 壓縮為 2–6 個漢字，聚焦一次前後調動的關鍵動作，再重新送審。 統一繁體並整理短句，保留我方與對手的行動歸屬。 9 歲使用者能否直接執行尚未驗證，需家長確認；已有 when、mistake 及同 id guide.why，未判定缺字段。

### moonball

- verdict：**下架**
- 一句話理由：cue 為 11 個漢字，超出 2–6 字硬門檻；原文另有繁體要求不符。

具體問題：

- **R2 · `cue`**：`moonball.cue`：「高过对手肩膀，落在底线前。」——[src/content/library.ts:288](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L288)。去除標點後共有 11 個漢字，超過必須 2–6 字的 cue 硬上限；已足以判定下架，未進入評分。

- **R3 · `cue`**：`moonball.cue`：「高过对手肩膀，落在底线前。」——[src/content/library.ts:288](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L288)。原句含簡體字「过、对、线」，不符合繁體中文紅線。

修改方向：由作者將 cue 壓縮為 2–6 個漢字，聚焦高深球的一個場上提示，再重新送審。 統一繁體並整理短句，保留我方與對手的行動歸屬。 9 歲使用者能否直接執行尚未驗證，需家長確認；已有 when、mistake 及同 id guide.why，未判定缺字段。

### serve-volley

- verdict：**下架**
- 一句話理由：cue 為 12 個漢字，超出 2–6 字硬門檻；原文另有繁體要求不符。

具體問題：

- **R2 · `cue`**：`serve-volley.cue`：「先分腿垫步，再决定截击方向。」——[src/content/library.ts:289](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L289)。去除標點後共有 12 個漢字，超過必須 2–6 字的 cue 硬上限；已足以判定下架，未進入評分。

- **R3 · `cue`**：`serve-volley.cue`：「先分腿垫步，再决定截击方向。」——[src/content/library.ts:289](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L289)。原句含簡體字「垫、决、击」，不符合繁體中文紅線。

修改方向：由作者將 cue 壓縮為 2–6 個漢字，聚焦接發觸球時的分腿時機，再重新送審。 統一繁體並整理短句，保留我方與對手的行動歸屬。 9 歲使用者能否直接執行尚未驗證，需家長確認；已有 when、mistake 及同 id guide.why，未判定缺字段。

## 組合戰術

### serve-open-finish

- verdict：**下架**
- 一句話理由：所有 stage.cue 均超過 2–6 字硬線、現有內容為簡體、組合本身缺 mistake 與 why；任一已足以下架，不評分。

具體問題：

- **R2 · `stages[0].cue`**：`serve-open-finish.stages[0].cue`：「发球先带开对手，下一拍看实际回球。」——[src/content/library.ts:343](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L343)。精確漢字數 15（不計標點）；超過 6 字上限。這是完整執行句，尚未提供合規上場提示詞；按硬線下架，不評分。

- **R2 · `stages[1].cue`**：`serve-open-finish.stages[1].cue`：「到位处理短球，向前补位并准备第一拍截击。」——[src/content/library.ts:348](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L348)。精確漢字數 18（不計標點）；超過 6 字上限。這是完整執行句，尚未提供合規上場提示詞；按硬線下架，不評分。

- **R3 · `name`**：`serve-open-finish.name`：「发球后抢先手」——[src/content/library.ts:336](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L336)。現有名稱為簡體；stage.cue、when 等也維持簡體，未符合繁體中文硬線。此判定沒有把名稱中的動作詞誤認為保證得分承諾。

- **R5 · `when`**：`serve-open-finish.when`：「轮到自己发球，能稳定控制发球方向，并已练过短球上网。」——[src/content/library.ts:339](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L339)。組合本身有 when；此原句是組合的使用情境／前提，沒有以子戰術 when 代填。組合自己的 mistake 與 why 仍缺失。

完整父物件：[src/content/library.ts:334](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L334)；實際父欄位為 `id`、`name`、`category`、`goal`、`when`、`stages`、`variants`，不含 `mistake`／`why`。

修改方向：由作者重整每階段的上場提示詞，使其符合 2–6 字；較長執行說明與 cue 分開，保留可觀察轉段條件。 把名稱與組合全文轉為繁體短句，再複核術語與我方／對手動作歸屬；不在此審查代寫替代內容。 在父組合層補齊 mistake、why 並同步型別／資料契約；勿把子戰術欄位、goal 或 transition 當成已補齊。 9 歲使用者的連續執行能力需家長確認，明確保留必要技能前提；不據戰術名稱臆測年齡適配。 修正紅線後再做 R4 歸屬及 R6 雙方原文查重與評分；本次未宣稱任何組合語義重複，也不為湊 12–20 條放行。

### return-build-approach

- verdict：**下架**
- 一句話理由：所有 stage.cue 均超過 2–6 字硬線、現有內容為簡體、組合本身缺 mistake 與 why；任一已足以下架，不評分。

具體問題：

- **R2 · `stages[0].cue`**：`return-build-approach.stages[0].cue`：「缩短准备，把接发送向深中路大区域。」——[src/content/library.ts:376](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L376)。精確漢字數 15（不計標點）；超過 6 字上限。這是完整執行句，尚未提供合規上場提示詞；按硬線下架，不評分。

- **R2 · `stages[1].cue`**：`return-build-approach.stages[1].cue`：「用稳定斜线相持，每拍观察回球深度。」——[src/content/library.ts:381](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L381)。精確漢字數 15（不計標點）；超過 6 字上限。這是完整執行句，尚未提供合規上場提示詞；按硬線下架，不評分。

- **R2 · `stages[2].cue`**：`return-build-approach.stages[2].cue`：「处理短球后随球补位，准备网前下一拍。」——[src/content/library.ts:386](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L386)。精確漢字數 16（不計標點）；超過 6 字上限。這是完整執行句，尚未提供合規上場提示詞；按硬線下架，不評分。

- **R3 · `name`**：`return-build-approach.name`：「接发稳住再上网」——[src/content/library.ts:369](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L369)。現有名稱為簡體；stage.cue、when 等也維持簡體，未符合繁體中文硬線。此判定沒有把名稱中的動作詞誤認為保證得分承諾。

- **R5 · `when`**：`return-build-approach.when`：「准备接发，尤其面对较快的内角或追身发球，希望清楚地进入这一分。」——[src/content/library.ts:372](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L372)。組合本身有 when；此原句是組合的使用情境／前提，沒有以子戰術 when 代填。組合自己的 mistake 與 why 仍缺失。

完整父物件：[src/content/library.ts:367](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L367)；實際父欄位為 `id`、`name`、`category`、`goal`、`when`、`stages`、`variants`，不含 `mistake`／`why`。

修改方向：由作者重整每階段的上場提示詞，使其符合 2–6 字；較長執行說明與 cue 分開，保留可觀察轉段條件。 把名稱與組合全文轉為繁體短句，再複核術語與我方／對手動作歸屬；不在此審查代寫替代內容。 在父組合層補齊 mistake、why 並同步型別／資料契約；勿把子戰術欄位、goal 或 transition 當成已補齊。 9 歲使用者的連續執行能力需家長確認，明確保留必要技能前提；不據戰術名稱臆測年齡適配。 修正紅線後再做 R4 歸屬及 R6 雙方原文查重與評分；本次未宣稱任何組合語義重複，也不為湊 12–20 條放行。

### pressure-read-recovery

- verdict：**下架**
- 一句話理由：所有 stage.cue 均超過 2–6 字硬線、現有內容為簡體、組合本身缺 mistake 與 why；任一已足以下架，不評分。

具體問題：

- **R2 · `stages[0].cue`**：`pressure-read-recovery.stages[0].cue`：「用可控深球压向较弱一侧，每拍重新看来球。」——[src/content/library.ts:414](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L414)。精確漢字數 18（不計標點）；超過 6 字上限。這是完整執行句，尚未提供合規上場提示詞；按硬線下架，不評分。

- **R2 · `stages[1].cue`**：`pressure-read-recovery.stages[1].cue`：「看准回位脚步，把球送回对手刚离开的区域。」——[src/content/library.ts:419](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L419)。精確漢字數 18（不計標點）；超過 6 字上限。這是完整執行句，尚未提供合規上場提示詞；按硬線下架，不評分。

- **R3 · `name`**：`pressure-read-recovery.name`：「压住弱侧再打回头」——[src/content/library.ts:407](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L407)。現有名稱為簡體；stage.cue、when 等也維持簡體，未符合繁體中文硬線。此判定沒有把名稱中的動作詞誤認為保證得分承諾。

- **R5 · `when`**：`pressure-read-recovery.when`：「已进入底线相持，你观察到对手某一侧更容易回浅，自己也能稳定维持球路。」——[src/content/library.ts:410](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L410)。組合本身有 when；此原句是組合的使用情境／前提，沒有以子戰術 when 代填。組合自己的 mistake 與 why 仍缺失。

完整父物件：[src/content/library.ts:405](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L405)；實際父欄位為 `id`、`name`、`category`、`goal`、`when`、`stages`、`variants`，不含 `mistake`／`why`。

修改方向：由作者重整每階段的上場提示詞，使其符合 2–6 字；較長執行說明與 cue 分開，保留可觀察轉段條件。 把名稱與組合全文轉為繁體短句，再複核術語與我方／對手動作歸屬；不在此審查代寫替代內容。 在父組合層補齊 mistake、why 並同步型別／資料契約；勿把子戰術欄位、goal 或 transition 當成已補齊。 9 歲使用者的連續執行能力需家長確認，明確保留必要技能前提；不據戰術名稱臆測年齡適配。 修正紅線後再做 R4 歸屬及 R6 雙方原文查重與評分；本次未宣稱任何組合語義重複，也不為湊 12–20 條放行。

### defend-reset-attack

- verdict：**下架**
- 一句話理由：所有 stage.cue 均超過 2–6 字硬線、現有內容為簡體、組合本身缺 mistake 與 why；任一已足以下架，不評分。

具體問題：

- **R2 · `stages[0].cue`**：`defend-reset-attack.stages[0].cue`：「用可控的高深中路争取时间，及时调整位置。」——[src/content/library.ts:447](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L447)。精確漢字數 18（不計標點）；超過 6 字上限。這是完整執行句，尚未提供合規上場提示詞；按硬線下架，不評分。

- **R2 · `stages[1].cue`**：`defend-reset-attack.stages[1].cue`：「重建稳定斜线，观察对手何时回短。」——[src/content/library.ts:452](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L452)。精確漢字數 14（不計標點）；超過 6 字上限。這是完整執行句，尚未提供合規上場提示詞；按硬線下架，不評分。

- **R2 · `stages[2].cue`**：`defend-reset-attack.stages[2].cue`：「短球打向可控目标，跟进并准备截击。」——[src/content/library.ts:457](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L457)。精確漢字數 15（不計標點）；超過 6 字上限。這是完整執行句，尚未提供合規上場提示詞；按硬線下架，不評分。

- **R3 · `name`**：`defend-reset-attack.name`：「防守脱困再进攻」——[src/content/library.ts:440](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L440)。現有名稱為簡體；stage.cue、when 等也維持簡體，未符合繁體中文硬線。此判定沒有把名稱中的動作詞誤認為保證得分承諾。

- **R5 · `when`**：`defend-reset-attack.when`：「底线回合中被拉向一侧，对手仍在后场，这一拍需要先防守。」——[src/content/library.ts:443](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L443)。組合本身有 when；此原句是組合的使用情境／前提，沒有以子戰術 when 代填。組合自己的 mistake 與 why 仍缺失。

完整父物件：[src/content/library.ts:438](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L438)；實際父欄位為 `id`、`name`、`category`、`goal`、`when`、`stages`、`variants`，不含 `mistake`／`why`。

修改方向：由作者重整每階段的上場提示詞，使其符合 2–6 字；較長執行說明與 cue 分開，保留可觀察轉段條件。 把名稱與組合全文轉為繁體短句，再複核術語與我方／對手動作歸屬；不在此審查代寫替代內容。 在父組合層補齊 mistake、why 並同步型別／資料契約；勿把子戰術欄位、goal 或 transition 當成已補齊。 9 歲使用者的連續執行能力需家長確認，明確保留必要技能前提；不據戰術名稱臆測年齡適配。 修正紅線後再做 R4 歸屬及 R6 雙方原文查重與評分；本次未宣稱任何組合語義重複，也不為湊 12–20 條放行。

### deep-short-net-choice

- verdict：**下架**
- 一句話理由：所有 stage.cue 均超過 2–6 字硬線、現有內容為簡體、組合本身缺 mistake 與 why；任一已足以下架，不評分。

具體問題：

- **R2 · `stages[0].cue`**：`deep-short-net-choice.stages[0].cue`：「用可控深球施压，观察对手是否持续守在后场。」——[src/content/library.ts:485](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L485)。精確漢字數 19（不計標點）；超過 6 字上限。這是完整執行句，尚未提供合規上場提示詞；按硬線下架，不評分。

- **R2 · `stages[1].cue`**：`deep-short-net-choice.stages[1].cue`：「小球带对手向前，接着看其站位再选身旁空档。」——[src/content/library.ts:490](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L490)。精確漢字數 19（不計標點）；超過 6 字上限。這是完整執行句，尚未提供合規上場提示詞；按硬線下架，不評分。

- **R3 · `name`**：`deep-short-net-choice.name`：「压深后引上网」——[src/content/library.ts:478](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L478)。現有名稱為簡體；stage.cue、when 等也維持簡體，未符合繁體中文硬線。此判定沒有把名稱中的動作詞誤認為保證得分承諾。

- **R5 · `when`**：`deep-short-net-choice.when`：「已在底线相持，对手站得较后；你有时间到位，也能控制低短球。」——[src/content/library.ts:481](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L481)。組合本身有 when；此原句是組合的使用情境／前提，沒有以子戰術 when 代填。組合自己的 mistake 與 why 仍缺失。

完整父物件：[src/content/library.ts:476](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L476)；實際父欄位為 `id`、`name`、`category`、`goal`、`when`、`stages`、`variants`，不含 `mistake`／`why`。

修改方向：由作者重整每階段的上場提示詞，使其符合 2–6 字；較長執行說明與 cue 分開，保留可觀察轉段條件。 把名稱與組合全文轉為繁體短句，再複核術語與我方／對手動作歸屬；不在此審查代寫替代內容。 在父組合層補齊 mistake、why 並同步型別／資料契約；勿把子戰術欄位、goal 或 transition 當成已補齊。 9 歲使用者的連續執行能力需家長確認，明確保留必要技能前提；不據戰術名稱臆測年齡適配。 修正紅線後再做 R4 歸屬及 R6 雙方原文查重與評分；本次未宣稱任何組合語義重複，也不為湊 12–20 條放行。

### pressure-point-clear-plan

- verdict：**下架**
- 一句話理由：所有 stage.cue 均超過 2–6 字硬線、現有內容為簡體、組合本身缺 mistake 與 why；任一已足以下架，不評分。

具體問題：

- **R2 · `stages[0].cue`**：`pressure-point-clear-plan.stages[0].cue`：「分开始前呼气，选一个熟悉的大目标。」——[src/content/library.ts:518](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L518)。精確漢字數 15（不計標點）；超過 6 字上限。這是完整執行句，尚未提供合規上場提示詞；按硬線下架，不評分。

- **R2 · `stages[1].cue`**：`pressure-point-clear-plan.stages[1].cue`：「用完整动作打斜线，逐拍读深浅，不急着追边线。」——[src/content/library.ts:523](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L523)。精確漢字數 19（不計標點）；超過 6 字上限。這是完整執行句，尚未提供合規上場提示詞；按硬線下架，不評分。

- **R2 · `stages[2].cue`**：`pressure-point-clear-plan.stages[2].cue`：「抓住可控短球，进攻后补位准备下一拍。」——[src/content/library.ts:528](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L528)。精確漢字數 16（不計標點）；超過 6 字上限。這是完整執行句，尚未提供合規上場提示詞；按硬線下架，不評分。

- **R3 · `name`**：`pressure-point-clear-plan.name`：「关键分稳中找机会」——[src/content/library.ts:511](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L511)。現有名稱為簡體；stage.cue、when 等也維持簡體，未符合繁體中文硬線。此判定沒有把名稱中的動作詞誤認為保證得分承諾。

- **R5 · `when`**：`pressure-point-clear-plan.when`：「面对 30-30、平分、破发点或连续失误，希望用熟悉的选择组织这一分。」——[src/content/library.ts:514](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L514)。組合本身有 when；此原句是組合的使用情境／前提，沒有以子戰術 when 代填。組合自己的 mistake 與 why 仍缺失。

完整父物件：[src/content/library.ts:509](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L509)；實際父欄位為 `id`、`name`、`category`、`goal`、`when`、`stages`、`variants`，不含 `mistake`／`why`。

修改方向：由作者重整每階段的上場提示詞，使其符合 2–6 字；較長執行說明與 cue 分開，保留可觀察轉段條件。 把名稱與組合全文轉為繁體短句，再複核術語與我方／對手動作歸屬；不在此審查代寫替代內容。 在父組合層補齊 mistake、why 並同步型別／資料契約；勿把子戰術欄位、goal 或 transition 當成已補齊。 9 歲使用者的連續執行能力需家長確認，明確保留必要技能前提；不據戰術名稱臆測年齡適配。 修正紅線後再做 R4 歸屬及 R6 雙方原文查重與評分；本次未宣稱任何組合語義重複，也不為湊 12–20 條放行。

### net-player-low-first

- verdict：**下架**
- 一句話理由：所有 stage.cue 均超過 2–6 字硬線、現有內容為簡體、組合本身缺 mistake 與 why；任一已足以下架，不評分。

具體問題：

- **R2 · `stages[0].cue`**：`net-player-low-first.stages[0].cue`：「用有过网余量的旋转，把第一球压向对手脚下附近。」——[src/content/expansion.ts:153](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/expansion.ts#L153)。精確漢字數 21（不計標點）；超過 6 字上限。這是完整執行句，尚未提供合規上場提示詞；按硬線下架，不評分。

- **R2 · `stages[1].cue`**：`net-player-low-first.stages[1].cue`：「重新确认对手位置，有侧向空间才把球穿过身旁。」——[src/content/expansion.ts:158](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/expansion.ts#L158)。精確漢字數 20（不計標點）；超過 6 字上限。這是完整執行句，尚未提供合規上場提示詞；按硬線下架，不評分。

- **R3 · `name`**：`net-player-low-first.name`：「对手上网：先压低再选」——[src/content/expansion.ts:145](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/expansion.ts#L145)。現有名稱為簡體；stage.cue、when 等也維持簡體，未符合繁體中文硬線。此判定沒有把名稱中的動作詞誤認為保證得分承諾。

- **R5 · `when`**：`net-player-low-first.when`：「对手正在向网前推进，你仍能平衡击球并看清其位置。」——[src/content/expansion.ts:149](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/expansion.ts#L149)。組合本身有 when；此原句是組合的使用情境／前提，沒有以子戰術 when 代填。組合自己的 mistake 與 why 仍缺失。

完整父物件：[src/content/expansion.ts:143](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/expansion.ts#L143)；實際父欄位為 `id`、`name`、`category`、`series`、`goal`、`when`、`stages`、`variants`，不含 `mistake`／`why`。

修改方向：由作者重整每階段的上場提示詞，使其符合 2–6 字；較長執行說明與 cue 分開，保留可觀察轉段條件。 把名稱與組合全文轉為繁體短句，再複核術語與我方／對手動作歸屬；不在此審查代寫替代內容。 在父組合層補齊 mistake、why 並同步型別／資料契約；勿把子戰術欄位、goal 或 transition 當成已補齊。 9 歲使用者的連續執行能力需家長確認，明確保留必要技能前提；不據戰術名稱臆測年齡適配。 修正紅線後再做 R4 歸屬及 R6 雙方原文查重與評分；本次未宣稱任何組合語義重複，也不為湊 12–20 條放行。

### approach-first-volley-deep

- verdict：**下架**
- 一句話理由：所有 stage.cue 均超過 2–6 字硬線、現有內容為簡體、組合本身缺 mistake 與 why；任一已足以下架，不評分。

具體問題：

- **R2 · `stages[0].cue`**：`approach-first-volley-deep.stages[0].cue`：「短球打向可控深区，沿球路跟进，在对手触球时分腿。」——[src/content/expansion.ts:198](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/expansion.ts#L198)。精確漢字數 21（不計標點）；超過 6 字上限。這是完整執行句，尚未提供合規上場提示詞；按硬線下架，不評分。

- **R2 · `stages[1].cue`**：`approach-first-volley-deep.stages[1].cue`：「第一截击先打向后场大目标，随球继续向前覆盖。」——[src/content/expansion.ts:209](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/expansion.ts#L209)。精確漢字數 20（不計標點）；超過 6 字上限。這是完整執行句，尚未提供合規上場提示詞；按硬線下架，不評分。

- **R3 · `name`**：`approach-first-volley-deep.name`：「短球上网：先深再找空档」——[src/content/expansion.ts:190](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/expansion.ts#L190)。現有名稱為簡體；stage.cue、when 等也維持簡體，未符合繁體中文硬線。此判定沒有把名稱中的動作詞誤認為保證得分承諾。

- **R5 · `when`**：`approach-first-volley-deep.when`：「你能平衡处理短球，并已练过进攻后的向前移动与分腿准备。」——[src/content/expansion.ts:194](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/expansion.ts#L194)。組合本身有 when；此原句是組合的使用情境／前提，沒有以子戰術 when 代填。組合自己的 mistake 與 why 仍缺失。

完整父物件：[src/content/expansion.ts:188](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/expansion.ts#L188)；實際父欄位為 `id`、`name`、`category`、`series`、`goal`、`when`、`stages`、`variants`，不含 `mistake`／`why`。

修改方向：由作者重整每階段的上場提示詞，使其符合 2–6 字；較長執行說明與 cue 分開，保留可觀察轉段條件。 把名稱與組合全文轉為繁體短句，再複核術語與我方／對手動作歸屬；不在此審查代寫替代內容。 在父組合層補齊 mistake、why 並同步型別／資料契約；勿把子戰術欄位、goal 或 transition 當成已補齊。 9 歲使用者的連續執行能力需家長確認，明確保留必要技能前提；不據戰術名稱臆測年齡適配。 修正紅線後再做 R4 歸屬及 R6 雙方原文查重與評分；本次未宣稱任何組合語義重複，也不為湊 12–20 條放行。

## 統計

| 類別 | 審查 | 保留 | 降級 | 下架 | 進入評分 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 單項戰術與同 id Guide | 22 | 0 | 0 | 22 | 0 |
| 組合 | 8 | 0 | 0 | 8 | 0 |
| 合計 | 30 | 0 | 0 | 30 | 0 |

換成提審口徑：通過 0、需修改 0、拒絕 30；這是本輪硬線裁決，不代表禁止作者修正後重新送審。12–20 條是精選目標，不是本輪放行配額。

## 缺口提醒

合規選項目前為 0。以下另列「原始內容的明確信號覆蓋缺口」，不把已寫到但未過格式紅線的情境誤稱為完全沒有內容，也不推薦新增戰術湊數。

1. **我方反手在相持中持續受壓、但仍能平衡站穩時的明確匹配信號。** `backhand.when`：「对手某一侧回球较短，或回位偏慢时。」——[src/content/library.ts:283](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L283)；此條處理的是對手弱側。`defend-high-middle.when`：「跑动中勉强击球，身体失去平衡时。」——[src/content/library.ts:318](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L318)；此條已有通用失衡防守，但沒有明確覆蓋我方反手仍平衡而連續受壓的信號。此處只指出精確匹配缺口，不否定既有通用回穩內容。

2. **底線相持中的追身來球匹配。** `return-middle.guide.recognize`：「面对较快的追身或内角发球，需要先化解压力时。」——[src/content/library.ts:21](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L21)；這裡的追身條件明確限定發球。`body-serve.guide.why`：「让发球弹起后靠近接发者身体，可能压缩其挥拍空间，让回球更难充分展开。」——[src/content/library.ts:64](https://github.com/demonyang885/tennis-tactics-interactive-preview/blob/60c44fd8fc6c167336062f82f769ae698d0944f4/src/content/library.ts#L64)；這裡是我方主動追身發球，不能當作我方相持中被追身的處理。現有通用大目標／防守條目沒有直接寫出該情境的識別條件。

## 重審範圍

作者修正硬線後，再逐條完成 R1 年齡與前提確認、R4 我方／對手歸屬、R6 雙方原文語義比對；全部過線後才評 U10 層級、情境覆蓋、signals／requires 和畫板初始站位＋第一拍。本次沒有給出替換文案、合併後戰術或新戰術提案。

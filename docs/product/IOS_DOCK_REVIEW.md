# RallyPath v0.5.0 iPhone／iPad UI 審查

審查日期：2026-10-03。對象：本輪 v0.5.0 介面實作；截圖取自發布前開發伺服器，最終重拍主畫板頁首顯示 v0.5.0；早期對照圖仍可能顯示 v0.4.0，正式版本以發布資訊為準。

獨立 UI 審查代理先檢視即時截圖，再實作 CSS 設計系統並重新檢視成果。這是瀏覽器介面的設計審查，不代表原生 iOS、Liquid Glass 或特定系統版本認證。

## 最新設計範圍

以直接可操作的畫板取代重複首頁。頂部固定品牌、版本及發球／接發切換；底部三個純圖示主入口為畫板、找打法、畫板庫，上方懸浮列承載編輯動作。半透明材質限於導航、操作與浮層，內容列表採不透明表面。支援淺色／深色、降低透明度、高對比與降低動態效果。原有兩段跑位、存檔及四個開局站位不因視覺調整改變。

此範圍取代本輪較早的「單列深色 Dock」方案。舊 `ios-before-*.png` 及 `ios-after-*.png` 僅作迭代背景，最新結論以 `liquid-*.png` 為準。

## 截圖流程與結論

已逐張檢視 20 張本次截圖，截圖位於工作區 `output/`，不隨網站部署。尺寸：iPhone 390 × 844、iPad 820 × 1180 直向、1180 × 820 橫向。

1. **直接畫板：通過。** `liquid-iphone-light-board.png`、`liquid-iphone-dark-board.png`。頂部穩定，發球／接發選中狀態清楚。三個導航入口與編輯工具分離，常駐兩列只有圖示；球場、球員及提示不被常駐工具遮擋。淺色與深色的字、圖示、背景同步切換。
2. **展開常用操作：通過。** `liquid-iphone-light-tools.png`、`liquid-iphone-dark-tools.png`。展開層與主操作列材質一致，更多按鈕有可見狀態。短文字只存在於展開後的輔助操作。浮層暫時覆蓋球場下緣，應維持再次操作球場即收起，且不能令球場改變尺寸。
3. **二級設定：通過。** `liquid-iphone-light-menu.png`、`liquid-iphone-dark-menu.png`。四種站位直接可選，二段跑位與操作提示分開控制。正文放大後仍有完整分組，深色內容沒有白色卡片殘留。捲動與開關持續性由互動測試另驗。
4. **找打法：修正後通過。** 重新檢視 `liquid-iphone-light-tactics.png`、`liquid-iphone-dark-tactics.png`。名稱與短提示可讀；關閉 × 已移至標題區，不再落在首張卡片上，右側箭頭一致對齊。初次 iPad 截圖也發現相同問題，已套用共用標題區修正；本項的修正後證據為 iPhone 的淺／深色重拍。
5. **畫板庫：修正後通過。** 初次切換動畫中的截圖已拒絕；最終重新取得並檢視穩定的 `liquid-iphone-light-library.png`、`liquid-iphone-dark-library.png`，完整頁面、下層背景、章節與空白狀態同步切色。三個固定主入口已補齊，畫板庫有明確選中狀態。複查還發現舊鍵盤容器在沒有鍵盤時額外加了 34 px：已以本應用範圍的 CSS 消除重複偏移，保留 dock 自己的真實安全區。兩種色彩下瀏覽器實測畫板與畫板庫的導航邊界均為 `x=15, y=772, width=360, height=62`（390 × 844 視口），位置與尺寸完全一致，已檢視修正後截圖。
6. **iPad 直向：主畫板／工具／設定通過。** `liquid-ipad-light-{board,tools,menu}.png`。球場按比例置中，兩列控制維持適當最大寬度，未散開至螢幕兩側。浮層內容有足夠空間，觸控目標分離。
7. **iPad 橫向：主畫板／工具／設定通過。** `liquid-ipad-dark-landscape-{board,tools,menu}.png`。球場依可用高度縮小，不被橫向拉寬；Dock 與球場中心線一致。深色整體對比清楚，設定可利用較寬空間。長列表仍需捲動，不能以截圖宣稱末項已可達。

## 實作與檢查基準

- 主文字使用系統字型堆疊，`-apple-system` 優先；正文 `1.0625rem`、次級文字 `.9375rem`，字級不靠整頁縮放。
- 工具列間距至少 8 CSS px，每個點擊目標至少 44 × 44 CSS px。路線微調按鈕移除原本 `.5` 縮放，保留小圖形及 44 px 透明觸控範圍。
- 使用四邊 `env(safe-area-inset-*)`；iPad 場地依可用高度控制寬度，操作列置中並有最大寬度。
- 主要動作實色，次要控制使用同一玻璃材質，停用狀態降低不透明度；按鈕仍有完整輔助名稱。
- `prefers-color-scheme` 切換完整介面色彩；`prefers-reduced-transparency` 與缺少背景模糊能力時採實色；`prefers-contrast: more` 增強邊界及文字；`prefers-reduced-motion` 避免控制縮放及動態材質。
- CSS 語法解析已通過。各檢查是否達標以本輪瀏覽器回歸結果為準，視覺審查不替代功能測試。

## Apple 設計依據

本輪直接讀取 Apple 官方指南（2026-10-03）：

- [Materials](https://developer.apple.com/design/human-interface-guidelines/materials)：玻璃是與內容分離的控制／導航層；適量使用，背景複雜時維持可讀性。
- [Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars)：精選常用操作，其餘放 More；圖示不需額外描邊圓框；分組與位置保持一致。
- [Layout](https://developer.apple.com/design/human-interface-guidelines/layout)：尊重安全區，小尺寸、方向改變、文字大小改變後仍保持結構。
- [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)：iOS/iPadOS 預設觸控尺寸 44 × 44 pt，簡單一致的操作、降低動態效果及清楚控制名稱。

## 驗證限制

CSS px 不等於原生 UIKit pt 的認證；本輪未以實體 iPhone／iPad 驗證 Safari 動態工具列、系統透明度偏好、VoiceOver 或系統字級。發球／接發資料分離、保存、提示持續性與兩段跑位須以互動測試佐證。色彩、浮層及畫板庫固定導航問題均已修正並以新截圖複查。上述視覺範圍通過；功能與真實裝置的限制仍適用。

## 最終設計結論

v0.5.0 本輪視覺審查通過，無尚未處理的設計阻擋項。畫板、工具、設定、找打法及畫板庫均有本次證據；手機與平板、淺色與深色的主要畫板維持一致層級。圖示、透明效果或尺寸檢查不等同 Apple 平台認證，也不替代實體裝置與功能回歸。

# SynchroDeck

VS Code 拡張機能。AI が生成した SVG スライドを GUI で編集し、Git で版管理するツール。  
スライドファイルは `slides/*.svg`、詳細仕様は `documents/svg-spec.md` を参照。

## SVG スライド生成ルール（必須）

`slides/` フォルダに SVG ファイルを追加・編集する際は以下を厳守してください。

1. **キャンバスは 1280×720 px 固定**（`viewBox="0 0 1280 720"` も必須）
2. **使用できる要素は rect / circle / foreignObject のみ**（`<text>`, `<path>`, `<g>` 禁止）
3. **すべての要素は `<svg>` 直下に配置**（`<g>` によるネスト禁止）
4. **circle の位置指定は `cx` / `cy`**（`x`, `y` は使わない）
5. **foreignObject 直下は `<div xmlns="http://www.w3.org/1999/xhtml">` のみ**
6. **div の style に `word-break:break-word` を必ず含める**
7. **すべての要素の width / height（または r）は 30px 以上**
8. **rect と circle には必ず `fill` 属性を付ける**

詳細・テンプレート・プロンプト例 → [`documents/svg-spec.md`](documents/svg-spec.md)

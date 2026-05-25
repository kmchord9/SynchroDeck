# SynchroDeck SVG スライド仕様書（AI エージェント向け）

このドキュメントは AI エージェントが SynchroDeck 準拠の SVG スライドを生成するための仕様です。  
以下のルールに従わないと VS Code の GUI 編集機能が正常に動作しません。

---

## 必須要件

### キャンバスサイズ

```xml
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
```

- **幅: 1280px、高さ: 720px**（固定。変更不可）
- `viewBox="0 0 1280 720"` は必須
- `xmlns="http://www.w3.org/2000/svg"` は必須

---

### 使用できる要素（3 種類のみ）

| 要素 | 用途 | 配置場所 |
|------|------|---------|
| `<rect>` | 背景・装飾バー・区切り線 | SVG 直下のみ |
| `<circle>` | 装飾円 | SVG 直下のみ |
| `<foreignObject>` | テキスト（自動改行あり） | SVG 直下のみ |

**禁止要素**: `<text>`, `<path>`, `<image>`, `<line>`, `<polygon>`, `<g>`

> `<g>` によるネストも禁止です。すべての要素は `<svg>` の直接の子として配置してください。

---

### rect の仕様

```xml
<rect x="0" y="0" width="1280" height="720" fill="#1a1a2e"/>
```

| 属性 | 必須 | 説明 |
|------|------|------|
| `x` | ✅ | 左端の X 座標 |
| `y` | ✅ | 上端の Y 座標 |
| `width` | ✅ | 幅（px） |
| `height` | ✅ | 高さ（px） |
| `fill` | ✅ | 塗り色（`#rrggbb` または `url(#gradientId)`） |
| `rx` | 任意 | 角丸半径 |
| `opacity` | 任意 | 不透明度 |

---

### circle の仕様

```xml
<circle cx="1100" cy="150" r="200" fill="#0f3460" opacity="0.4"/>
```

| 属性 | 必須 | 説明 |
|------|------|------|
| `cx` | ✅ | 中心 X 座標（**`x` ではなく `cx` を使うこと**） |
| `cy` | ✅ | 中心 Y 座標（**`y` ではなく `cy` を使うこと**） |
| `r` | ✅ | 半径（px） |
| `fill` | ✅ | 塗り色 |
| `opacity` | 任意 | 不透明度 |

> ❌ NG: `<circle x="100" y="200" ...>` → ✅ OK: `<circle cx="100" cy="200" ...>`

---

### foreignObject の仕様

```xml
<foreignObject x="100" y="258" width="920" height="160">
  <div xmlns="http://www.w3.org/1999/xhtml"
       style="font-size:64px;font-weight:bold;color:#ffffff;font-family:Arial,'Noto Sans JP',sans-serif;line-height:1.2;word-break:break-word;">
    テキスト内容
  </div>
</foreignObject>
```

**foreignObject の必須ルール**:
- 直下には `<div xmlns="http://www.w3.org/1999/xhtml">` **のみ**配置する（`<span>`, `<p>` 禁止）
- `div` の `xmlns="http://www.w3.org/1999/xhtml"` は必須
- テキストスタイルは `div` の `style` 属性にインラインで記述する

**div の style 必須プロパティ**:

| プロパティ | 必須 | 推奨値の例 |
|-----------|------|-----------|
| `font-size` | ✅ | `48px` |
| `color` | ✅ | `#ffffff` |
| `font-family` | ✅ | `Arial,'Noto Sans JP',sans-serif` |
| `word-break` | ✅ | `break-word`（自動改行のため必須） |
| `line-height` | 推奨 | `1.4` |
| `font-weight` | 任意 | `bold` |
| `text-align` | 任意 | `left` / `center` / `right` |
| `letter-spacing` | 任意 | `0.1em` |

**複数行テキスト**:

```xml
<!-- 方法 1: <br/> タグ -->
<div ...>1行目<br/>2行目<br/>3行目</div>

<!-- 方法 2: word-break で自動改行（width を小さくする） -->
<div style="...;word-break:break-word;">長いテキストは自動的に折り返されます。</div>
```

---

### defs（グラデーション定義）

グラデーションや共通定義は `<defs>` 内に記述できます。

```xml
<defs>
  <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" style="stop-color:#1a1a2e;stop-opacity:1"/>
    <stop offset="100%" style="stop-color:#16213e;stop-opacity:1"/>
  </linearGradient>
</defs>
```

`fill="url(#bgGrad)"` で参照できます。`<defs>` 内の要素は GUI 編集の対象外です。

---

## サイズ制約

- すべての要素（rect の width/height、circle の r）は **30px 以上**推奨
  - 30px 未満ではリサイズハンドルが正常に動作しない場合があります

---

## シェイプパネルのラベル自動生成ルール

VS Code の GUI パネルに表示される要素名は以下のロジックで自動生成されます。  
AI エージェントはこのルールを参考にレイアウトを設計してください。

| 条件 | ラベル |
|------|--------|
| `rect` で width≥1152px かつ height≥648px | 背景 |
| `rect` で height≤8px | 区切り線 |
| `rect` で width≤20px | サイドバー |
| `rect` で height≤50px | アクセントバー |
| `rect` で上記以外 | 四角 N（N は連番） |
| `circle` | 円 N |
| `foreignObject` | テキストの先頭 20 文字 |

---

## SVG テンプレート

### テンプレート 1: タイトルスライド

```xml
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1a1a2e;stop-opacity:1"/>
      <stop offset="100%" style="stop-color:#16213e;stop-opacity:1"/>
    </linearGradient>
  </defs>

  <!-- 背景 -->
  <rect x="0" y="0" width="1280" height="720" fill="url(#bg)"/>

  <!-- 装飾円 -->
  <circle cx="1100" cy="150" r="200" fill="#0f3460" opacity="0.4"/>
  <circle cx="80" cy="600" r="160" fill="#0f3460" opacity="0.3"/>

  <!-- アクセントバー -->
  <rect x="0" y="0" width="1280" height="6" fill="#e94560"/>

  <!-- タイトル -->
  <foreignObject x="100" y="240" width="900" height="200">
    <div xmlns="http://www.w3.org/1999/xhtml"
         style="font-size:64px;font-weight:bold;color:#ffffff;font-family:Arial,'Noto Sans JP',sans-serif;line-height:1.2;word-break:break-word;">
      スライドタイトル
    </div>
  </foreignObject>

  <!-- サブタイトル -->
  <foreignObject x="100" y="460" width="900" height="80">
    <div xmlns="http://www.w3.org/1999/xhtml"
         style="font-size:26px;color:#a8b2d8;font-family:Arial,'Noto Sans JP',sans-serif;line-height:1.5;word-break:break-word;">
      サブタイトル・説明文
    </div>
  </foreignObject>

  <!-- 発表者・日付 -->
  <foreignObject x="100" y="638" width="800" height="48">
    <div xmlns="http://www.w3.org/1999/xhtml"
         style="font-size:18px;color:#a8b2d8;font-family:Arial,'Noto Sans JP',sans-serif;">
      発表者名　|　日付
    </div>
  </foreignObject>

  <!-- スライド番号 -->
  <foreignObject x="1160" y="690" width="100" height="24">
    <div xmlns="http://www.w3.org/1999/xhtml"
         style="font-size:15px;color:#ffffff;opacity:0.35;font-family:Arial,sans-serif;text-align:right;">
      1 / N
    </div>
  </foreignObject>
</svg>
```

---

### テンプレート 2: コンテンツスライド（左右 2 カラム）

```xml
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1a1a2e;stop-opacity:1"/>
      <stop offset="100%" style="stop-color:#16213e;stop-opacity:1"/>
    </linearGradient>
  </defs>

  <!-- 背景 -->
  <rect x="0" y="0" width="1280" height="720" fill="url(#bg)"/>

  <!-- アクセントバー -->
  <rect x="0" y="0" width="1280" height="6" fill="#e94560"/>

  <!-- ヘッダー区切り線 -->
  <rect x="100" y="128" width="1080" height="2" fill="#1e3a5f"/>

  <!-- カラム区切り線 -->
  <rect x="640" y="148" width="2" height="530" fill="#1e3a5f"/>

  <!-- スライドタイトル -->
  <foreignObject x="100" y="38" width="1080" height="72">
    <div xmlns="http://www.w3.org/1999/xhtml"
         style="font-size:44px;font-weight:bold;color:#ffffff;font-family:Arial,'Noto Sans JP',sans-serif;">
      スライドタイトル
    </div>
  </foreignObject>

  <!-- 左カラムラベル -->
  <foreignObject x="100" y="148" width="480" height="44">
    <div xmlns="http://www.w3.org/1999/xhtml"
         style="font-size:17px;font-weight:bold;color:#e94560;font-family:Arial,sans-serif;letter-spacing:0.12em;">
      LEFT LABEL
    </div>
  </foreignObject>

  <!-- 左カラム本文 -->
  <foreignObject x="100" y="200" width="520" height="466">
    <div xmlns="http://www.w3.org/1999/xhtml"
         style="font-size:20px;color:#a8b2d8;font-family:Arial,'Noto Sans JP',sans-serif;line-height:2;word-break:break-word;">
      ▸ 項目 1<br/>▸ 項目 2<br/>▸ 項目 3
    </div>
  </foreignObject>

  <!-- 右カラムラベル -->
  <foreignObject x="660" y="148" width="520" height="44">
    <div xmlns="http://www.w3.org/1999/xhtml"
         style="font-size:17px;font-weight:bold;color:#34d399;font-family:Arial,sans-serif;letter-spacing:0.12em;">
      RIGHT LABEL
    </div>
  </foreignObject>

  <!-- 右カラム本文 -->
  <foreignObject x="660" y="200" width="520" height="466">
    <div xmlns="http://www.w3.org/1999/xhtml"
         style="font-size:20px;color:#a8b2d8;font-family:Arial,'Noto Sans JP',sans-serif;line-height:2;word-break:break-word;">
      ✓ 項目 A<br/>✓ 項目 B<br/>✓ 項目 C
    </div>
  </foreignObject>

  <!-- スライド番号 -->
  <foreignObject x="1160" y="690" width="100" height="24">
    <div xmlns="http://www.w3.org/1999/xhtml"
         style="font-size:15px;color:#ffffff;opacity:0.35;font-family:Arial,sans-serif;text-align:right;">
      2 / N
    </div>
  </foreignObject>
</svg>
```

---

## AI エージェントへのプロンプト例

### 方法 1: この仕様書をそのまま添付する（推奨）

```
以下の仕様に従って SVG スライドを作成してください。

[svg-spec.md の内容をここに貼り付け]

---

作成するスライドの内容:
- テーマ: ○○○
- スライド枚数: 3 枚
- 内容の概要: ○○○
```

### 方法 2: 要点のみを伝える（簡略版）

```
SynchroDeck 形式の SVG スライドを作成してください。

制約:
- 1280×720px
- 使用要素: rect / circle / foreignObject のみ（<text>, <g> 禁止）
- すべての要素は <svg> 直下に配置（ネスト禁止）
- circle は cx/cy/r/fill 属性で定義（x/y 不可）
- foreignObject 直下は <div xmlns="http://www.w3.org/1999/xhtml"> のみ
- div の style に word-break:break-word を必ず含める

テーマ: ○○○
```

---

## よくある間違いパターン

| ❌ NG | ✅ OK |
|-------|-------|
| `<text x="100" y="200">テキスト</text>` | `<foreignObject ...><div ...>テキスト</div></foreignObject>` |
| `<g><rect .../></g>` | `<rect .../>` （グループ化しない） |
| `<circle x="100" y="200" r="50" ...>` | `<circle cx="100" cy="200" r="50" ...>` |
| `<foreignObject><span ...>` | `<foreignObject><div xmlns="...">` |
| `<foreignObject><div>` （xmlns なし）| `<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">` |
| div の style に word-break なし | `style="...;word-break:break-word;"` |
| width/height が 30px 未満の要素 | 最小 30px 以上に設定 |

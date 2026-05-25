# SynchroDeck 開発者ガイド

## 概要

SynchroDeck は VS Code 拡張機能として動作するスライド作成ツールです。  
AI が生成した SVG ファイルを人間が GUI で編集し、Git で版管理するワークフローを実現します。

---

## アーキテクチャ

```
VS Code Extension Host (Node.js)
├── src/extension.ts      コマンド登録・Webview 管理・ファイル同期
└── src/pdf.ts            Puppeteer による PDF エクスポート

Webview (Chromium + React)
├── src/webview/App.tsx          メイン UI・SVG 編集ロジック
└── src/webview/SelectionOverlay.tsx   選択枠・リサイズハンドル
```

### データフロー

```
SVG ファイル (slides/*.svg)
    ↓ onDidChangeTextDocument / onDidChangeActiveTextEditor
extension.ts → postMessage({ type: 'update', svgContent })
    ↓
App.tsx (dangerouslySetInnerHTML でレンダリング)
    ↓ 編集後
App.tsx → postMessage({ type: 'applyEdit', svgContent })
    ↓
extension.ts → WorkspaceEdit でファイルに書き戻し
```

**ループ防止**: `applyingEdit` フラグで、Webview 起因の書き戻しが再度 Webview に届かないように制御。

---

## SVG フォーマット

すべてのスライドは `1280×720` の SVG ファイルです。

| 要素 | 用途 |
|------|------|
| `<rect>` | 背景・装飾バー・区切り線 |
| `<circle>` | 装飾円 |
| `<foreignObject>` | テキスト（HTML/CSS で自動改行） |

### foreignObject を使う理由

SVG ネイティブの `<text>` 要素は自動改行に対応していません。  
`<foreignObject>` 内に `<div>` を配置することで、CSS の `word-break` による自動改行が実現できます。

```xml
<foreignObject x="100" y="258" width="920" height="160">
  <div xmlns="http://www.w3.org/1999/xhtml"
       style="font-size:64px;font-weight:bold;color:#ffffff;">
    タイトルテキスト
  </div>
</foreignObject>
```

---

## ビルド構成

### ビルドコマンド

| コマンド | 説明 |
|----------|------|
| `npm run build` | Extension + Webview を両方ビルド |
| `npm run build:ext` | Extension Host のみ（esbuild） |
| `npm run build:webview` | Webview のみ（Vite） |

### ツールチェーン

- **Extension Host**: esbuild でバンドル → `out/extension.js`
  - `--external:vscode` と `--external:puppeteer` は実行環境から提供されるため除外
- **Webview**: Vite でバンドル → `out/webview/assets/main.js`
  - root が `src/webview/`、outDir が `out/webview/`

### gitignore

`out/` はビルド成果物のため Git 管理外。クローン後は必ず `npm install && npm run build` が必要。

---

## 主要ファイル解説

### `src/extension.ts`

**クラス `SynchroDeckPanel`**

- `createOrShow()`: パネルが存在しなければ新規作成、存在すれば前面に表示
- `sendSlide(svgContent)`: Webview に SVG を送信
- `onDidReceiveMessage`: `applyEdit` メッセージを受信してファイルへ書き戻し

**CSP 設定**

```
default-src 'none'; script-src 'nonce-{nonce}'; style-src 'unsafe-inline'
```

`style-src 'unsafe-inline'` が必要な理由: foreignObject 内の `style` 属性でインラインスタイルを使用するため。

---

### `src/webview/App.tsx`

#### 状態管理

| state | 型 | 説明 |
|-------|----|------|
| `svgContent` | `string \| null` | 現在表示中の SVG 文字列 |
| `elements` | `ElementInfo[]` | スキャンした SVG 要素一覧 |
| `selected` | `Selected \| null` | 選択中の要素 |
| `isEditing` | `boolean` | テキスト編集モード中か |
| `panelOpen` | `boolean` | シェイプパネルの開閉状態 |

#### Stable Refs パターン

クロージャ内で最新の state を参照するために ref を同期させています。

```ts
const selectedRef  = useRef(selected);
const isEditingRef = useRef(isEditing);
const elementsRef  = useRef(elements);

useEffect(() => { selectedRef.current  = selected;  }, [selected]);
useEffect(() => { isEditingRef.current = isEditing; }, [isEditing]);
useEffect(() => { elementsRef.current  = elements;  }, [elements]);
```

#### 要素スキャン

```ts
svg.querySelectorAll(':scope > rect, :scope > circle, :scope > foreignObject')
```

- `:scope >` で SVG 直下の要素のみを対象（ネストした要素を除外）
- `el.tagName` を直接使用（`toLowerCase()` 不可。`foreignObject` の O が小文字になり不一致になるため）

#### 座標変換

```ts
function toSvgPt(svgEl: SVGSVGElement, x: number, y: number): DOMPoint {
  const pt = svgEl.createSVGPoint();
  pt.x = x; pt.y = y;
  return pt.matrixTransform(svgEl.getScreenCTM()!.inverse());
}
```

スクリーン座標 → SVG ローカル座標への変換に `getScreenCTM().inverse()` を使用。

#### テキスト編集

1. `startTextEdit(info?)`: `div.contentEditable = 'true'` → フォーカス → キャレットを末尾へ
2. 編集中: `SelectionOverlay` の `pointerEvents: 'none'` でクリックを div に透過
3. `endTextEdit()`: `contentEditable = 'false'` → `serialize()` → `postMessage(applyEdit)`

#### シリアライズ

```ts
function serialize(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  // 編集用属性を除去
  clone.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
  clone.querySelectorAll('[data-sd-sel]').forEach(el => { ... });
  // viewBox を width/height に戻す
  clone.removeAttribute('viewBox');
  clone.setAttribute('width', '1280');
  clone.setAttribute('height', '720');
  return new XMLSerializer().serializeToString(clone);
}
```

---

### `src/webview/SelectionOverlay.tsx`

選択中の要素の上に重ねる dashed ボーダー + 8 つのリサイズハンドル。

**重要な設計判断**

- `pointerEvents: isEditing ? 'none' : 'auto'`: 編集中はクリックを透過させる
- `onClick={e => e.stopPropagation()}`: 親 div への伝播を止めて deselect を防ぐ

**Chromium の合成レイヤー問題**

foreignObject 内の HTML コンテンツは、Chromium の合成レイヤーにより `position: fixed` の overlay よりも上に描画されます。そのため foreignObject の `onDoubleClick` はオーバーレイではなく、コンテナ div 側で捕捉しています。

---

### `src/pdf.ts`

Puppeteer を使って SVG → PDF に変換します。

```ts
const browser = await puppeteer.launch({
  args: ['--no-sandbox', '--disable-setuid-sandbox'], // Linux AppArmor 環境用
});
```

各スライドの SVG を 1 つの HTML ページに連結し、`@page { size: 1920px 1080px; margin: 0; }` で印刷サイズを指定してから `page.pdf()` を呼び出します。

---

## デバッグ方法

1. `npm run build` でビルド
2. VS Code で **F5** → Extension Development Host が起動
3. Extension Development Host 内で SVG ファイルを開く
4. **Ctrl+Shift+P** → `SynchroDeck: スライドプレビューを開く`
5. Webview の DevTools: Extension Development Host で **Help → Toggle Developer Tools**

---

## 既知の制約

- `<text>` 要素は対象外（foreignObject のみサポート）
- SVG 直下の要素のみ検出（グループ化 `<g>` は未対応）
- PDF エクスポートは Puppeteer の Chromium が必要（初回起動時にダウンロード）

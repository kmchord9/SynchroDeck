import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('synchrodeck.openPreview', () => {
      SynchroDeckPanel.createOrShow(context.extensionUri);
    }),

    // SVGファイルが編集されたらWebviewを更新
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (SynchroDeckPanel.currentPanel && isSvg(e.document)) {
        SynchroDeckPanel.currentPanel.sendSlide(e.document.getText());
      }
    }),

    // アクティブエディタが切り替わったらWebviewを更新
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (SynchroDeckPanel.currentPanel && editor && isSvg(editor.document)) {
        SynchroDeckPanel.currentPanel.sendSlide(editor.document.getText());
      }
    })
  );
}

export function deactivate() {}

function isSvg(doc: vscode.TextDocument): boolean {
  return doc.languageId === 'xml' || doc.fileName.endsWith('.svg');
}

class SynchroDeckPanel {
  static currentPanel: SynchroDeckPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;

  static createOrShow(extensionUri: vscode.Uri) {
    if (SynchroDeckPanel.currentPanel) {
      SynchroDeckPanel.currentPanel._panel.reveal(vscode.ViewColumn.Beside);
      // パネルを再表示した時点のアクティブSVGを送信
      const editor = vscode.window.activeTextEditor;
      if (editor && isSvg(editor.document)) {
        SynchroDeckPanel.currentPanel.sendSlide(editor.document.getText());
      }
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'synchroDeckPreview',
      'SynchroDeck Preview',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'out', 'webview')],
      }
    );
    SynchroDeckPanel.currentPanel = new SynchroDeckPanel(panel, extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._panel.webview.html = this._buildHtml();
    this._panel.onDidDispose(() => {
      SynchroDeckPanel.currentPanel = undefined;
    });

    // 開いた直後に現在のSVGを表示
    const editor = vscode.window.activeTextEditor;
    if (editor && isSvg(editor.document)) {
      // Webviewの初期化を待ってから送信
      setTimeout(() => this.sendSlide(editor.document.getText()), 100);
    }
  }

  sendSlide(svgContent: string) {
    this._panel.webview.postMessage({ type: 'update', svgContent });
  }

  private _buildHtml(): string {
    const webview = this._panel.webview;
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'assets', 'main.js')
    );
    const nonce = getNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
  <title>SynchroDeck</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}

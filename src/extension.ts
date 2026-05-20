import * as vscode from 'vscode';
import * as path from 'path';
import { exportPdf } from './pdf';

// Webviewからの書き戻しによるループを防ぐフラグ
let applyingEdit = false;

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('synchrodeck.openPreview', () => {
      SynchroDeckPanel.createOrShow(context.extensionUri);
    }),

    vscode.commands.registerCommand('synchrodeck.exportPdf', async () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showErrorMessage('ワークスペースが開かれていません');
        return;
      }

      const slideDir = path.join(workspaceFolder.uri.fsPath, 'slides');
      const defaultUri = vscode.Uri.file(
        path.join(workspaceFolder.uri.fsPath, 'output.pdf')
      );
      const outputUri = await vscode.window.showSaveDialog({
        defaultUri,
        filters: { PDF: ['pdf'] },
      });
      if (!outputUri) {
        return;
      }

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'SynchroDeck: PDF出力中...' },
        async () => {
          await exportPdf(slideDir, outputUri.fsPath);
        }
      );
      vscode.window.showInformationMessage(`PDF出力完了: ${outputUri.fsPath}`);
    }),

    // SVGファイルが編集されたらWebviewを更新（Webview起因の変更は無視）
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (applyingEdit) { return; }
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

    // Webviewからの編集を受信してSVGファイルに書き戻す
    this._panel.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type !== 'applyEdit') { return; }
      const editor = vscode.window.activeTextEditor;
      if (!editor || !isSvg(editor.document)) { return; }

      applyingEdit = true;
      try {
        const edit = new vscode.WorkspaceEdit();
        edit.replace(
          editor.document.uri,
          new vscode.Range(
            editor.document.positionAt(0),
            editor.document.positionAt(editor.document.getText().length)
          ),
          msg.svgContent
        );
        await vscode.workspace.applyEdit(edit);
      } finally {
        applyingEdit = false;
      }
    });

    // 開いた直後に現在のSVGを送信
    const editor = vscode.window.activeTextEditor;
    if (editor && isSvg(editor.document)) {
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

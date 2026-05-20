import { useEffect, useState } from 'react';

type Message = { type: 'update'; svgContent: string };

// SVGのwidth/heightを100%に正規化してviewBoxスケーリングを有効化
function normalizeSvg(svg: string): string {
  return svg
    .replace(/(<svg\b[^>]*?)\s+width="[^"]*"/i, '$1 width="100%"')
    .replace(/(<svg\b[^>]*?)\s+height="[^"]*"/i, '$1 height="100%"');
}

export default function App() {
  const [svgContent, setSvgContent] = useState<string | null>(null);

  useEffect(() => {
    const handler = (event: MessageEvent<Message>) => {
      if (event.data.type === 'update') {
        setSvgContent(normalizeSvg(event.data.svgContent));
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  if (!svgContent) {
    return (
      <div style={{
        width: '100vw', height: '100vh',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: '#0f172a', color: '#475569',
        fontFamily: "'Segoe UI', sans-serif", gap: 16,
      }}>
        <div style={{ fontSize: 48, color: '#1e293b' }}>⬡</div>
        <p style={{ margin: 0, fontSize: 15 }}>SVG スライドファイルを開いてください</p>
      </div>
    );
  }

  return (
    <div style={{
      width: '100vw', height: '100vh',
      display: 'grid', placeItems: 'center',
      background: '#1e1e1e', overflow: 'hidden',
    }}>
      {/* 16:9を保ちつつウィンドウに収める */}
      <div
        style={{
          width: 'min(100vw, calc(100vh * 16 / 9))',
          aspectRatio: '16 / 9',
          overflow: 'hidden',
        }}
        dangerouslySetInnerHTML={{ __html: svgContent }}
      />
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };
const vscode = acquireVsCodeApi();

// ---- types ----

interface Dims { width: string; height: string }
interface Selected { el: SVGRectElement; fill: string; toolbarX: number; toolbarY: number }

// ---- helpers ----

function getDims(svg: string): Dims {
  return {
    width:  svg.match(/<svg\b[^>]*?\swidth="([^"]*)"/i)?.[1]  ?? '1920',
    height: svg.match(/<svg\b[^>]*?\sheight="([^"]*)"/i)?.[1] ?? '1080',
  };
}

function normalize(svg: string): string {
  return svg
    .replace(/(<svg\b[^>]*?)\s+width="[^"]*"/i,  '$1 width="100%"')
    .replace(/(<svg\b[^>]*?)\s+height="[^"]*"/i, '$1 height="100%"');
}

function toSvgPt(svg: SVGSVGElement, clientX: number, clientY: number) {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  return pt.matrixTransform(svg.getScreenCTM()!.inverse());
}

// DOM → SVG文字列へ戻す。選択マーカーと正規化を元に戻す。
function serialize(svgEl: SVGSVGElement, dims: Dims): string {
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('width',  dims.width);
  clone.setAttribute('height', dims.height);
  clone.querySelectorAll('[data-sd]').forEach(el => {
    el.removeAttribute('data-sd');
    el.removeAttribute('stroke');
    el.removeAttribute('stroke-dasharray');
    el.removeAttribute('stroke-width');
  });
  return new XMLSerializer().serializeToString(clone);
}

function clearSelection(svg: Element) {
  svg.querySelectorAll('[data-sd]').forEach(el => {
    el.removeAttribute('data-sd');
    el.removeAttribute('stroke');
    el.removeAttribute('stroke-dasharray');
    el.removeAttribute('stroke-width');
  });
}

function markSelected(rect: SVGRectElement) {
  rect.setAttribute('data-sd', '1');
  rect.setAttribute('stroke', '#6366f1');
  rect.setAttribute('stroke-dasharray', '8 4');
  rect.setAttribute('stroke-width', '4');
}

// ---- component ----

export default function App() {
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const dims = useRef<Dims>({ width: '1920', height: '1080' });
  const containerRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<Selected | null>(null);

  const dragRef = useRef<{
    el: SVGRectElement;
    svg: SVGSVGElement;
    startSvg: { x: number; y: number };
    origX: number;
    origY: number;
  } | null>(null);

  // メッセージ受信
  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      if (ev.data.type !== 'update') return;
      dims.current = getDims(ev.data.svgContent);
      setSvgContent(normalize(ev.data.svgContent));
      setSelected(null);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  // SVGレンダリング後にrectへクリックリスナーを付与
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !svgContent) return;
    const svg = container.querySelector('svg');
    if (!svg) return;

    svg.querySelectorAll('rect').forEach(r => {
      (r as SVGRectElement).style.cursor = 'pointer';
    });

    const onClick = (e: MouseEvent) => {
      const rect = (e.target as Element).closest('rect') as SVGRectElement | null;
      if (!rect) return;
      e.stopPropagation();

      clearSelection(svg);
      markSelected(rect);

      const b = rect.getBoundingClientRect();
      setSelected({
        el: rect,
        fill: rect.getAttribute('fill') ?? '#000000',
        toolbarX: b.left,
        toolbarY: Math.max(8, b.top - 56),
      });
    };

    svg.addEventListener('click', onClick);
    return () => svg.removeEventListener('click', onClick);
  }, [svgContent]);

  // ドラッグ: グローバルmousemove/up
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const svgPt = toSvgPt(d.svg, e.clientX, e.clientY);
      const newX = Math.max(0, Math.round(d.origX + svgPt.x - d.startSvg.x));
      const newY = Math.max(0, Math.round(d.origY + svgPt.y - d.startSvg.y));
      d.el.setAttribute('x', String(newX));
      d.el.setAttribute('y', String(newY));
    };

    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      const svgEl = containerRef.current?.querySelector('svg') as SVGSVGElement | null;
      if (svgEl) {
        vscode.postMessage({ type: 'applyEdit', svgContent: serialize(svgEl, dims.current) });
      }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  // 選択済みrectのmousedown → ドラッグ開始
  const onMouseDown = (e: React.MouseEvent) => {
    if (!selected || !containerRef.current) return;
    const rect = (e.target as Element).closest('rect') as SVGRectElement | null;
    if (!rect || rect !== selected.el) return;
    const svg = containerRef.current.querySelector('svg') as SVGSVGElement;
    const svgPt = toSvgPt(svg, e.clientX, e.clientY);
    dragRef.current = {
      el: rect, svg,
      startSvg: { x: svgPt.x, y: svgPt.y },
      origX: parseFloat(rect.getAttribute('x') ?? '0'),
      origY: parseFloat(rect.getAttribute('y') ?? '0'),
    };
    e.preventDefault(); // テキスト選択を防止
  };

  // カラーピッカー変更
  const onColorChange = (color: string) => {
    if (!selected || !containerRef.current) return;
    selected.el.setAttribute('fill', color);
    setSelected({ ...selected, fill: color });
    const svgEl = containerRef.current.querySelector('svg') as SVGSVGElement;
    vscode.postMessage({ type: 'applyEdit', svgContent: serialize(svgEl, dims.current) });
  };

  // 選択解除
  const deselect = () => {
    if (!selected || !containerRef.current) return;
    const svg = containerRef.current.querySelector('svg');
    if (svg) clearSelection(svg);
    setSelected(null);
  };

  if (!svgContent) {
    return (
      <div style={{
        width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column',
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
    <div
      style={{ width: '100vw', height: '100vh', display: 'grid', placeItems: 'center', background: '#1e1e1e', overflow: 'hidden' }}
      onClick={deselect}
    >
      {/* スライドプレビュー */}
      <div
        ref={containerRef}
        style={{ width: 'min(100vw, calc(100vh * 16 / 9))', aspectRatio: '16 / 9', overflow: 'hidden' }}
        dangerouslySetInnerHTML={{ __html: svgContent }}
        onMouseDown={onMouseDown}
      />

      {/* フローティングツールバー */}
      {selected && (
        <div
          style={{
            position: 'fixed',
            left: selected.toolbarX,
            top: selected.toolbarY,
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: 8,
            padding: '6px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
            zIndex: 9999,
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* カラーピッカー */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <span style={{ fontSize: 12, color: '#64748b', fontFamily: 'monospace' }}>fill</span>
            <input
              type="color"
              value={selected.fill.startsWith('#') ? selected.fill : '#000000'}
              onChange={e => onColorChange(e.target.value)}
              style={{ width: 28, height: 22, padding: 0, border: '1px solid #475569', borderRadius: 4, cursor: 'pointer', background: 'none' }}
            />
            <span style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'monospace' }}>{selected.fill}</span>
          </label>

          {/* ドラッグヒント */}
          <span style={{ fontSize: 11, color: '#475569', borderLeft: '1px solid #334155', paddingLeft: 12 }}>
            ドラッグで移動
          </span>

          {/* 閉じるボタン */}
          <button
            onClick={deselect}
            style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 14, padding: '0 2px', lineHeight: 1 }}
          >✕</button>
        </div>
      )}
    </div>
  );
}

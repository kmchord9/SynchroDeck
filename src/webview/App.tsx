import { useEffect, useRef, useState } from 'react';

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };
const vscode = acquireVsCodeApi();

// ---- types ----

interface Dims { width: string; height: string }

interface RectInfo {
  el: SVGRectElement;
  fill: string;
  x: number; y: number; w: number; h: number;
  label: string;
}

interface Selected { rect: RectInfo; toolbarX: number; toolbarY: number }

// ---- SVG helpers ----

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
  pt.x = clientX; pt.y = clientY;
  return pt.matrixTransform(svg.getScreenCTM()!.inverse());
}

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

function markSelected(el: SVGRectElement) {
  el.setAttribute('data-sd', '1');
  el.setAttribute('stroke', '#6366f1');
  el.setAttribute('stroke-dasharray', '8 4');
  el.setAttribute('stroke-width', '4');
}

function makeRectLabel(r: SVGRectElement, i: number): string {
  const w = parseFloat(r.getAttribute('width') ?? '0');
  const h = parseFloat(r.getAttribute('height') ?? '0');
  if (w >= 1900 && h >= 1050) { return '背景'; }
  if (h <= 8) { return '区切り線'; }
  if (w <= 20) { return 'サイドバー'; }
  if (h <= 150) { return 'ヘッダー'; }
  return `Rect ${i + 1}`;
}

// ---- main component ----

export default function App() {
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const dims = useRef<Dims>({ width: '1920', height: '1080' });
  const containerRef = useRef<HTMLDivElement>(null);

  const [rectList, setRectList] = useState<RectInfo[]>([]);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);

  const dragRef = useRef<{
    el: SVGRectElement; svg: SVGSVGElement;
    startSvg: { x: number; y: number };
    origX: number; origY: number;
  } | null>(null);

  // メッセージ受信
  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      if (ev.data.type !== 'update') { return; }
      dims.current = getDims(ev.data.svgContent);
      setSvgContent(normalize(ev.data.svgContent));
      setSelected(null);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  // SVGレンダリング後に rect を検出してリスト化
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !svgContent) { return; }
    const svg = container.querySelector('svg');
    if (!svg) { return; }

    const infos: RectInfo[] = Array.from(svg.querySelectorAll('rect')).map((el, i) => {
      const r = el as SVGRectElement;
      r.style.cursor = 'pointer';

      // ホバーで輪郭を表示
      r.addEventListener('mouseenter', () => {
        if (!r.hasAttribute('data-sd')) {
          r.setAttribute('stroke', 'rgba(255,255,255,0.25)');
          r.setAttribute('stroke-width', '3');
        }
      });
      r.addEventListener('mouseleave', () => {
        if (!r.hasAttribute('data-sd')) {
          r.removeAttribute('stroke');
          r.removeAttribute('stroke-width');
        }
      });

      return {
        el: r,
        fill:  r.getAttribute('fill') ?? '#000000',
        x: parseFloat(r.getAttribute('x') ?? '0'),
        y: parseFloat(r.getAttribute('y') ?? '0'),
        w: parseFloat(r.getAttribute('width') ?? '0'),
        h: parseFloat(r.getAttribute('height') ?? '0'),
        label: makeRectLabel(r, i),
      };
    });

    setRectList(infos);
  }, [svgContent]);

  // ドラッグ: グローバルmousemove/up
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) { return; }
      const svgPt = toSvgPt(d.svg, e.clientX, e.clientY);
      const newX = Math.max(0, Math.round(d.origX + svgPt.x - d.startSvg.x));
      const newY = Math.max(0, Math.round(d.origY + svgPt.y - d.startSvg.y));
      d.el.setAttribute('x', String(newX));
      d.el.setAttribute('y', String(newY));
    };
    const onUp = () => {
      if (!dragRef.current) { return; }
      dragRef.current = null;
      const svgEl = containerRef.current?.querySelector('svg') as SVGSVGElement | null;
      if (svgEl) {
        vscode.postMessage({ type: 'applyEdit', svgContent: serialize(svgEl, dims.current) });
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  // パネルまたは直接クリックで rect を選択
  const selectRect = (info: RectInfo) => {
    const container = containerRef.current;
    if (!container) { return; }
    const svg = container.querySelector('svg');
    if (!svg) { return; }

    clearSelection(svg);
    markSelected(info.el);

    const b = info.el.getBoundingClientRect();
    setSelected({
      rect: { ...info, fill: info.el.getAttribute('fill') ?? info.fill },
      toolbarX: Math.min(b.left, window.innerWidth - 320),
      toolbarY: Math.max(8, b.top - 56),
    });
  };

  const deselect = () => {
    if (!selected || !containerRef.current) { return; }
    const svg = containerRef.current.querySelector('svg');
    if (svg) { clearSelection(svg); }
    setSelected(null);
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (!selected || !containerRef.current) { return; }
    const rect = (e.target as Element).closest('rect') as SVGRectElement | null;
    if (!rect || rect !== selected.rect.el) { return; }
    const svg = containerRef.current.querySelector('svg') as SVGSVGElement;
    const svgPt = toSvgPt(svg, e.clientX, e.clientY);
    dragRef.current = {
      el: rect, svg,
      startSvg: { x: svgPt.x, y: svgPt.y },
      origX: parseFloat(rect.getAttribute('x') ?? '0'),
      origY: parseFloat(rect.getAttribute('y') ?? '0'),
    };
    e.preventDefault();
  };

  const onColorChange = (color: string) => {
    if (!selected || !containerRef.current) { return; }
    selected.rect.el.setAttribute('fill', color);
    setSelected({ ...selected, rect: { ...selected.rect, fill: color } });
    const svgEl = containerRef.current.querySelector('svg') as SVGSVGElement;
    vscode.postMessage({ type: 'applyEdit', svgContent: serialize(svgEl, dims.current) });
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
      style={{ width: '100vw', height: '100vh', display: 'grid', placeItems: 'center', background: '#1e1e1e', overflow: 'hidden', position: 'relative' }}
      onClick={deselect}
    >
      {/* スライドプレビュー */}
      <div
        ref={containerRef}
        style={{ width: 'min(100vw, calc(100vh * 16 / 9))', aspectRatio: '16 / 9', overflow: 'hidden' }}
        dangerouslySetInnerHTML={{ __html: svgContent }}
        onMouseDown={onMouseDown}
      />

      {/* ─── シェイプ一覧パネル ─── */}
      <div
        style={{ position: 'fixed', top: 12, right: 12, zIndex: 9999 }}
        onClick={e => e.stopPropagation()}
      >
        {/* トグルボタン */}
        <button
          onClick={() => setPanelOpen(o => !o)}
          title="シェイプ一覧"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: panelOpen ? '#1e293b' : '#0f172a',
            border: '1px solid #334155', borderRadius: panelOpen ? '8px 8px 0 0' : 8,
            color: '#94a3b8', fontSize: 12, cursor: 'pointer',
            padding: '6px 10px', width: '100%',
          }}
        >
          <span>◈</span>
          <span>シェイプ</span>
          <span style={{ marginLeft: 'auto', color: '#475569' }}>{panelOpen ? '▲' : '▼'}</span>
        </button>

        {/* パネル本体 */}
        {panelOpen && (
          <div style={{
            background: '#0f172a', border: '1px solid #334155', borderTop: 'none',
            borderRadius: '0 0 8px 8px', minWidth: 200, overflow: 'hidden',
          }}>
            {rectList.length === 0 ? (
              <p style={{ color: '#475569', fontSize: 12, padding: '10px 12px', margin: 0 }}>rect なし</p>
            ) : (
              rectList.map((info, i) => {
                const isSelected = selected?.rect.el === info.el;
                const currentFill = isSelected ? selected!.rect.fill : info.fill;
                return (
                  <div
                    key={i}
                    onClick={() => selectRect(info)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 12px', cursor: 'pointer',
                      background: isSelected ? '#1e293b' : 'transparent',
                      borderTop: i === 0 ? 'none' : '1px solid #1e293b',
                    }}
                    onMouseEnter={e => { if (!isSelected) { (e.currentTarget as HTMLElement).style.background = '#0f172a'; } }}
                    onMouseLeave={e => { if (!isSelected) { (e.currentTarget as HTMLElement).style.background = 'transparent'; } }}
                  >
                    {/* カラースウォッチ */}
                    <div style={{
                      width: 18, height: 18, borderRadius: 3, flexShrink: 0,
                      background: currentFill.startsWith('#') ? currentFill : '#555',
                      border: '1px solid #334155',
                    }} />
                    {/* ラベルと寸法 */}
                    <div>
                      <div style={{ fontSize: 13, color: isSelected ? '#e2e8f0' : '#94a3b8' }}>
                        {info.label}
                      </div>
                      <div style={{ fontSize: 11, color: '#475569', fontFamily: 'monospace' }}>
                        {info.w} × {info.h}
                      </div>
                    </div>
                    {isSelected && <span style={{ marginLeft: 'auto', color: '#6366f1', fontSize: 12 }}>●</span>}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* ─── フローティングツールバー（選択時）─── */}
      {selected && (
        <div
          style={{
            position: 'fixed', left: selected.toolbarX, top: selected.toolbarY,
            background: '#1e293b', border: '1px solid #334155', borderRadius: 8,
            padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 12,
            boxShadow: '0 4px 20px rgba(0,0,0,0.6)', zIndex: 10000,
          }}
          onClick={e => e.stopPropagation()}
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <span style={{ fontSize: 12, color: '#64748b', fontFamily: 'monospace' }}>fill</span>
            <input
              type="color"
              value={selected.rect.fill.startsWith('#') ? selected.rect.fill : '#000000'}
              onChange={e => onColorChange(e.target.value)}
              style={{ width: 28, height: 22, padding: 0, border: '1px solid #475569', borderRadius: 4, cursor: 'pointer', background: 'none' }}
            />
            <span style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'monospace' }}>{selected.rect.fill}</span>
          </label>
          <span style={{ fontSize: 11, color: '#475569', borderLeft: '1px solid #334155', paddingLeft: 12 }}>ドラッグで移動</span>
          <button
            onClick={deselect}
            style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 14, padding: '0 2px', lineHeight: 1 }}
          >✕</button>
        </div>
      )}
    </div>
  );
}

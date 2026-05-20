import { useEffect, useRef, useState } from 'react';
import { SelectionOverlay, ResizeHandle } from './SelectionOverlay';

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };
const vscode = acquireVsCodeApi();

// ---- types ----

type ElementType = 'rect' | 'circle' | 'foreignObject';

interface Dims { width: string; height: string }
interface Pt   { x: number; y: number }
interface Box  { x: number; y: number; w: number; h: number }

interface ElementInfo {
  el: SVGElement;
  type: ElementType;
  label: string;
}
interface Selected extends ElementInfo {
  bounds: DOMRect;
}

interface DragState  { svg: SVGSVGElement; startSvg: Pt; origPos: Pt }
interface ResizeState { svg: SVGSVGElement; handle: ResizeHandle; startSvg: Pt; orig: Box }

// ---- SVG helpers ----

function getDims(svg: string): Dims {
  return {
    width:  svg.match(/<svg\b[^>]*?\swidth="([^"]*)"/i)?.[1]  ?? '1280',
    height: svg.match(/<svg\b[^>]*?\sheight="([^"]*)"/i)?.[1] ?? '720',
  };
}

function normalize(svg: string): string {
  return svg
    .replace(/(<svg\b[^>]*?)\s+width="[^"]*"/i,  '$1 width="100%"')
    .replace(/(<svg\b[^>]*?)\s+height="[^"]*"/i, '$1 height="100%"');
}

function serialize(svgEl: SVGSVGElement, dims: Dims): string {
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('width',  dims.width);
  clone.setAttribute('height', dims.height);
  clone.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
  clone.querySelectorAll('[data-sd-sel]').forEach(el => {
    el.removeAttribute('data-sd-sel');
    el.removeAttribute('stroke');
    el.removeAttribute('stroke-dasharray');
    el.removeAttribute('stroke-width');
  });
  return new XMLSerializer().serializeToString(clone);
}

function toSvgPt(svg: SVGSVGElement, clientX: number, clientY: number): Pt {
  const pt = svg.createSVGPoint();
  pt.x = clientX; pt.y = clientY;
  const r = pt.matrixTransform(svg.getScreenCTM()!.inverse());
  return { x: r.x, y: r.y };
}

function getPos(el: SVGElement, type: ElementType): Pt {
  if (type === 'circle') {
    return { x: parseFloat(el.getAttribute('cx') ?? '0'), y: parseFloat(el.getAttribute('cy') ?? '0') };
  }
  return { x: parseFloat(el.getAttribute('x') ?? '0'), y: parseFloat(el.getAttribute('y') ?? '0') };
}

function setPos(el: SVGElement, type: ElementType, p: Pt) {
  if (type === 'circle') {
    el.setAttribute('cx', String(Math.round(p.x)));
    el.setAttribute('cy', String(Math.round(p.y)));
  } else {
    el.setAttribute('x', String(Math.round(p.x)));
    el.setAttribute('y', String(Math.round(p.y)));
  }
}

function getBox(el: SVGElement): Box {
  return {
    x: parseFloat(el.getAttribute('x') ?? '0'),
    y: parseFloat(el.getAttribute('y') ?? '0'),
    w: parseFloat(el.getAttribute('width')  ?? '0'),
    h: parseFloat(el.getAttribute('height') ?? '0'),
  };
}

function applyResize(el: SVGElement, orig: Box, handle: ResizeHandle, d: Pt) {
  let { x, y, w, h } = orig;
  const MIN = 30;
  if (handle.includes('n')) { const ny = y + d.y; const nh = h - d.y; if (nh >= MIN) { y = ny; h = nh; } }
  if (handle.includes('s')) { h = Math.max(MIN, h + d.y); }
  if (handle.includes('w')) { const nx = x + d.x; const nw = w - d.x; if (nw >= MIN) { x = nx; w = nw; } }
  if (handle.includes('e')) { w = Math.max(MIN, w + d.x); }
  el.setAttribute('x', String(Math.round(x)));
  el.setAttribute('y', String(Math.round(y)));
  el.setAttribute('width',  String(Math.round(w)));
  el.setAttribute('height', String(Math.round(h)));
}

function makeLabel(el: SVGElement, type: ElementType, n: number): string {
  if (type === 'foreignObject') {
    const text = (el.querySelector('div')?.textContent ?? '').trim().slice(0, 20);
    return text || `テキスト ${n}`;
  }
  if (type === 'circle') return `円 ${n}`;
  // rect
  const w = parseFloat(el.getAttribute('width') ?? '0');
  const h = parseFloat(el.getAttribute('height') ?? '0');
  const vb = el.ownerSVGElement?.viewBox.baseVal;
  if (vb && w >= vb.width * 0.9 && h >= vb.height * 0.9) return '背景';
  if (h <= 8)  return '区切り線';
  if (w <= 20) return 'サイドバー';
  if (h <= 50) return 'アクセントバー';
  return `四角 ${n}`;
}

// ---- component ----

export default function App() {
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [elements, setElements] = useState<ElementInfo[]>([]);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);

  const dims        = useRef<Dims>({ width: '1280', height: '720' });
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef   = useRef<HTMLDivElement>(null);

  // Stable refs so event listeners always see current values
  const selectedRef   = useRef<Selected | null>(null);
  const isEditingRef  = useRef(false);
  const elementsRef   = useRef<ElementInfo[]>([]);
  selectedRef.current  = selected;
  isEditingRef.current = isEditing;
  elementsRef.current  = elements;

  const dragRef   = useRef<DragState | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);

  // ---- message receiver ----
  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      if (ev.data.type !== 'update') return;
      dims.current = getDims(ev.data.svgContent);
      setSvgContent(normalize(ev.data.svgContent));
      setSelected(null);
      setIsEditing(false);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  // ---- scan elements after SVG renders ----
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !svgContent) return;
    const svg = container.querySelector('svg');
    if (!svg) return;

    const counts: Record<string, number> = { rect: 0, circle: 0, foreignObject: 0 };
    const infos: ElementInfo[] = [];

    svg.querySelectorAll(':scope > rect, :scope > circle, :scope > foreignObject').forEach(rawEl => {
      const el   = rawEl as SVGElement;
      const type = el.tagName.toLowerCase() as ElementType;
      counts[type] = (counts[type] ?? 0) + 1;
      const label = makeLabel(el, type, counts[type]);

      // Hover hint for shapes (foreignObject is selected via panel only)
      if (type !== 'foreignObject') {
        el.style.cursor = 'pointer';
        el.addEventListener('mouseenter', () => {
          if (!el.hasAttribute('data-sd-sel')) {
            el.setAttribute('stroke', 'rgba(255,255,255,0.22)');
            el.setAttribute('stroke-width', '2');
          }
        });
        el.addEventListener('mouseleave', () => {
          if (!el.hasAttribute('data-sd-sel')) {
            el.removeAttribute('stroke');
            el.removeAttribute('stroke-width');
          }
        });
        // Direct click-to-select for shapes
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          if (isEditingRef.current) endTextEdit();
          const info = elementsRef.current.find(i => i.el === el);
          if (info) doSelect(info);
        });
      }

      infos.push({ el, type, label });
    });

    setElements(infos);
  }, [svgContent]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- selection helpers ----

  function clearMarkers() {
    containerRef.current?.querySelectorAll('[data-sd-sel]').forEach(el => {
      el.removeAttribute('data-sd-sel');
      el.removeAttribute('stroke');
      el.removeAttribute('stroke-dasharray');
      el.removeAttribute('stroke-width');
    });
  }

  function doSelect(info: ElementInfo) {
    clearMarkers();
    if (info.type !== 'foreignObject') {
      info.el.setAttribute('data-sd-sel', '1');
      info.el.setAttribute('stroke', '#6366f1');
      info.el.setAttribute('stroke-dasharray', '6 3');
      info.el.setAttribute('stroke-width', '3');
    }
    setSelected({ ...info, bounds: info.el.getBoundingClientRect() });
  }

  function doDeselect() {
    clearMarkers();
    setSelected(null);
  }

  // ---- text editing ----

  function endTextEdit() {
    const sel = selectedRef.current;
    if (!sel || sel.type !== 'foreignObject') return;
    const div = sel.el.querySelector('div') as HTMLElement | null;
    if (div) div.contentEditable = 'false';
    setIsEditing(false);
    const svgEl = containerRef.current?.querySelector('svg') as SVGSVGElement | null;
    if (svgEl) vscode.postMessage({ type: 'applyEdit', svgContent: serialize(svgEl, dims.current) });
  }

  // infoOverride: コンテナのdblclickから直接渡す場合（setSelected完了を待たない）
  function startTextEdit(infoOverride?: ElementInfo) {
    const target = infoOverride ?? selectedRef.current;
    if (!target || target.type !== 'foreignObject') return;

    // まだ選択されていない場合は選択状態にする
    if (infoOverride && selectedRef.current?.el !== infoOverride.el) {
      const sel = { ...infoOverride, bounds: infoOverride.el.getBoundingClientRect() };
      setSelected(sel);
      selectedRef.current = sel; // 同期的に更新してfocusが正しく動くようにする
    }

    const div = target.el.querySelector('div') as HTMLElement | null;
    if (!div) return;
    div.contentEditable = 'true';
    div.focus();
    const range = document.createRange();
    range.selectNodeContents(div);
    range.collapse(false);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    setIsEditing(true);
  }

  // ---- global mouse events (drag + resize) ----

  useEffect(() => {
    function syncOverlay(el: SVGElement) {
      const ov = overlayRef.current;
      if (!ov) return;
      const b = el.getBoundingClientRect();
      ov.style.left   = `${b.left   - 2}px`;
      ov.style.top    = `${b.top    - 2}px`;
      ov.style.width  = `${b.width  + 4}px`;
      ov.style.height = `${b.height + 4}px`;
    }

    const onMove = (e: MouseEvent) => {
      if (dragRef.current) {
        const { svg, startSvg, origPos } = dragRef.current;
        const sel = selectedRef.current!;
        const pt = toSvgPt(svg, e.clientX, e.clientY);
        setPos(sel.el, sel.type, { x: origPos.x + pt.x - startSvg.x, y: origPos.y + pt.y - startSvg.y });
        syncOverlay(sel.el);
      } else if (resizeRef.current) {
        const { svg, handle, startSvg, orig } = resizeRef.current;
        const sel = selectedRef.current!;
        const pt = toSvgPt(svg, e.clientX, e.clientY);
        applyResize(sel.el, orig, handle, { x: pt.x - startSvg.x, y: pt.y - startSvg.y });
        syncOverlay(sel.el);
      }
    };

    const onUp = () => {
      const wasBusy = !!(dragRef.current || resizeRef.current);
      dragRef.current = resizeRef.current = null;
      if (!wasBusy) return;
      const sel = selectedRef.current;
      if (sel) setSelected({ ...sel, bounds: sel.el.getBoundingClientRect() });
      const svgEl = containerRef.current?.querySelector('svg') as SVGSVGElement | null;
      if (svgEl) vscode.postMessage({ type: 'applyEdit', svgContent: serialize(svgEl, dims.current) });
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  // Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (isEditingRef.current) endTextEdit();
      else doDeselect();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- overlay event handlers ----

  function onMoveStart(e: React.MouseEvent) {
    if (isEditing || !selected || !containerRef.current) return;
    e.preventDefault();
    const svg = containerRef.current.querySelector('svg') as SVGSVGElement;
    dragRef.current = { svg, startSvg: toSvgPt(svg, e.clientX, e.clientY), origPos: getPos(selected.el, selected.type) };
  }

  function onResizeStart(handle: ResizeHandle, e: React.MouseEvent) {
    if (!selected || !containerRef.current) return;
    e.preventDefault();
    const svg = containerRef.current.querySelector('svg') as SVGSVGElement;
    resizeRef.current = { svg, handle, startSvg: toSvgPt(svg, e.clientX, e.clientY), orig: getBox(selected.el) };
  }

  function onColorChange(color: string) {
    if (!selected) return;
    selected.el.setAttribute('fill', color);
    setSelected(s => s ? { ...s } : null); // re-render panel swatch
    const svgEl = containerRef.current?.querySelector('svg') as SVGSVGElement | null;
    if (svgEl) vscode.postMessage({ type: 'applyEdit', svgContent: serialize(svgEl, dims.current) });
  }

  function onBgClick() {
    if (isEditingRef.current) endTextEdit();
    else doDeselect();
  }

  // ---- derived values ----
  const canResize     = selected !== null && (selected.type === 'rect' || selected.type === 'foreignObject');
  const showColorBar  = selected !== null && selected.type !== 'foreignObject' && !isEditing;
  const fillColor     = selected?.el.getAttribute('fill') ?? '#000000';

  // ---- render ----

  if (!svgContent) {
    return (
      <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: '#475569', fontFamily: "'Segoe UI', sans-serif", gap: 16 }}>
        <div style={{ fontSize: 48, color: '#1e293b' }}>⬡</div>
        <p style={{ margin: 0, fontSize: 15 }}>SVG スライドファイルを開いてください</p>
      </div>
    );
  }

  return (
    <div
      style={{ width: '100vw', height: '100vh', display: 'grid', placeItems: 'center', background: '#1e1e1e', overflow: 'hidden', position: 'relative' }}
      onClick={e => {
        // foreignObject 内のクリック（テキスト編集中のカーソル操作など）は無視する
        if ((e.target as Element).closest?.('foreignObject')) return;
        onBgClick();
      }}
    >
      {/* Slide preview */}
      <div
        ref={containerRef}
        style={{ width: 'min(100vw, calc(100vh * 16 / 9))', aspectRatio: '16 / 9', overflow: 'hidden' }}
        dangerouslySetInnerHTML={{ __html: svgContent }}
        onDoubleClick={e => {
          // foreignObject 内コンテンツからバブルアップする dblclick を確実に捕捉
          const fo = (e.target as Element).closest?.('foreignObject') as SVGElement | null;
          if (!fo) return;
          e.stopPropagation();
          const info = elements.find(i => i.el === fo);
          if (info) startTextEdit(info);
        }}
      />

      {/* Selection overlay */}
      {selected && (
        <SelectionOverlay
          ref={overlayRef}
          bounds={selected.bounds}
          canResize={canResize}
          isEditing={isEditing}
          onMoveStart={onMoveStart}
          onResizeStart={onResizeStart}
          onDblClick={() => selected.type === 'foreignObject' ? startTextEdit() : undefined}
        />
      )}

      {/* ── Shape list panel ── */}
      <div
        style={{ position: 'fixed', top: 12, right: 12, zIndex: 9999 }}
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={() => setPanelOpen(o => !o)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#1e293b', border: '1px solid #334155', borderRadius: panelOpen ? '8px 8px 0 0' : 8, color: '#94a3b8', fontSize: 12, cursor: 'pointer', padding: '6px 10px', width: '100%' }}
        >
          <span>◈</span><span>シェイプ</span>
          <span style={{ marginLeft: 'auto', color: '#475569' }}>{panelOpen ? '▲' : '▼'}</span>
        </button>

        {panelOpen && (
          <div style={{ background: '#0f172a', border: '1px solid #334155', borderTop: 'none', borderRadius: '0 0 8px 8px', minWidth: 230, overflow: 'hidden' }}>
            {elements.map((info, i) => {
              const isSel = selected?.el === info.el;
              const fill  = info.type !== 'foreignObject' ? (info.el.getAttribute('fill') ?? null) : null;
              return (
                <div
                  key={i}
                  onClick={() => { if (isEditingRef.current) endTextEdit(); doSelect(info); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', cursor: 'pointer', background: isSel ? '#1e293b' : 'transparent', borderTop: i === 0 ? 'none' : '1px solid #1e293b' }}
                >
                  {/* Icon */}
                  <div style={{ width: 16, height: 16, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {info.type === 'foreignObject'
                      ? <span style={{ fontSize: 14, fontWeight: 'bold', color: '#6366f1' }}>T</span>
                      : info.type === 'circle'
                      ? <div style={{ width: 14, height: 14, borderRadius: '50%', background: fill?.startsWith('#') ? fill : '#555', border: '1px solid #334155' }} />
                      : <div style={{ width: 14, height: 12, borderRadius: 2,  background: fill?.startsWith('#') ? fill : '#555', border: '1px solid #334155' }} />
                    }
                  </div>
                  {/* Label */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: isSel ? '#e2e8f0' : '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{info.label}</div>
                    <div style={{ fontSize: 10, color: '#334155', fontFamily: 'monospace' }}>{info.type}</div>
                  </div>
                  {isSel && <span style={{ color: '#6366f1', fontSize: 12, flexShrink: 0 }}>●</span>}
                </div>
              );
            })}

            {/* テキスト編集ボタン / 状態ヒント */}
            {selected?.type === 'foreignObject' && !isEditing && (
              <button
                onClick={() => startTextEdit()}
                style={{ width: '100%', padding: '8px 12px', background: '#1e293b', border: 'none', borderTop: '1px solid #334155', color: '#6366f1', fontSize: 12, cursor: 'pointer', textAlign: 'left' }}
              >
                ✏️ テキストを編集
              </button>
            )}
            <div style={{ padding: '6px 12px', fontSize: 11, borderTop: '1px solid #1e293b', color: isEditing ? '#34d399' : '#334155' }}>
              {isEditing ? 'Esc または外側クリックで確定' : selected ? 'ダブルクリックまたはボタンで編集' : '要素を選択してください'}
            </div>
          </div>
        )}
      </div>

      {/* ── Color picker toolbar ── */}
      {showColorBar && (
        <div
          style={{ position: 'fixed', left: Math.min(selected!.bounds.left, window.innerWidth - 290), top: Math.max(8, selected!.bounds.top - 50), background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.6)', zIndex: 10000 }}
          onClick={e => e.stopPropagation()}
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <span style={{ fontSize: 12, color: '#64748b', fontFamily: 'monospace' }}>fill</span>
            <input
              type="color"
              value={fillColor.startsWith('#') ? fillColor : '#000000'}
              onChange={e => onColorChange(e.target.value)}
              style={{ width: 28, height: 22, padding: 0, border: '1px solid #475569', borderRadius: 4, cursor: 'pointer', background: 'none' }}
            />
            <span style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'monospace' }}>{fillColor}</span>
          </label>
          <span style={{ fontSize: 11, color: '#334155', borderLeft: '1px solid #334155', paddingLeft: 12 }}>ドラッグで移動</span>
        </div>
      )}
    </div>
  );
}

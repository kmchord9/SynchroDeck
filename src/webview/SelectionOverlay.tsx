import { forwardRef } from 'react';

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

const HANDLES: { id: ResizeHandle; top: string; left: string }[] = [
  { id: 'nw', top: '0%',   left: '0%'   },
  { id: 'n',  top: '0%',   left: '50%'  },
  { id: 'ne', top: '0%',   left: '100%' },
  { id: 'e',  top: '50%',  left: '100%' },
  { id: 'se', top: '100%', left: '100%' },
  { id: 's',  top: '100%', left: '50%'  },
  { id: 'sw', top: '100%', left: '0%'   },
  { id: 'w',  top: '50%',  left: '0%'   },
];

const CURSORS: Record<ResizeHandle, string> = {
  nw: 'nwse-resize', n: 'ns-resize',   ne: 'nesw-resize',
  e:  'ew-resize',   se: 'nwse-resize', s:  'ns-resize',
  sw: 'nesw-resize', w: 'ew-resize',
};

interface Props {
  bounds: DOMRect;
  canResize: boolean;
  isEditing: boolean;
  onMoveStart: (e: React.MouseEvent) => void;
  onResizeStart: (handle: ResizeHandle, e: React.MouseEvent) => void;
  onDblClick: () => void;
}

const PAD = 2;
const HANDLE_SIZE = 10;

export const SelectionOverlay = forwardRef<HTMLDivElement, Props>(
  ({ bounds, canResize, isEditing, onMoveStart, onResizeStart, onDblClick }, ref) => {
    const color = isEditing ? '#34d399' : '#6366f1';

    return (
      <div
        ref={ref}
        style={{
          position: 'fixed',
          left:   bounds.left   - PAD,
          top:    bounds.top    - PAD,
          width:  bounds.width  + PAD * 2,
          height: bounds.height + PAD * 2,
          border: `2px dashed ${color}`,
          cursor: isEditing ? 'text' : 'move',
          boxSizing: 'border-box',
          pointerEvents: 'auto',
          zIndex: 1000,
        }}
        onMouseDown={!isEditing ? onMoveStart : undefined}
        onDoubleClick={onDblClick}
      >
        {canResize && !isEditing && HANDLES.map(h => (
          <div
            key={h.id}
            style={{
              position: 'absolute',
              left: h.left, top: h.top,
              transform: 'translate(-50%, -50%)',
              width: HANDLE_SIZE, height: HANDLE_SIZE,
              background: color,
              border: '2px solid #ffffff',
              borderRadius: 2,
              cursor: CURSORS[h.id],
              pointerEvents: 'auto',
              zIndex: 1001,
            }}
            onMouseDown={e => { e.stopPropagation(); onResizeStart(h.id, e); }}
          />
        ))}
      </div>
    );
  }
);

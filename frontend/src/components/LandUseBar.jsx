import { useRef } from "react";

const MIN = 1;

// Draggable dividers on a land-use bar: dragging an edge moves share between two neighbours.
export const LandUseBar = ({ order, alloc, colors, onChange, disabled }) => {
  const barRef = useRef(null);
  const drag = useRef(null);

  const startDrag = (i) => (e) => {
    if (disabled) return;
    e.preventDefault();
    const rect = barRef.current.getBoundingClientRect();
    drag.current = { i, startX: e.clientX, width: rect.width, base: { ...alloc } };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", endDrag);
  };

  const onMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const leftKey = order[d.i];
    const rightKey = order[d.i + 1];
    const pct = ((e.clientX - d.startX) / d.width) * 100;
    const maxRight = d.base[rightKey] - MIN;
    const maxLeft = d.base[leftKey] - MIN;
    const delta = Math.max(-maxLeft, Math.min(maxRight, pct));
    onChange({
      ...d.base,
      [leftKey]: Math.round((d.base[leftKey] + delta) * 10) / 10,
      [rightKey]: Math.round((d.base[rightKey] - delta) * 10) / 10,
    });
  };

  const endDrag = () => {
    drag.current = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", endDrag);
  };

  let offset = 0;
  return (
    <div ref={barRef} data-testid="land-use-bar" className="relative h-12 w-full rounded-md overflow-hidden select-none border border-slate-200 bg-slate-100">
      {order.map((k) => {
        const w = alloc[k];
        const seg = (
          <div key={k} data-testid={`land-use-seg-${k}`} title={`${k} · ${w}%`}
            className="absolute top-0 h-full flex items-center justify-center text-[10px] font-semibold text-slate-900/80 transition-[left,width] duration-75"
            style={{ left: `${offset}%`, width: `${w}%`, background: colors[k] }}>
            {w >= 7 ? `${w}%` : ""}
          </div>
        );
        offset += w;
        return seg;
      })}
      {order.slice(0, -1).map((k, i) => {
        const left = order.slice(0, i + 1).reduce((s, kk) => s + alloc[kk], 0);
        return (
          <div key={`h-${k}`} data-testid={`land-use-handle-${i}`} onPointerDown={startDrag(i)}
            className={`absolute top-0 h-full w-2 -ml-1 ${disabled ? "" : "cursor-col-resize hover:bg-slate-900/20"} z-10`}
            style={{ left: `${left}%` }}>
            <div className="mx-auto h-full w-[2px] bg-white/90 shadow-[0_0_0_1px_rgba(15,23,42,0.25)]" />
          </div>
        );
      })}
    </div>
  );
};

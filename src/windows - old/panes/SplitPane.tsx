// src/windows/panes/SplitPane.tsx
/**
 * SplitPane
 *  - 3-track CSS grid: A | 2px visual line | B
 *  - Larger hit zone for dragging (no visual border is added)
 *  - minA/minB are enforced via minmax()
 *  - EPS keeps ratio away from exact bounds to avoid layout jitter/rounding
 */
import React from "react";

type Dir = "vertical" | "horizontal";

type Props = {
  direction: Dir;
  ratio: number;                 // 0..1
  onChange: (r: number) => void;
  a: React.ReactNode;
  b: React.ReactNode;
  gutterSize?: number;           // hit area (not the visual thickness)
  minA?: number;                 // px
  minB?: number;                 // px
};

export default function SplitPane({
  direction,
  ratio,
  onChange,
  a,
  b,
  gutterSize = 2,
  minA = 0,
  minB = 0,
}: Props) {
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const draggingRef = React.useRef(false);
  const [bounds, setBounds] = React.useState({ minR: 0, maxR: 1 });

  const LINE_PX   = 2;
  const HIT_PX     = gutterSize + 2;
  const LINE_COLOR = "color-mix(in srgb, #fff 10%, var(--divider))";
  const EPS = 0.001; // Keep ratio slightly within bounds to avoid rounding collisions at exact edges.

  const rSafe = clamp(ratio, bounds.minR + EPS, bounds.maxR - EPS);
  const rSnap = Math.round(rSafe * 100000) / 100000;

  const aPct = (rSnap * 100).toFixed(5);
  const bPct = ((1 - rSnap) * 100).toFixed(5);
  const lineHalf = LINE_PX / 2;

  // Enforce minA/minB while preserving the visual 2px line via calc(... - lineHalf).
  const gridStyle: React.CSSProperties =
    direction === "vertical"
      ? {
          display: "grid",
          gridTemplateColumns:
            `minmax(${minA}px, calc(${aPct}% - ${lineHalf}px)) ` +
            `${LINE_PX}px ` +
            `minmax(${minB}px, calc(${bPct}% - ${lineHalf}px))`,
          gridTemplateRows: "100%",
        }
      : {
          display: "grid",
          gridTemplateRows:
            `minmax(${minA}px, calc(${aPct}% - ${lineHalf}px)) ` +
            `${LINE_PX}px ` +
            `minmax(${minB}px, calc(${bPct}% - ${lineHalf}px))`,
          gridTemplateColumns: "100%",
        };

  const paneWrapStyle: React.CSSProperties = {
    position: "relative",
    width: "100%",
    height: "100%",
    minWidth: 0,
    minHeight: 0,
    overflow: "hidden",
    border: "none",
    boxShadow: "none", 
  };

  React.useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const recompute = () => {
      const rect = el.getBoundingClientRect();
      const total = direction === "vertical" ? rect.width : rect.height;
      const T = Math.max(1, total);
      const minR = Math.max(0, (minA || 0) / T);
      const maxR = Math.min(1, 1 - (minB || 0) / T);
      setBounds({ minR, maxR });
    };

    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    recompute();
    return () => ro.disconnect();
  }, [direction, minA, minB]);

  return (
    <div
      ref={rootRef}
      style={{
        position: "relative",
        width: "100%",
        height: "100%", 
        minWidth: 0,
        minHeight: 0,
        ...gridStyle,
      }}
    >      
      <div style={paneWrapStyle}>{a}</div>

      {/* Drag hit zone: extends beyond the 2px visual line; pointer handlers live here. */}
      <div
        role="separator"
        aria-orientation={direction === "vertical" ? "vertical" : "horizontal"}
        style={{
          position: "relative",
          userSelect: "none",
          touchAction: "none",
          zIndex: 15,
          background: "transparent",
        }}
      >
        <div
          style={
            direction === "vertical"
              ? {
                  position: "absolute",
                  top: 0, 
                  bottom: 0,
                  left: 0,
                  width: LINE_PX,
                  background: LINE_COLOR,
                  pointerEvents: "none"
                }
              : {
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: 0,
                  height: LINE_PX,
                  background: LINE_COLOR,
                  pointerEvents: "none",
                }
          }
        />
        <div
          onPointerDown={(e) => {
            if (!rootRef.current) return;
            draggingRef.current = true;
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!draggingRef.current || !rootRef.current) return;
            const rect = rootRef.current.getBoundingClientRect();
            if (direction === "vertical") {
              const total = rect.width || 1;
              const minR = Math.max(0, (minA || 0) / total);
              const maxR = Math.min(1, 1 - (minB || 0) / total);
              const x = e.clientX - rect.left;
              const r = (x - HIT_PX * 0.5) / total;
              onChange(clamp(r, minR, maxR));
            } else {
              const total = rect.height || 1;
              const minR = Math.max(0, (minA || 0) / total);
              const maxR = Math.min(1, 1 - (minB || 0) / total);
              const y = e.clientY - rect.top;
              const r = (y - HIT_PX * 0.5) / total;
              onChange(clamp(r, minR, maxR));
            }
          }}
          onPointerUp={(e) => {
            if (!draggingRef.current) return;
            draggingRef.current = false;
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
          }}
          style={
            direction === "vertical"
              ? {
                  position: "absolute",
                  top: -8,
                  bottom: -8,
                  left: -(HIT_PX - LINE_PX) / 2,
                  width: HIT_PX,
                  cursor: "col-resize",
                  background: "transparent",
                }
              : {
                  position: "absolute",
                  left: -8,
                  right: -8,
                  top: -(HIT_PX - LINE_PX) / 2,
                  height: HIT_PX,
                  cursor: "row-resize",
                  background: "transparent",
                }
          }
        />
      </div>

      <div style={paneWrapStyle}>{b}</div>
    </div>
  );
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

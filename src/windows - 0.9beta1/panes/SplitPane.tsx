// src/windows/panes/SplitPane.tsx
import React from "react";

type Dir = "vertical" | "horizontal";

type Props = {
  direction: Dir;
  ratio: number;                 // 0..1
  onChange: (next: number) => void;
  gutterSize?: number;           // 보이는 선 두께, 기본 2
  minA?: number;                 // A 최소 px
  minB?: number;                 // B 최소 px
  pathKey?: string;
  disableAnim?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  a: React.ReactNode;
  b: React.ReactNode;
};

const clamp01 = (x:number) => Math.max(0.0001, Math.min(0.9999, x));

export default function SplitPane({
  direction,
  ratio,
  onChange,
  gutterSize = 2,
  minA = 48,
  minB = 48,
  pathKey,
  disableAnim,
  onDragStart,
  onDragEnd,
  a,
  b,
}: Props) {
  const rootRef = React.useRef<HTMLDivElement|null>(null);

  // 드래그 상태
  const draggingRef = React.useRef(false);
  const ptrIdRef    = React.useRef<number|null>(null);
  const dragRef     = React.useRef<{size:number; start:number; axis0:number} | null>(null);

  const isVert = direction === "vertical"; // 좌우 분할
  const R = clamp01(ratio);

  // ── Grid 레이아웃
  const gridStyle: React.CSSProperties = isVert
    ? {
        display: "grid",
        gridTemplateColumns: `minmax(${minA}px, ${R*100}%) ${gutterSize}px minmax(${minB}px, 1fr)`,
        gridTemplateRows: "1fr",
        alignItems: "stretch",
        justifyItems: "stretch",
      }
    : {
        display: "grid",
        gridTemplateRows: `minmax(${minA}px, ${R*100}%) ${gutterSize}px minmax(${minB}px, 1fr)`,
        gridTemplateColumns: "1fr",
        alignItems: "stretch",
        justifyItems: "stretch",
      };

  const cellCommon: React.CSSProperties = {
    minWidth: 0,
    minHeight: 0,
    overflow: "hidden",
    width: "100%",
    height: "100%",
  };

  const visualStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.10)",
    boxShadow: isVert
      ? "inset 1px 0 rgba(255,255,255,0.06), inset -1px 0 rgba(0,0,0,0.35)"
      : "inset 0 1px rgba(255,255,255,0.06), inset 0 -1px rgba(0,0,0,0.35)",
    pointerEvents: "none", // 순수 시각선
  };

  // ── 드래그 히트박스(그리드 위에 겹치는 오버레이)
  const HIT = Math.max(16, gutterSize + 12);
  const hitStyle: React.CSSProperties = isVert
    ? {
        position: "absolute",
        top: 0,
        bottom: 0,
        left: `calc(${R*100}% - ${HIT/2}px)`,
        width: HIT,
        cursor: "col-resize",
        zIndex: 10,
        touchAction: "none",     // 터치/펜 제스처 해제
        userSelect: "none",
      }
    : {
        position: "absolute",
        left: 0,
        right: 0,
        top: `calc(${R*100}% - ${HIT/2}px)`,
        height: HIT,
        cursor: "row-resize",
        zIndex: 10,
        touchAction: "none",
        userSelect: "none",
      };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    rootRef.current?.style.setProperty("user-select","none");

    const root = rootRef.current;
    if (!root) return;

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    ptrIdRef.current = e.pointerId;
    draggingRef.current = true;

    const rect = root.getBoundingClientRect();
    const size = isVert ? rect.width : rect.height;
    const axis0 = isVert ? e.clientX : e.clientY;
    dragRef.current = { size, start: R * size, axis0 };

    onDragStart?.();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    e.preventDefault();
    if (!draggingRef.current) return;
    if ((e.buttons & 1) === 0) { endDrag(e); return; }

    const d = dragRef.current;
    if (!d) return;

    const cur = isVert ? e.clientX : e.clientY;
    const nextA = Math.max(minA, Math.min(d.size - minB, d.start + (cur - d.axis0)));
    onChange(clamp01(nextA / d.size));
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    dragRef.current = null;
    try {
      if (ptrIdRef.current != null) {
        (e.currentTarget as HTMLElement).releasePointerCapture(ptrIdRef.current);
      }
    } catch {}
    ptrIdRef.current = null;
    rootRef.current?.style.removeProperty("user-select");
    onDragEnd?.();
  };

  return (
    <div
      className="sw-pane"
      data-dir={direction}
      data-key={pathKey}
      ref={rootRef}
      style={{
        position: "relative",
        boxSizing: "border-box",
        minWidth: 0,
        minHeight: 0,
        width: "100%",
        height: "100%",
        ...gridStyle,
        transition: disableAnim ? "none" : "none",
      }}
    >
      {/* A 셀 */}
      <div className="sw-cell" style={{ ...cellCommon, ...(isVert ? { gridColumn: 1 } : { gridRow: 1 }) }}>
        {a}
      </div>

      {/* Gutter 시각선 */}
      <div
        style={{
          ...(isVert ? { gridColumn: 2, width: gutterSize } : { gridRow: 2, height: gutterSize }),
          ...visualStyle,
        }}
        aria-hidden
      />

      {/* B 셀 */}
      <div className="sw-cell" style={{ ...cellCommon, ...(isVert ? { gridColumn: 3 } : { gridRow: 3 }) }}>
        {b}
      </div>

      {/* 히트박스 오버레이 */}
      <div
        style={hitStyle}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
      />
    </div>
  );
}

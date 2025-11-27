// src/windows/panes/LeafPane.tsx
/**
 * LeafPane
 * Wraps a single board and exposes a split handle (top-left).
 * Drag the handle to choose horizontal/vertical; emits onRequestSplit.
 * Shows a non-interactive H/V guide overlay during drag (no layout impact).
 */
import React, { useEffect, useState } from "react";
import handleIcon from "../icons/handle.png";

type LeafKind = "text" | "image" | "viewer" | "edit";

type Props = {
  leafId: string;
  kind: LeafKind;
  children: React.ReactNode;
  onOpenMenu?: (
    leafId: string,
    pt: { x: number; y: number },
    source?: "handle" | "content"
  ) => void;
  onRequestSplit?: (leafId: string, dir: "horizontal" | "vertical") => void;
};

export default function LeafPane({ leafId, children, onOpenMenu, onRequestSplit }: Props) {
  const [dragging, setDragging] = useState(false);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [dir, setDir] = useState<"horizontal" | "vertical" | null>(null);

  // Direction detection: lock to H or V after movement exceeds ~6px to avoid jitter.
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const p = { x: e.clientX, y: e.clientY };
      if (!start) return;
      const dx = p.x - start.x;
      const dy = p.y - start.y;
      const adx = Math.abs(dx);
      const ady = Math.abs(dy);
      setDir(adx < 6 && ady < 6 ? null : ady > adx ? "horizontal" : "vertical");
    };
    const onUp = () => {
      setDragging(false);
      if (dir) onRequestSplit?.(leafId, dir);
      setDir(null);
      setStart(null);
    };
    window.addEventListener("mousemove", onMove, true);
    window.addEventListener("mouseup", onUp, true);
    return () => {
      window.removeEventListener("mousemove", onMove, true);
      window.removeEventListener("mouseup", onUp, true);
    };
  }, [dragging, dir, leafId, onRequestSplit, start]);

  // Drag hint overlay: draws a 2px guide line and a small "H"/"V" chip; pointer-events: none.
  // z-index keeps it above board content and below global menus.
  const renderPreview = () => {
    if (!dragging || !dir) return null;
    return (
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 13 }}>
        {dir === "horizontal" ? (
          <div
            style={{
              position: "absolute",
              left: 6,
              right: 6,
              top: "50%",
              height: 2,
              transform: "translateY(-1px)",
              background: "rgba(255,255,255,0.35)",
              boxShadow: "none",
              borderRadius: 1,
            }}
          />
        ) : (
          <div
            style={{
              position: "absolute",
              top: 6,
              bottom: 6,
              left: "50%",
              width: 2,
              transform: "translateX(-1px)",
              background: "rgba(255,255,255,0.35)",
              boxShadow: "none",
              borderRadius: 1,
            }}
          />
        )}
        <div
          style={{
            position: "absolute",
            top: 10,
            left: 36,
            padding: "4px 8px",
            fontSize: 12,
            borderRadius: 8,
            background: "rgba(26,28,32,0.98)",
            border: "1px solid rgba(255,255,255,0.12)",
            color: "#e7eaee",
            boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
          }}
        >
          {dir === "horizontal" ? "H" : "V"}
        </div>
      </div>
    );
  };

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minWidth: 0,
        minHeight: 0,
        overflow: "hidden",
        outline: "none",
      }}
      // Forward board-body context menu to parent with source="content".
      onContextMenu={(e) => {
        if (!onOpenMenu) return;
        e.preventDefault();
        onOpenMenu(leafId, { x: e.clientX, y: e.clientY }, "content");
      }}
    >
      <div style={{ position: "absolute", inset: 0, minWidth: 0, minHeight: 0 }}>
        {children}
      </div>

      {/* Split handle (top-left): left-drag to start split; right-click opens leaf menu.
          Stop propagation so the board doesn't treat it as a pan/selection. */}

      <div
        title="Split handle (drag: choose H/V)"
        onContextMenu={(e) => {
          if (!onOpenMenu) return;
          e.preventDefault();
          e.stopPropagation();
          onOpenMenu(leafId, { x: e.clientX, y: e.clientY }, "handle");
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
          setDragging(true);
          setStart({ x: e.clientX, y: e.clientY });
        }}
        style={{
          position: "absolute",
          top: 3,
          left: 11,
          width: 24,
          height: 24,
          display: "grid",
          placeItems: "center",
          borderRadius: 6,
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.10)",
          boxShadow: "0 2px 6px rgba(0,0,0,0.35)",
          cursor: "grab",
          userSelect: "none",
          zIndex: 12,
        }}
      >
        <img
          src={handleIcon}
          alt="handle"
          style={{ width: 14, height: 14, opacity: 0.5, pointerEvents: "none" }}
          draggable={false}
        />
      </div>

      {renderPreview()}
    </div>
  );
}

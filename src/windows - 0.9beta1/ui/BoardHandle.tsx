import React from "react";

export default function BoardHandle({
  onMouseDown,
  src = "/assets/icons/Handle.png",
  size = 16,                      // 아이콘 자체 크기
  title = "Board",
}: {
  onMouseDown?: (e: React.MouseEvent) => void;
  src?: string;
  size?: number;
  title?: string;
}) {
  return (
    <button
      title={title}
      onMouseDown={(e) => { e.stopPropagation(); onMouseDown?.(e); }}
      style={{
        position: "absolute",
        left: 8, top: 8,
        width: 26, height: 26,             // 고정 정사각
        padding: 4,
        borderRadius: 3,
        border: "1px solid rgba(255,255,255,0.18)",
        background: "rgba(0,0,0,0.28)",
        backdropFilter: "blur(2px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "grab",
        zIndex: 5,
      }}
    >
      <img
        src={src}
        alt=""
        style={{ width: size, height: size, display: "block", pointerEvents: "none" }}
      />
    </button>
  );
}

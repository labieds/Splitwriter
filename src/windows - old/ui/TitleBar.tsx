// src/windows/ui/TitleBar.tsx
import React from "react";
import { appWindow } from "@tauri-apps/api/window";

const OCEAN = "#2AA4FF";

export default function TitleBar() {
  const isTauri =
    typeof window !== "undefined" &&
    (("__TAURI_IPC__" in window) || (window as any).__TAURI__);

  const minimize = () => { if (isTauri) appWindow.minimize(); };

  const toggleFullscreen = async () => {
    if (!isTauri) return;
    const f = await appWindow.isFullscreen();
    await appWindow.setFullscreen(!f);
  };

  // Close = behave like Quit (emit -> MainUI listener handles dirty/confirm/save)
  const close = async () => {
    if (isTauri) {
      try {
        const { emit } = await import("@tauri-apps/api/event");
        await emit("sw:quit");
        return;
      } catch {
        try { await appWindow.close(); } catch {}
        return;
      }
    }
    try {
      window.dispatchEvent(new CustomEvent("sw:quit")); // dev fallback
      window.close();
    } catch {}
  };

  return (
    <div className="h-9 flex items-center justify-between px-2 border-b border-white/10 bg-[#0f0f10] select-none flex-shrink-0">
      <div
        className="flex-1 h-full flex items-center gap-2 text-xs text-white/60 pr-2"
        data-tauri-drag-region
        onDoubleClick={toggleFullscreen}
      >
        <span className="uppercase tracking-widest">SPLITWRITER</span>
      </div>

      <div className="flex items-center gap-1">
        <button
          className="w-9 h-6 grid place-items-center rounded hover:bg-white/10 focus:outline-none"
          title="Minimize"
          aria-label="Minimize window"
          onClick={minimize}
          disabled={!isTauri}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" className="opacity-80">
            <rect x="2" y="5.5" width="8" height="1" fill="currentColor" />
          </svg>
        </button>

        <button
          className="w-9 h-6 grid place-items-center rounded hover:bg-white/10 focus:outline-none"
          title="Fullscreen"
          aria-label="Toggle fullscreen"
          onClick={toggleFullscreen}
          disabled={!isTauri}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" className="opacity-80">
            <path d="M2 5V2h3M7 2h3v3M10 7v3H7M5 10H2V7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
        </button>

        <button
          className="w-9 h-6 grid place-items-center rounded hover:bg-red-500/20 focus:outline-none"
          title="Close"
          aria-label="Close window"
          onClick={close}
          disabled={!isTauri}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" className="opacity-80">
            <path d="M2.2 2.2 9.8 9.8M9.8 2.2 2.2 9.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      <style>{`.btn:focus-visible{outline:none;box-shadow:0 0 0 1px ${OCEAN}66}`}</style>
    </div>
  );
}

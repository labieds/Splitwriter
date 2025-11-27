// src/windows/ui/TitleBar.tsx
import React from "react";
import { appWindow } from "@tauri-apps/api/window";
import { quitWithGuard } from "../runtime/appActions";

const OCEAN = "#2AA4FF";

declare global {
  interface Window {
    __SW_CURRENT_FILE__?: string;
  }
}

function basename(p: string): string {
  if (!p) return "";
  const m = p.match(/[^\\/]+$/);
  return m ? m[0] : p;
}

export default function TitleBar() {
  const isTauri =
    typeof window !== "undefined" &&
    (("__TAURI_IPC__" in window) || (window as any).__TAURI__);

  const [fileLabel, setFileLabel] = React.useState<string>("");

  // 파일 라벨
  React.useEffect(() => {
    const cur = (window as any).__SW_CURRENT_FILE__ as string | undefined;
    if (cur) setFileLabel(basename(cur));

    const onOpened = (e: any) => {
      const p = e?.detail?.path as string | undefined;
      if (p) setFileLabel(basename(p));
    };
    window.addEventListener("sw:file:opened", onOpened as any);
    return () => window.removeEventListener("sw:file:opened", onOpened as any);
  }, []);

  const minimize = () => { if (isTauri) appWindow.minimize(); };

  const toggleFullscreen = async () => {
    if (!isTauri) return;
    const f = await appWindow.isFullscreen();
    await appWindow.setFullscreen(!f);
  };

  // X 버튼: 이벤트 emit/OS close 요청 금지. 오직 quitWithGuard만 호출.
  const closingRef = React.useRef(false);
  const close = async () => {
    if (closingRef.current) return;
    closingRef.current = true;
    try {
      await quitWithGuard();
    } finally {
      closingRef.current = false;
    }
  };

  return (
    <div className="h-9 flex items-center justify-between px-2 border-b border-white/10 bg-[#0f0f10] select-none flex-shrink-0">
      <div
        className="flex-1 h-full flex items-center gap-2 text-xs text-white/60 pr-2"
        data-tauri-drag-region
        onDoubleClick={toggleFullscreen}
      >
        <span className="uppercase tracking-widest">SPLITWRITER</span>
        {fileLabel ? <span className="opacity-60">· {fileLabel}</span> : null}
      </div>

      <div className="flex items-center gap-1">
        <button
          className="titlebar-btn w-9 h-6 grid place-items-center rounded hover:bg-white/10 focus:outline-none"
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
          className="titlebar-btn w-9 h-6 grid place-items-center rounded hover:bg-white/10 focus:outline-none"
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
          className="titlebar-btn w-9 h-6 grid place-items-center rounded hover:bg-red-500/20 focus:outline-none"
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

      <style>{`.titlebar-btn:focus-visible{outline:none;box-shadow:0 0 0 1px ${OCEAN}66}`}</style>
    </div>
  );
}

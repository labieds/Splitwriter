// Extend React CSSProperties to support -webkit-app-region
import "react";

declare module "react" {
  interface CSSProperties {
    /** Tauri/Electron window drag regions */
    WebkitAppRegion?: "drag" | "no-drag";
  }
}

export {};

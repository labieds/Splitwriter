// src/windows/boards/text-engine/index.ts
export * from "./engine"; // 여기 안에 Preset/type/함수들이 이미 있음 — 중복 재선언 금지

export { scrubExternalTextColors, normalizePasteColors } from "./clipboard";
export { readPresetFromSelectionEnd } from "./selection";

export type { CurlyPref } from "./curly";
export { normalizeCurly, handleCurlyKeyDown } from "./curly";

export { useWritingGoal } from "./writingGoal";

export { makeBoardId } from "./id";

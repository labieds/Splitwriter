// Typewriter 토글 유틸 (컨텍스트 메뉴용)

type BoardCmd = "typewriter" | "spell";

function dispatch(id: string, type: BoardCmd, value?: boolean) {
  if (!id) return;
  window.dispatchEvent(new CustomEvent("sw:board:cmd", { detail: { id, type, value } }));
}

function getBoardElFrom(target?: Element | null) {
  return (target ?? document.activeElement)?.closest?.("[data-board-id]") as HTMLElement | null;
}

export function getBoardIdFrom(target?: Element | null) {
  return getBoardElFrom(target)?.getAttribute("data-board-id") ?? "";
}

export function isTypewriterEnabled(target?: Element | null) {
  const el = getBoardElFrom(target);
  return el?.getAttribute("data-typewriter") === "1";
}

export function setTypewriterEnabled(id: string, on?: boolean) {
  dispatch(id, "typewriter", on);
}

// 컨텍스트 메뉴 한 항목 생성(✓ 포함)
export function makeTypewriterMenuItem(target?: Element | null) {
  const id = getBoardIdFrom(target);
  const on = isTypewriterEnabled(target);
  const mark = on ? "✓ " : "";
  return {
    label: `${mark}Typewriter`,
    onClick: () => setTypewriterEnabled(id, !on),
  };
}

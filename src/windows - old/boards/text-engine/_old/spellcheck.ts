// Spell Checker 토글 유틸 (컨텍스트 메뉴용)

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

export function isSpellEnabled(target?: Element | null) {
  const el = getBoardElFrom(target);
  const ed = el?.querySelector('[contenteditable="true"]') as HTMLElement | null;
  return ed?.getAttribute("spellcheck") === "true";
}

export function setSpellEnabled(id: string, on?: boolean) {
  dispatch(id, "spell", on);
}

export function makeSpellMenuItem(target?: Element | null) {
  const id = getBoardIdFrom(target);
  const on = isSpellEnabled(target);
  const mark = on ? "✓ " : "";
  return {
    label: `${mark}Spell Checker`,
    onClick: () => setSpellEnabled(id, !on),
  };
}

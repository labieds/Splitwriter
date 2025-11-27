// 텍스트 붙여넣기 정리 유틸
export function scrubExternalTextColors(root: HTMLElement) {
  const clearColorOn = (el: HTMLElement) => {
    if (el.style && el.style.color) el.style.removeProperty("color");
    if ((el.style as any).webkitTextFillColor)
      el.style.removeProperty("-webkit-text-fill-color");
    if (el.tagName === "FONT" && el.hasAttribute("color"))
      el.removeAttribute("color");
  };

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let node = walker.nextNode() as HTMLElement | null;
  while (node) {
    if (node !== root) clearColorOn(node);
    node = walker.nextNode() as HTMLElement | null;
  }
}

export function normalizePasteColors(ed: HTMLElement) {
  scrubExternalTextColors(ed);
  ed.style.setProperty("color", "var(--text-1)", "important");
  (ed.style as any).setProperty("-webkit-text-fill-color", "currentColor");
}

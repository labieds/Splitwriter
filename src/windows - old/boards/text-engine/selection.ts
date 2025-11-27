// selection.ts
import type { Preset } from "./engine";

const PSEL =
  'p[data-sw-paragraph],h1[data-sw-paragraph],h2[data-sw-paragraph],h3[data-sw-paragraph],h4[data-sw-paragraph],h5[data-sw-paragraph],h6[data-sw-paragraph]';

export function readPresetFromSelectionEnd(editor: HTMLElement): Preset | null {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;

  const r = sel.getRangeAt(0).cloneRange();
  const endNode = r.endContainer;
  if (!editor.contains(endNode)) return null;

  const anchorEl =
    endNode.nodeType === 1
      ? (endNode as Element)
      : ((endNode.parentElement as Element) || null);
  const para = anchorEl?.closest(PSEL) as HTMLElement | null;
  if (!para) return null;

  const m = para.className.match(/\bsw-preset-(\d)\b/);
  const n = m ? (parseInt(m[1], 10) as Preset) : null;
  return n && n >= 1 && n <= 4 ? n : 2;
}

/** 선택을 주어진 좌우 문자로 감싸거나, 캐럿이면 여닫이를 판단해 1글자 삽입 */
export function surroundSelectionOrInsert(
  left: string,
  right: string,
  editor: HTMLElement
) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;
  const r = sel.getRangeAt(0);

  if (!r.collapsed) {
    const text = r.toString();
    document.execCommand("insertText", false, left + text + right);
    return;
  }

  let prev = "";
  try {
    const probe = r.cloneRange();
    probe.setStart(editor, 0);
    prev = probe.toString().slice(-1) || "";
  } catch {}
  const open = !prev || /[\s([{<"'\u00A0]/.test(prev);
  const ch = open ? left : right;
  document.execCommand("insertText", false, ch);
}

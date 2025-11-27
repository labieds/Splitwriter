// engine.ts — Splitwriter core (Clean-Slate R1)
// 목표: 문단 단위 preset, 캐럿 안정화, 예약 preset(문단 밖/다음줄) + 관리형 Enter
// 외부 의존: 없음. 시스템 Bold/Italic/Align 사용.

export type Preset = 1 | 2 | 3 | 4;

export interface EngineRefs {
  editor: HTMLElement;
  scroller?: HTMLElement;
  lastSel?: Range | null;
  nextPreset?: Preset | undefined; // 예약 프리셋
}

export type TFOut = {
  family: string;
  size: number;
  lineHeight: number;
  weight?: number | string;
  style?: "normal" | "italic" | "oblique";
};

export interface Hooks {
  onPresetChange?: (n: Preset) => void;
  scheduleSave?: () => void;
}

/* ----------------- 기본 유틸 ----------------- */
const PSEL = "[data-sw-paragraph]";

export function focusEditor(refs: EngineRefs) {
  const ed = refs.editor;
  if (!ed) return;
  try { (ed as any).focus?.({ preventScroll: true }); }
  catch { ed.focus(); }
}

export function snapshotSelection(refs: EngineRefs): Range | null {
  const ed = refs.editor, sel = window.getSelection();
  if (!ed || !sel || !sel.rangeCount) return null;
  const r = sel.getRangeAt(0);
  if (!ed.contains(r.startContainer)) return null;
  try { return r.cloneRange(); } catch { return null; }
}

export function restoreSelection(refs: EngineRefs, snap: Range | null): boolean {
  const ed = refs.editor, sel = window.getSelection();
  if (!ed || !sel || !snap) return false;
  if (!ed.contains(snap.startContainer)) return false;
  try {
    focusEditor(refs);
    sel.removeAllRanges();        // ★ 중복 range로 꼬임 방지
    sel.addRange(snap);
    return true;
  } catch { return false; }
}

async function withStableCaret<T>(refs: EngineRefs, fn: () => T | Promise<T>): Promise<T> {
  const snap = snapshotSelection(refs);
  try { return await fn(); }
  finally {
    const ed = refs.editor, sel = window.getSelection();
    const ok = !!(sel && sel.rangeCount && ed.contains(sel.getRangeAt(0).startContainer));
    if (!ok) restoreSelection(refs, snap);
  }
}

/* --------------- selection keeper --------------- */
function setKeeperFrozen(ed: HTMLElement, v: boolean) { (ed as any)._swKeepFrozen = v ? 1 : 0; }
function isKeeperFrozen(ed: HTMLElement) { return !!(ed as any)._swKeepFrozen; }

export function installSelectionKeeper(refs: EngineRefs) {
  const ed = refs.editor;
  if (!ed || (ed as any)._swKeeper) return;
  const onSelChange = () => {
    if (isKeeperFrozen(ed)) return;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const r = sel.getRangeAt(0);
    if (ed.contains(r.startContainer)) {
      try { refs.lastSel = r.cloneRange(); } catch {}
    }
  };
  document.addEventListener("selectionchange", onSelChange);
  ed.addEventListener("keyup", onSelChange);
  ed.addEventListener("mouseup", onSelChange);
  ed.addEventListener("input", onSelChange);
  (ed as any)._swKeeper = onSelChange;
}
export function uninstallSelectionKeeper(refs: EngineRefs) {
  const ed = refs.editor as any, h = ed?._swKeeper as any;
  if (!h) return;
  document.removeEventListener("selectionchange", h);
  ed.removeEventListener("keyup", h);
  ed.removeEventListener("mouseup", h);
  ed.removeEventListener("input", h);
  ed._swKeeper = null;
}

/* ---------------- 문단 유틸 ---------------- */
function ensureParagraphAttributes(ed: HTMLElement) {
  Array.from(ed.children).forEach(el => {
    if (!(el instanceof HTMLElement)) return;
    if (!el.hasAttribute("data-sw-paragraph")) el.setAttribute("data-sw-paragraph","1");
    if (!/sw-preset-\d/.test(el.className)) el.classList.add("sw-preset-2"); // 기본 body
  });
}

function getCaretParagraph(ed: HTMLElement): HTMLElement | null {
  const sel = window.getSelection(); if (!sel || !sel.rangeCount) return null;
  const r = sel.getRangeAt(0);
  const an = (r.startContainer.nodeType === 1
    ? (r.startContainer as HTMLElement) : (r.startContainer.parentElement as HTMLElement));
  return an ? (an.closest(PSEL) as HTMLElement | null) : null;
}

function getActiveParagraphsStrict(ed: HTMLElement): HTMLElement[] {
  const sel = window.getSelection(); if (!sel || !sel.rangeCount) return [];
  const r = sel.getRangeAt(0);
  const paras = Array.from(ed.querySelectorAll<HTMLElement>(PSEL));
  if (r.collapsed) {
    const p = getCaretParagraph(ed);
    return p ? [p] : (paras[0] ? [paras[0]] : []);
  }
  const sIdx = paras.findIndex(p => p.contains(r.startContainer));
  const eIdx = paras.findIndex(p => p.contains(r.endContainer));
  if (sIdx < 0 || eIdx < 0) return [];
  const lo = Math.min(sIdx, eIdx), hi = Math.max(sIdx, eIdx);
  return paras.slice(lo, hi + 1);
}

function currentPresetOf(p: HTMLElement): Preset {
  if (p.classList.contains("sw-preset-1")) return 1;
  if (p.classList.contains("sw-preset-3")) return 3;
  if (p.classList.contains("sw-preset-4")) return 4;
  return 2;
}

function applyPresetToParagraph(p: HTMLElement, preset: Preset) {
  p.classList.remove("sw-preset-1","sw-preset-2","sw-preset-3","sw-preset-4");
  p.classList.add(`sw-preset-${preset}`);
  // 인라인 오버라이드 정리 (font-family/size/line-height/style/text-align만)
  const walker = document.createTreeWalker(p, NodeFilter.SHOW_ELEMENT);
  let n = walker.nextNode() as HTMLElement | null;
  while (n) {
    if (n !== p) {
      const st = n.style;
      st.removeProperty?.("font");
      st.removeProperty?.("font-family");
      st.removeProperty?.("font-size");
      st.removeProperty?.("line-height");
      st.removeProperty?.("font-style");
      st.removeProperty?.("text-align");
      // font-weight는 시스템 Bold를 위해 유지
    }
    n = walker.nextNode() as HTMLElement | null;
  }
}

/* --------------- 관리형 Enter: 예약 프리셋 즉시 반영 --------------- */
function splitParagraphAtCaret(refs: EngineRefs, reserved?: Preset) {
  const ed = refs.editor, sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;
  const r = sel.getRangeAt(0);
  const p = getCaretParagraph(ed); if (!p) return;

  // p의 앞부분/뒷부분 쪼개기
  const left = document.createRange(); left.selectNodeContents(p); left.setEnd(r.startContainer, r.startOffset);
  const right = document.createRange(); right.selectNodeContents(p); right.setStart(r.startContainer, r.startOffset);

  const newP = document.createElement(p.tagName.toLowerCase());
  newP.setAttribute("data-sw-paragraph","1");
  const nextPreset = reserved ?? currentPresetOf(p);
  newP.classList.add(`sw-preset-${nextPreset}`);
  if (p.style.textAlign) newP.style.textAlign = p.style.textAlign;

  const frag = right.extractContents();
  if (!frag.hasChildNodes()) newP.appendChild(document.createElement("br"));
  else newP.appendChild(frag);

  if (!p.hasChildNodes()) p.appendChild(document.createElement("br"));

  p.after(newP);

  // 캐럿을 새 문단 맨 앞
  const rr = document.createRange();
  rr.selectNodeContents(newP); rr.collapse(true);
  sel.removeAllRanges(); sel.addRange(rr);
}

/* ---------------- 프리셋 적용 (외부 API) ---------------- */
export function applyPreset(preset: Preset, refs: EngineRefs, _tf?: TFOut, hooks?: Hooks) {
  const ed = refs.editor; if (!ed) return;
  const sel = window.getSelection();
  const collapsed = !!(sel && sel.rangeCount && sel.getRangeAt(0).collapsed);

  // 캐럿만 있는 경우 → DOM 변경 없이 예약만 (툴바 리렌더로 포커스 흔들지 않음)
  if (collapsed) {
    refs.nextPreset = preset;
    return;
  }

  // 선택이 있거나, 캐럿이 문단 안이면 즉시 반영
  withStableCaret(refs, () => {
    focusEditor(refs);
    setKeeperFrozen(ed, true);
    try {
      ensureParagraphAttributes(ed);
      const targets = getActiveParagraphsStrict(ed);
      for (const p of targets) applyPresetToParagraph(p, preset);
    } finally {
      setKeeperFrozen(ed, false);
    }
    refs.lastSel = snapshotSelection(refs);
    hooks?.onPresetChange?.(preset);
    hooks?.scheduleSave?.();
  });
}

/* --------------- Align / Bold / Italic ---------------- */
export function setDefaultAlign(kind: "left" | "center" | "right" | "justify", refs: EngineRefs) {
  const ed = refs.editor; if (!ed) return;
  ed.style.textAlign = (kind === "justify" ? "justify" : kind);
}

export function setAlign(kind: "left" | "center" | "right" | "justify", refs: EngineRefs, hooks?: Hooks) {
  const ed = refs.editor; if (!ed) return;
  withStableCaret(refs, () => {
    const snap = snapshotSelection(refs);
    setKeeperFrozen(ed, true);
    try {
      ensureParagraphAttributes(ed);
      const targets = getActiveParagraphsStrict(ed);
      for (const p of targets) p.style.textAlign = (kind === "justify" ? "justify" : kind);
      if (snap) restoreSelection(refs, snap);
    } finally { setKeeperFrozen(ed, false); }
    refs.lastSel = snapshotSelection(refs);
    hooks?.scheduleSave?.();
  });
}

export function toggleBold(refs: EngineRefs, hooks?: Hooks) {
  focusEditor(refs);
  setKeeperFrozen(refs.editor, true);
  try { document.execCommand?.("bold"); } catch {}
  finally { setKeeperFrozen(refs.editor, false); }
  refs.lastSel = snapshotSelection(refs); hooks?.scheduleSave?.();
}
export function toggleItalic(refs: EngineRefs, hooks?: Hooks) {
  focusEditor(refs);
  setKeeperFrozen(refs.editor, true);
  try { document.execCommand?.("italic"); } catch {}
  finally { setKeeperFrozen(refs.editor, false); }
  refs.lastSel = snapshotSelection(refs); hooks?.scheduleSave?.();
}

/* ---------------- 프리셋 CSS & 테이블 ---------------- */
export type FontTriplet = { name: string; style: string; size: number };

function toStack(name?: string) {
  const base = "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, 'Noto Sans', 'Apple SD Gothic Neo', sans-serif";
  const s = (name || "").trim();
  if (!s || /system[- ]?ui|auto/i.test(s)) return base;
  return s.includes(",") ? s : `${s}, ${base}`;
}
function parseWeightStyleTokens(s0?: string): { weight?: number; style?: "normal"|"italic"|"oblique" } {
  const s = (s0 || "").toLowerCase().replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();
  const style: "normal"|"italic"|"oblique" = /oblique/.test(s) ? "oblique" : (/italic/.test(s) ? "italic" : "normal");
  const m = s.match(/\b([1-9]00)\b/); let weight = m ? parseInt(m[1], 10) : undefined;
  if (weight == null) {
    if (/\bhairline|thin\b/.test(s)) weight = 100;
    else if (/\bextra\s*light|\bultra\s*light\b/.test(s)) weight = 200;
    else if (/\blight\b/.test(s)) weight = 300;
    else if (/\bregular|book|roman|normal|plain\b/.test(s)) weight = 400;
    else if (/\bmedium\b/.test(s)) weight = 500;
    else if (/\bsemi\s*bold|\bdemi(\s*bold)?\b/.test(s)) weight = 600;
    else if (/\bextra\s*bold|\bultra\s*bold\b/.test(s)) weight = 800;
    else if (/\bblack|heavy\b/.test(s)) weight = 900;
    else if (/\bbold\b/.test(s)) weight = 700;
  }
  return { weight, style };
}
function tripletToTFOut(tr: FontTriplet, lhRatio = 1.5): TFOut {
  const { weight, style } = parseWeightStyleTokens(tr.style);
  const size = Math.max(8, tr.size | 0);
  return { family: toStack(tr.name), size, lineHeight: Math.round(size * lhRatio), weight, style };
}

export function buildPresetTable(typefaces?: any) {
  const fb: Record<Preset, TFOut> = {
    1: { family: "system-ui", size: 22, lineHeight: 32, style: "normal" },
    2: { family: "system-ui", size: 16, lineHeight: 24, style: "normal" },
    3: { family: "system-ui", size: 16, lineHeight: 24, style: "normal" },
    4: { family: "system-ui", size: 16, lineHeight: 24, style: "normal" },
  };
  type Loose = Record<string, Partial<TFOut>> & { presets?: Record<string | number, Partial<TFOut>> };
  const pick = (src: Loose | undefined, keys: (string|number)[]) => {
    if (!src) return undefined;
    for (const k of keys) { const v = (src as any)[k]; if (v && typeof v === "object") return v; }
    if (src?.presets) for (const k of keys) { const v = (src.presets as any)[k]; if (v && typeof v === "object") return v; }
    return undefined;
  };
  const t = (typefaces as Loose) || {};
  const hl = pick(t, ["headline","H","h",1]); const bd = pick(t, ["body","B","b",2]);
  const ac = pick(t, ["accent","A","a",3]);    const et = pick(t, ["emphasis","etc","E","e",4]);
  const norm = (x: any, d: TFOut): TFOut => ({
    family: toStack(x?.family || x?.name) || d.family,
    size: (x?.size ?? d.size), lineHeight: (x?.lineHeight ?? d.lineHeight),
    weight: (x?.weight ?? d.weight), style: (x?.style ?? d.style ?? "normal"),
  });
  const map: Record<Preset, TFOut> = { 1: norm(hl, fb[1]), 2: norm(bd, fb[2]), 3: norm(ac, fb[3]), 4: norm(et, fb[4]) };
  return (n: Preset) => map[n] ?? map[2];
}

export function installPresetCSS(typefaces?: any, opts?: { scope?: string; styleId?: string }) {
  const tf = buildPresetTable(typefaces);
  const decl = (t: TFOut) => `
    font-family:${t.family} !important;
    font-size:${t.size}px !important;
    line-height:${t.lineHeight}px !important;
    ${t.weight != null ? `font-weight:${t.weight} !important;` : ""}
    ${t.style && t.style !== "normal" ? `font-style:${t.style} !important;` : ""}
  `.trim();

  const scope = (sel: string) => !opts?.scope ? sel
    : sel.split(",").map(s => `${opts.scope} ${s.trim()}`).join(", ");

  const css = `
${scope(PSEL)}{ margin:0; font:inherit; line-height:inherit; text-align:inherit; font-synthesis:none; text-rendering:optimizeLegibility; }
${scope(`[data-sw-paragraph].sw-preset-1`)}{ ${decl(tf(1))} }
${scope(`[data-sw-paragraph].sw-preset-2`)}{ ${decl(tf(2))} }
${scope(`[data-sw-paragraph].sw-preset-3`)}{ ${decl(tf(3))} }
${scope(`[data-sw-paragraph].sw-preset-4`)}{ ${decl(tf(4))} }
`.trim();

  const styleId = opts?.styleId || (opts?.scope ? `sw-preset-style:${opts.scope}` : "sw-preset-style");
  const legacy = document.getElementById("sw-preset-style");
  if (legacy && legacy.id !== styleId) legacy.remove();

  let tag = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!tag) { tag = document.createElement("style"); tag.id = styleId; document.head.appendChild(tag); }
  tag.textContent = css;
}

/* ---------------- 핫키 ---------------- */
export function installHotkeys(refs: EngineRefs, hooks?: Hooks) {
  const ed = refs.editor;
  if (!ed || (ed as any)._swHotkeys) return;

  const onKeyDown = (ev: KeyboardEvent) => {
    if ((ev as any).isComposing) return;
    const code = ev.code, ctrlOrMeta = ev.ctrlKey || ev.metaKey, alt = ev.altKey, shift = ev.shiftKey;

    // 프리셋: Ctrl/⌘ 또는 Alt + 1..4
    if ((ctrlOrMeta || alt) && !shift) {
      const map: Record<string, Preset> = { Digit1:1, Digit2:2, Digit3:3, Digit4:4 };
      const p = map[code as keyof typeof map]; if (p) { ev.preventDefault(); applyPreset(p, refs, undefined, hooks); return; }
    }

    // 관리형 Enter (Shift+Enter 제외)
    if (ev.key === "Enter" && !shift && !alt && !ctrlOrMeta) {
      ev.preventDefault(); ev.stopPropagation();
      const reserved = refs.nextPreset;
      splitParagraphAtCaret(refs, reserved);
      refs.nextPreset = undefined;
      hooks?.scheduleSave?.();
      return;
    }

    // Bold/Italic (시스템)
    if (ctrlOrMeta && !alt && !shift) {
      if (code === "KeyB") { ev.preventDefault(); toggleBold(refs, hooks); return; }
      if (code === "KeyI") { ev.preventDefault(); toggleItalic(refs, hooks); return; }
    }

    // Align 4종: Ctrl/⌘+Shift+L/E/R/J 또는 Alt+L/E/R/J
    const alignKey = (code === "KeyL" ? "left" : code === "KeyE" ? "center" :
                      code === "KeyR" ? "right" : code === "KeyJ" ? "justify" : null) as
                      "left"|"center"|"right"|"justify"|null;
    if (alignKey && ctrlOrMeta && shift && !alt) { ev.preventDefault(); setAlign(alignKey, refs, hooks); return; }
    if (alignKey && alt && !ctrlOrMeta && !shift) { ev.preventDefault(); setAlign(alignKey, refs, hooks); return; }
  };

  ed.addEventListener("keydown", onKeyDown, { capture: true });
  (ed as any)._swHotkeys = onKeyDown;
}
export function uninstallHotkeys(refs: EngineRefs) {
  const ed = refs.editor as any, h = ed?._swHotkeys as any; if (!h) return;
  ed.removeEventListener("keydown", h, true as any); ed._swHotkeys = null;
}

/* --------------- 타이핑 래치: 예약 프리셋을 타자 시작에 즉시 반영 --------------- */
export function installTypingLatch(refs: EngineRefs, hooks?: Hooks) {
  const ed = refs.editor as any;
  if (!ed || ed._swTypingLatch) return;
  const onInput = () => {
    const reserved = refs.nextPreset; if (!reserved) return;
    const p = getCaretParagraph(refs.editor); if (!p) return;
    applyPresetToParagraph(p, reserved);
    refs.nextPreset = undefined;
    hooks?.onPresetChange?.(reserved);
    hooks?.scheduleSave?.();
  };
  refs.editor.addEventListener("input", onInput, { capture: true });
  refs.editor.addEventListener("compositionend", onInput, { capture: true });
  ed._swTypingLatch = onInput;
}

/* ---------------- 초기 priming ---------------- */
export function primeParagraphMarkers(refs: EngineRefs) {
  const ed = refs.editor; if (!ed) return;
  // 완전 공백이면 초기 문단 1개 생성
  if (!ed.querySelector(PSEL)) {
    const p = document.createElement("p");
    p.setAttribute("data-sw-paragraph","1");
    p.classList.add("sw-preset-2");
    p.appendChild(document.createElement("br"));
    ed.appendChild(p);
  }
  ensureParagraphAttributes(ed);
}

/* ---------------- 통합 설치 ---------------- */
export function installEngine(refs: EngineRefs, hooks?: Hooks) {
  primeParagraphMarkers(refs);
  installSelectionKeeper(refs);
  installHotkeys(refs, hooks);
  installTypingLatch(refs, hooks);
}

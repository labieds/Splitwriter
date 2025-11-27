// { } 치환 설정 + 키다운 핸들러
export type CurlyPref =
  | boolean
  | [string, string]
  | { enabled?: boolean; left?: string; right?: string };

export type CurlySetting = { enabled: boolean; left: string; right: string };

export function normalizeCurly(p?: CurlyPref): CurlySetting {
  if (!p) return { enabled: false, left: "{", right: "}" };
  if (p === true) return { enabled: true, left: "「", right: "」" }; // 기본
  if (Array.isArray(p))
    return { enabled: true, left: p[0] ?? "{", right: p[1] ?? "}" };
  return {
    enabled: p.enabled !== false,
    left: p.left ?? "「",
    right: p.right ?? "」",
  };
}

/** { / } 입력을 치환해 주는 onKeyDown 분기. 처리했으면 true 반환 */
export function handleCurlyKeyDown(
  e: React.KeyboardEvent,
  setting: CurlySetting,
  ensureParagraphs: () => void,
  scheduleSave: () => void,
  afterInsert?: () => void
): boolean {
  if (!setting.enabled) return false;

  const raw = (e.key || "");
  const shiftTyping = !e.ctrlKey && !e.metaKey && !e.altKey; // 보통 Shift 조합
  if (!shiftTyping) return false;

  if (raw === "{" || raw === "}") {
    e.preventDefault();
    ensureParagraphs();
    const ch = raw === "{" ? setting.left : setting.right;
    try {
      document.execCommand("insertText", false, ch);
    } catch {}
    scheduleSave();
    afterInsert?.();
    return true;
  }
  return false;
}

// Splitwriter preset/runtime shim — 엔진 없이도 동작하는 전역 보조기
// 기능: (1) 여러 문단 일괄 프리셋, (2) Enter 후 B/I 묻어옴 차단, (3) 순수 텍스트 복사
// 의존: index.css의 [data-sw-paragraph] + .sw-preset-1..4

(() => {
  const PSEL = "p,div,h1,h2,h3,h4,h5,h6,[data-sw-paragraph]";

  const isBlock = (el: Element | null) =>
    !!el && el instanceof HTMLElement && /^(P|DIV|H[1-6])$/i.test(el.tagName);

  const closestBlock = (n: Node | null): HTMLElement | null => {
    if (!n) return null;
    let el: HTMLElement | null =
      (n.nodeType === 1 ? (n as HTMLElement) : (n.parentElement as HTMLElement)) || null;
    return el ? (el.closest(PSEL) as HTMLElement | null) : null;
  };

  const ensureParagraph = (el: HTMLElement | null): HTMLElement | null => {
    if (!el) return null;
    if (!isBlock(el)) el = (el.closest(PSEL) as HTMLElement) || null;
    if (!el) return null;
    if (!el.hasAttribute("data-sw-paragraph")) el.setAttribute("data-sw-paragraph", "1");
    if (![...el.classList].some((c) => /^sw-preset-\d$/.test(c))) el.classList.add("sw-preset-2");
    return el;
  };

  const setPreset = (el: HTMLElement, n: 1 | 2 | 3 | 4) => {
    el.classList.remove("sw-preset-1", "sw-preset-2", "sw-preset-3", "sw-preset-4");
    el.classList.add(`sw-preset-${n}`);
  };

  const getEditorFromSelection = (): HTMLElement | null => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    let n: Node | null = sel.getRangeAt(0).startContainer;
    while (n && n instanceof HTMLElement && !n.isContentEditable) n = n.parentElement;
    if (n && n instanceof HTMLElement && n.isContentEditable) return n;
    const ae = document.activeElement as HTMLElement | null;
    return ae && ae.isContentEditable ? ae : null;
  };

  const contentRangeOf = (el: HTMLElement) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    return r;
  };

  const rangesOverlap = (a: Range, b: Range) =>
    !(b.compareBoundaryPoints(Range.END_TO_START, a) <= 0 ||
      b.compareBoundaryPoints(Range.START_TO_END, a) >= 0);

  const paragraphsInRange = (ed: HTMLElement, r: Range): HTMLElement[] => {
    // 1) 에디터 안의 모든 문단 후보를 “배열”로 확보 (순서가 중요)
    const all = Array
      .from(ed.querySelectorAll<HTMLElement>(PSEL))
      .filter(isBlock)
      .map((e) => ensureParagraph(e))
      .filter(Boolean) as HTMLElement[];

    if (!all.length) return [];

    // 2) 선택의 시작/끝이 속한 문단을 잡고, 그 “인덱스 구간”을 잘라낸다.
    const startP = ensureParagraph(closestBlock(r.startContainer));
    const endP   = ensureParagraph(closestBlock(r.endContainer));
    if (!startP || !endP) return [];

    let si = all.indexOf(startP);
    let ei = all.indexOf(endP);
    if (si === -1 || ei === -1) {
      // 시작/끝이 querySelectorAll의 결과에 없는 희귀 케이스 → 전부
      return all;
    }
    if (si > ei) [si, ei] = [ei, si]; // 역선택 고려

    return all.slice(si, ei + 1);
  };

  // ---- (A) 프리셋 단축키: Ctrl/⌘ 또는 Alt + 1..4 → 선택된 모든 문단에 적용
  document.addEventListener(
    "keydown",
    (ev) => {
      const code = ev.code;
      const ctrlOrMeta = ev.ctrlKey || ev.metaKey;
      const alt = ev.altKey;
      const shift = ev.shiftKey;
      const map: Record<string, 1 | 2 | 3 | 4> = {
        Digit1: 1,
        Digit2: 2,
        Digit3: 3,
        Digit4: 4,
      };
      const preset = (ctrlOrMeta || alt) && !shift ? map[code] : undefined;
      if (!preset) return;

      const ed = getEditorFromSelection();
      if (!ed) return;

      ev.preventDefault();
      ev.stopPropagation();

      const sel = window.getSelection()!;
      if (!sel.rangeCount) return;
      const r = sel.getRangeAt(0);

      if (!r.collapsed) {
        // 여러 문단 일괄 적용
        const targets = paragraphsInRange(ed, r);
        targets.forEach((p) => setPreset(p, preset));
      } else {
        // 캐럿 1문단 적용
        const p = ensureParagraph(closestBlock(r.startContainer));
        if (p) setPreset(p, preset);
      }
    },
    { capture: true }
  );

  // ---- (B) Enter 이후 B/I 묻어오기 방지 + 새 문단 기본값 보장
  document.addEventListener(
    "keydown",
    (ev) => {
      if (ev.key !== "Enter" || ev.shiftKey || ev.altKey || ev.ctrlKey || ev.metaKey) return;
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      const wasCollapsed = sel.getRangeAt(0).collapsed;
      if (!wasCollapsed) return; // 다중선택 줄바꿈은 건드리지 않음

      // 기본 줄바꿈 후 다음 틱에서 처리
      requestAnimationFrame(() => {
        const ed = getEditorFromSelection();
        if (!ed) return;
        const sel2 = window.getSelection();
        if (!sel2 || !sel2.rangeCount) return;
        const p = ensureParagraph(closestBlock(sel2.getRangeAt(0).startContainer));
        if (p && ![...p.classList].some((c) => /^sw-preset-/.test(c))) p.classList.add("sw-preset-2");

        // 캐럿 위치에서 B/I 상태가 켜져 있으면 꺼서 새 타이핑에 안 묻도록
        try {
          if (document.queryCommandState?.("bold")) document.execCommand("bold");
          if (document.queryCommandState?.("italic")) document.execCommand("italic");
        } catch {}

        // ★ 보강: 새 줄의 조상에 남아있는 <b>/<i>/<strong>/<em> 래퍼를 한 번 벗겨낸다.
        const sel3 = window.getSelection();
        if (sel3 && sel3.rangeCount) {
            let node: Node | null = sel3.getRangeAt(0).startContainer;

            let cur: HTMLElement | null =
                (node && node.nodeType === Node.ELEMENT_NODE
                ? (node as HTMLElement)
                : (node && (node as any).parentElement as HTMLElement | null)) || null;

            const unwrap = (t: HTMLElement) => {
                const frag = document.createDocumentFragment();
                while (t.firstChild) frag.appendChild(t.firstChild);
                t.replaceWith(frag);
            };
            const isBI = (n: HTMLElement) => /^(B|I|STRONG|EM)$/i.test(n.tagName);

            while (cur && cur !== ed && !cur.matches(PSEL)) {
                if (isBI(cur)) { unwrap(cur); break; }
                cur = cur.parentElement;
            }
            }
      });
    },
    { capture: true }
  );

  // ---- (C) 순수 텍스트 복사
  document.addEventListener(
    "copy",
    (e: ClipboardEvent) => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return; // 기본 동작
      try {
        e.clipboardData?.setData("text/plain", sel.toString());
        e.preventDefault();
      } catch {}
    },
    { capture: true }
  );

  // ---- (D) 초기 마킹: 에디터에 들어가면 문단 마커/기본 프리셋 보장
  document.addEventListener(
    "focusin",
    () => {
      const ed = getEditorFromSelection();
      if (!ed) return;
      const nodes = Array.from(ed.querySelectorAll<HTMLElement>(PSEL)).filter(isBlock);
      nodes.forEach((n) => ensureParagraph(n));
    },
    { capture: true }
  );
})();

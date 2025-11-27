// 안정형 print: hidden <iframe srcdoc> + 단발성 print() 가드
export type PrintOptions = {
  page?: "A4" | "Letter";
  marginMm?: number | { top: number; right: number; bottom: number; left: number };
  baseFont?: { family: string; sizePx: number };
  presetScale?: Partial<Record<1 | 2 | 3 | 4, number>>;
  title?: string;           // 헤더/바닥글 켤 때 머릿글로 찍힐 제목
  usePaged?: boolean;       // 우하단 페이지 번호(1,2,3…) 위해 Paged.js 사용
  onlyPageNumber?: boolean; // x/전체 대신 1,2,3… 만
};

const esc = (s: any) =>
  String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const mm = (n: number) => `${n}mm`;

export function printHTML(getHTML: () => string, opts: PrintOptions = {}) {
  const {
    page = "A4",
    marginMm = 18,
    baseFont = { family: "system-ui", sizePx: 16 },
    presetScale,
    title = "Splitwriter",
    usePaged = true,
    onlyPageNumber = true,
  } = opts;

  const m = typeof marginMm === "number"
    ? { top: marginMm, right: marginMm, bottom: marginMm, left: marginMm }
    : marginMm;

  const inner = getHTML() || "";

  const css = `
@page { size: ${page}; margin: ${mm(m.top)} ${mm(m.right)} ${mm(m.bottom)} ${mm(m.left)}; }
html, body {
  margin:0; padding:0; background:#fff; color:#111;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
  font-family:${esc(baseFont.family)}; font-size:${baseFont.sizePx}px; line-height:1.6;
}
.sw-print-root { all: revert; }
.sw-print-root * { box-sizing: border-box; }
${presetScale ? `
  [data-preset="1"]{font-size:${Math.round(baseFont.sizePx*(presetScale[1]??1))}px;}
  [data-preset="2"]{font-size:${Math.round(baseFont.sizePx*(presetScale[2]??1))}px;}
  [data-preset="3"]{font-size:${Math.round(baseFont.sizePx*(presetScale[3]??1))}px;}
  [data-preset="4"]{font-size:${Math.round(baseFont.sizePx*(presetScale[4]??1))}px;}
` : ""}
${usePaged && onlyPageNumber ? `
  @page { @bottom-right { content: counter(page); font: 12px ${esc(baseFont.family)}; color:#666; } }
` : ""}
`;

  const paged = usePaged
    ? `<script src="https://unpkg.com/pagedjs/dist/paged.polyfill.js"></script>`
    : "";

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>${esc(title)}</title>
<style>${css}</style>
${paged}
</head>
<body>
  <article class="sw-print-root">${inner}</article>
  <script>
  (function () {
    function notify(type) {
      try { window.opener && window.opener.postMessage({ who: "splitwriter", type }, "*"); } catch {}
    }
    function requestPrint() {
      // 미리보기 열리기 직전 신호
      notify("SW_PRINT_OPENING");
      setTimeout(() => window.print(), 0);
    }

    if (window.Paged) {
      document.addEventListener("pagedjs:rendered", () => requestPrint(), { once: true });
    } else {
      requestPrint();
    }

    // 미리보기 닫히면 창 닫고 신호
    window.addEventListener("afterprint", () => {
      notify("SW_PRINT_CLOSED");
      setTimeout(() => window.close(), 0);
    });
  })();
  (function(){
    var printed = false;
    var fallbackTimer = null;

    function requestPrint(){
      if(printed) return;
      printed = true;
      try{ window.focus(); }catch(e){}
      // 0ms로 바로 호출(조판 완료 이벤트 쪽이 먼저면 이건 무시됨)
      setTimeout(function(){ try{ window.print(); }catch(e){} }, 0);
    }
    function cancelFallback(){
      if(fallbackTimer){ clearTimeout(fallbackTimer); fallbackTimer = null; }
    }
    function done(){
      cancelFallback();
      try{ parent.postMessage({ __sw_print_done__: true }, "*"); }catch(e){}
    }

    if (${usePaged}) {
      // 조판 완료 시 1회만 인쇄
      document.addEventListener("pagedjs:rendered", function(){
        cancelFallback();
        requestPrint();
      }, { once:true });
      // 조판 이벤트가 안 오는 극히 드문 경우 대비(지연 최소화)
      fallbackTimer = setTimeout(requestPrint, 1200);
    } else {
      if (document.readyState === "complete") requestPrint();
      else window.addEventListener("load", requestPrint, { once:true });
    }

    // 다이얼로그가 열리면(=beforeprint) 이후 폴백 제거
    window.addEventListener("beforeprint", cancelFallback, { once:true });
    // 닫히면(인쇄/취소 모두) 부모에 종료 알림 → 부모가 iframe 정리
    window.addEventListener("afterprint", done, { once:true });

    // 완전한 보험(매우 드문 케이스): 10초 지나도 닫히지 않으면 정리
    setTimeout(done, 10000);
  })();
  </script>
</body>
</html>`;

  // hidden iframe 생성
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.opacity = "0";
  frame.style.pointerEvents = "none";
  frame.setAttribute("aria-hidden", "true");

  // 부모에서 정리
  const cleanup = () => { try { frame.remove(); } catch(e){} };
  function onMsg(ev: any){
    if (ev && ev.data && ev.data.__sw_print_done__) {
      window.removeEventListener("message", onMsg);
      setTimeout(cleanup, 150); // 다이얼로그 닫힘 렌더링 마진
    }
  }
  window.addEventListener("message", onMsg);

  // srcdoc에 바로 주입 → 별도 onload 인쇄 트리거 금지(중복 방지)
  frame.srcdoc = html;
  document.body.appendChild(frame);
}

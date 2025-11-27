// src/windows/runtime/appActions.ts

/* ---------- Types ---------- */
type IO = {
  isDirty: () => boolean;
  save: () => Promise<void>;
  saveAs: () => Promise<void>;
  open: () => Promise<void>;
  newFile: () => void | Promise<void>;
  notify?: (msg: string, lvl?: "info" | "warn" | "error", ttl?: number) => void;
};

type Ask3 = (msg: string) => Promise<"save" | "discard" | "cancel">;

type Messages = {
  OPEN:   string;
  NEW:    string;
  QUIT:   string;
  RELOAD: string;
};

type Deps = {
  io: IO;
  ask: (msg: string) => Promise<boolean>;
  ask3?: Ask3;  
  hasBoundFileRef?: { current: boolean };
  messages?: Partial<Messages>;
};

type Store = {
  io: IO;
  ask: (msg: string) => Promise<boolean>;
  ask3?: Ask3;  
  hasBoundFileRef: { current: boolean };
  messages: Messages;
};



let D: Store | null = null;

/* filename helpers */
function _basename(p?: string | null): string {
  if (!p) return "";
  const m = String(p).match(/[^\\/]+$/);
  return m ? m[0] : String(p);
}
function currentFileLabel(): string {
  try {
    const p = (window as any).__SW_CURRENT_FILE__ as string | undefined;
    return p ? _basename(p) : "";
  } catch { return ""; }
}

/* ---------- helpers ---------- */
function need(): Store {
  if (!D) throw new Error("initAppActions() must be called first");
  return D;
}

async function getAppWindow() {
  try {
    if ((window as any).__TAURI_IPC__) {
      const { appWindow } = await import("@tauri-apps/api/window");
      return appWindow;
    }
  } catch {}
  return null;
}

/* ---------- init ---------- */
export function initAppActions(deps: Deps) {
  const base: Messages = {
    OPEN:   "Open a project? Unsaved changes will be lost.",
    NEW:    "Create a new project? Unsaved changes will be lost.",
    QUIT:   "There are unsaved changes.\nQuit without saving?",
    RELOAD: "Save before reload?",
  };
  const merged: Messages = { ...base, ...(deps.messages || {}) };
  const { messages: _omit, ...rest } = deps;

  D = {
    io: rest.io,
    ask: rest.ask,
    ask3: (rest as any).ask3, 
    hasBoundFileRef: rest.hasBoundFileRef ?? { current: false },
    messages: merged,
  };
}

// 파일 라벨을 다이얼로그/타이틀바가 읽을 수 있게 기록
export function noteCurrentFile(absPath?: string | null) {
  (window as any).__SW_CURRENT_FILE__ = absPath || "";
  try {
    // TitleBar도 같이 갱신(이미 이벤트를 듣고 있음)
    window.dispatchEvent(new CustomEvent("sw:file:opened", { detail: { path: absPath || "" } }));
  } catch {}
}

async function trySave(): Promise<boolean> {
  const { io } = need();
  try {
    await io.save();          // Save or Save As(경로 없을 때)
    // swon.ts가 저장 성공 시 clearDirty()를 호출함.
    return !io.isDirty();     // 취소/실패면 여전히 dirty → false
  } catch {
    return false;             // 예외도 실패로 간주
  }
}

/* ---------- actions ---------- */
export async function save() {
  const { io } = need();
  await io.save();
}

export async function saveAsAndBind() {
  const { io, hasBoundFileRef } = need();
  const before = io.isDirty();
  await io.saveAs();                          // 브라우저/파일 대화창
  const saved = before && !io.isDirty();      // 저장 성공만 바인딩
  if (saved) hasBoundFileRef.current = true;
}

export async function openWithGuard() {
  const { io, ask, messages, hasBoundFileRef } = need();
  if (io.isDirty() && !(await ask(messages.OPEN))) return;
  await io.open();
  if (typeof window !== "undefined" && "showOpenFilePicker" in window) {
    hasBoundFileRef.current = true;
  }
}

export async function newWithGuard() {
  const { io, ask, messages, hasBoundFileRef } = need();
  if (io.isDirty() && !(await ask(messages.NEW))) return;
  await io.newFile();
  hasBoundFileRef.current = false;
}

export async function reloadWithGuard() {
  const { io, ask, messages } = need();
  if (io.isDirty()) {
    const okAsk = await ask(messages.RELOAD);
    if (!okAsk) return;
    const okSave = await trySave();   // ← 취소 시 리로드 중단
    if (!okSave) return;
  }
  location.reload();
}

export async function quitWithGuard() {
  const { io, ask, ask3, messages } = need();
  const dirty = io.isDirty();
  const aw = await getAppWindow();

  const fname = currentFileLabel();
  const ASK_SAVE = fname ? `Save '${fname}' before exit?` : `Save before exit?`;
  const ASK_DISCARD = fname ? `Quit without saving '${fname}'?` : messages.QUIT;

  if (aw) {
    if (!dirty) { await aw.close(); return; }

    if (ask3) {
      const choice = await ask3(ASK_SAVE);
      if (choice === "cancel") return;
      if (choice === "save") {
        const ok = await trySave();   // ← 저장창 취소하면 false
        if (!ok) return;              // 종료하지 않고 복귀
        await aw.close();
        return;
      }
      await aw.close();               // discard
      return;
    }

    const wantSave = await ask(ASK_SAVE);
    if (wantSave) {
      const ok = await io.save().then(() => true).catch(() => false);
      if (!ok) return;
      await aw.close();
      return;
    }
    const really = await ask(ASK_DISCARD);
    if (really) await aw.close();
    return;
  }

  if (dirty) {
    if (ask3) {
      const choice = await ask3(ASK_SAVE);
      if (choice === "cancel") return;
      if (choice === "save") {
        const ok = await trySave();
        if (!ok) return;
        window.close(); return;
      }
      window.close(); return;
    }
    const wantSave = await ask(ASK_SAVE);
    if (wantSave) {
      const ok = await trySave();
      if (!ok) return;
      window.close(); return;
    }
    const really = await ask(ASK_DISCARD);
    if (!really) return;
  }
  window.close();
}

// src/windows/runtime/appActions.ts
type IO = {
  isDirty: () => boolean;
  save: () => Promise<void>;
  saveAs: () => Promise<void>;
  open: () => Promise<void>;
  newFile: () => void | Promise<void>;
  notify?: (msg: string, lvl?: "info"|"warn"|"error", ttl?: number) => void;
};

type Deps = {
  io: IO;
  ask: (msg: string) => Promise<boolean>;
  hasBoundFileRef?: { current: boolean };
  messages?: Partial<{ OPEN: string; NEW: string; QUIT: string; RELOAD: string }>;
};

let D: Required<Deps> | null = null;

export function initAppActions(deps: Deps) {
  D = {
    hasBoundFileRef: { current: false },
    messages: {
      OPEN:   "Open a project? Unsaved changes will be lost.",
      NEW:    "Create a new project? Unsaved changes will be lost.",
      QUIT:   "There are unsaved changes.\nQuit without saving?",
      RELOAD: "Save before reload?",
      ...(deps.messages || {}),
    },
    ...deps,
  } as Required<Deps>;
}

/* helpers */
async function getAppWindow() {
  try {
    if ((window as any).__TAURI_IPC__) {
      const { appWindow } = await import("@tauri-apps/api/window");
      return appWindow;
    }
  } catch {}
  return null;
}
function need() {
  if (!D) throw new Error("initAppActions() must be called first");
  return D;
}

/* actions */
export async function save() {
  const { io } = need();
  await io.save();
}

export async function saveAsAndBind() {
  const { io, hasBoundFileRef } = need();
  await io.saveAs();
  if (typeof window !== "undefined" && "showSaveFilePicker" in window) {
    hasBoundFileRef.current = true;
  }
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
    const ok = await ask(messages.RELOAD);
    if (!ok) return;
    try { await io.save(); } catch { return; }
  }
  location.reload();
}

export async function quitWithGuard() {
  const { io, ask, messages } = need();
  const dirty = io.isDirty();
  const aw = await getAppWindow();

  if (aw) {
    if (!dirty) { await aw.close(); return; }
    const saveFirst = await ask("Save before exit?");
    if (!saveFirst) {
      const discard = await ask(messages.QUIT);
      if (discard) await aw.close();
      return;
    }
    try { await io.save(); } catch { return; }
    await aw.close();
    return;
  }

  if (dirty) {
    const ok = await ask(messages.QUIT);
    if (!ok) return;
  }
  window.close();
}

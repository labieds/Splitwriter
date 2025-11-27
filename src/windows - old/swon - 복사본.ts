// src/windows/swon.ts
import type { ImageView } from "./boards/ImageBoard"; // type-only import

export type SwonView = ImageView;
export type SwonImage = { src: string | null; view?: SwonView; file?: string | null };

export type NotifyLevel = "info" | "warn" | "error";
export type NotifyFn = (text: string, level?: NotifyLevel, ttlMs?: number) => void;

export type SwonTree =
  | { type: "leaf"; id: string; kind: "text" | "image" | "viewer" | "edit"; textId: string; imageId: string }
  | { type: "split"; dir: "vertical" | "horizontal"; ratio: number; a: SwonTree; b: SwonTree };

export type SwonFile = {
  kind: "splitwriter";
  version: 1;
  tree: SwonTree;
  openText: Record<string, string>;
  archivedText: Record<string, string>;
  images: Record<string, SwonImage>;
  prefs?: any;
  echoBg?: string | null;
  savedAt?: string; // ISO
  title?: string;   // filename hint (without .swon)
};

type Opts = {
  getTree: () => SwonTree;
  setTree: (t: SwonTree) => void;

  getOpenText: () => Record<string, string>;
  setOpenText: (m: Record<string, string>) => void;

  getArchivedText: () => Record<string, string>;
  setArchivedText: (m: Record<string, string>) => void;

  getImages: () => Record<string, SwonImage>;
  setImages: (m: Record<string, SwonImage>) => void;

  getPrefs: () => any;
  setPrefs: (p: any) => void;

  getEchoBg: () => string | null;

  makeFreshTree?: () => SwonTree;
  bumpSession?: () => void;

  notify: NotifyFn;
};

export type SwonIO = {
  markDirty(): void;
  clearDirty(): void;
  isDirty(): boolean;
  canQuickSave(): boolean;
  save(): Promise<void>;
  saveAs(): Promise<void>;
  open(): Promise<void>;
  openAt(absPath: string): Promise<void>;  // ★ 사이드바 더블클릭용
  newFile(): void;
  getTitle(): string;
  notify: NotifyFn;
};

export function setupSwonIO(opts: Opts): SwonIO {
  let dirty = false;
  let fileHandle: any | null = null;   // File System Access API (웹)
  let diskPath: string | null = null;  // Tauri에서 선택된 실제 경로
  let fileName: string | null = null;

  const markDirty = () => { dirty = true; bumpTitle(true); };
  const clearDirty = () => { dirty = false; bumpTitle(false); };
  const isDirty = () => dirty;

  // 창 타이틀 업데이트(없어도 되지만 미정의 에러 방지용)
  const bumpTitle = (d = dirty) => {
    try {
      const base = fileName || "untitled";
      document.title = `${base}${d ? " *" : ""} — Splitwriter`;
    } catch {}
  };

  const canQuickSave = () =>
    !!(fileHandle && typeof (fileHandle as any).createWritable === "function")
    || (!!diskPath && !!(window as any).__TAURI_IPC__); // ★ tauriPath → diskPath

  // ────────────────────────────────────────────────────────────── utils
  const isPathLike = (s?: string | null) =>
    !!s && (/^[A-Za-z]:[\\/]/.test(s) || s.startsWith("/") || s.startsWith("\\\\"));

  const isEphemeralUrl = (s?: string | null) =>
    !!s && /^(asset:|tauri:|app:)/i.test(s);

  const isBlobOrData = (s?: string | null) =>
    !!s && /^(blob:|data:)/i.test(s);

  function defaultTree(): SwonTree {
    return {
      type: "split",
      dir: "vertical",
      ratio: 0.5,
      a: { type: "leaf", id: "1", kind: "text",  textId: "T2", imageId: "I3" },
      b: { type: "leaf", id: "4", kind: "image", textId: "T5", imageId: "I6" },
    };
  }
  function freshTree(): SwonTree {
    try {
      return opts.makeFreshTree ? opts.makeFreshTree() : defaultTree();
    } catch {
      return defaultTree();
    }
  }

  function buildSwon(): SwonFile {
    const imgsIn = opts.getImages() || {};
    const images: Record<string, SwonImage> = {};
    for (const [id, im] of Object.entries(imgsIn)) {
      const srcNow = (im as any)?.src ?? null;
      const fileAbs = (im as any)?.file ?? null;
      let srcToSave: string | null;
      if (isBlobOrData(srcNow)) {
        srcToSave = fileAbs ?? null;
      } else if (isEphemeralUrl(srcNow)) {
        srcToSave = fileAbs ?? srcNow;
      } else if (isPathLike(srcNow)) {
        srcToSave = srcNow; 
      } else {
        srcToSave = srcNow ?? fileAbs ?? null;
      }

      const fileToSave = fileAbs ?? (isPathLike(srcNow) ? srcNow : null);

      images[id] = { src: srcToSave, view: im?.view, file: fileToSave };
    }
    return {
      kind: "splitwriter",
      version: 1,
      tree: opts.getTree(),
      openText: opts.getOpenText() || {},
      archivedText: opts.getArchivedText() || {},
      images,
      prefs: opts.getPrefs() || {},
      echoBg: opts.getEchoBg?.() ?? null,
      savedAt: new Date().toISOString(),
      title: fileName || undefined,
    };
  }

  function serialize(): string {
    return JSON.stringify(buildSwon());
  }

  function applySwon(data: SwonFile, bump = false) {
    // 정규화 그대로 유지
    const normalized: Record<string, SwonImage> = {};
    for (const [id, im] of Object.entries(data.images || {})) {
      let raw = (im?.src ?? im?.file ?? null) as string | null;
      if (isEphemeralUrl(raw) && im?.file) raw = im.file;
      const fileFixed = im?.file ?? (isPathLike(raw) ? raw : null);
      normalized[id] = { src: raw, view: im?.view, file: fileFixed };
    }

    if (data.tree) opts.setTree(data.tree);
    opts.setOpenText(data.openText || {});
    opts.setArchivedText(data.archivedText || {});
    if (data.prefs) opts.setPrefs(data.prefs);
    opts.setImages(normalized);

    clearDirty();
    if (bump) opts.bumpSession?.();
  }

  // ────────────────────────────────────────────────────────────── save
  async function saveAs() {
    const text = serialize();

    // 1) Tauri
    if ((window as any).__TAURI_IPC__) {
      const { writeTextFile } = await import("@tauri-apps/api/fs");
      const { save } = await import("@tauri-apps/api/dialog");
      const picked = await save({
        defaultPath: `${fileName || "untitled"}.swon`,
        filters: [{ name: "Splitwriter Project", extensions: ["swon"] }],
      });
      if (typeof picked !== "string") return; // 취소
      await writeTextFile(picked, text);
      diskPath = picked;         // 이후 Ctrl+S 가능
      fileHandle = null;
      clearDirty();
      try { fileName = picked.split(/[\\/]/).pop()?.replace(/\.swon$/i, "") || fileName; } catch {}
      opts.notify(`Saved: ${fileName}.swon`, "info", 1400);
      return;
    }

    // 2) 웹
    const showSave = (window as any).showSaveFilePicker;
    if (showSave) {
      const handle = await showSave({
        types: [{ description: "Splitwriter Project", accept: { "application/json": [".swon"] } }],
        suggestedName: `${fileName || "untitled"}.swon`,
      });
      const w = await (handle as any).createWritable();
      await w.write(text);
      await w.close();
      fileHandle = handle;
      fileName = (handle as any).name?.replace(/\.swon$/i, "") || fileName || "untitled";
      clearDirty();
      opts.notify(`Saved: ${fileName}.swon`, "info", 1400);
      return;
    }

    // 3) 다운로드 폴백
    const blob = new Blob([text], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${fileName || "untitled"}.swon`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    clearDirty();
    opts.notify(`Saved${fileName ? `: ${fileName}.swon` : ""}`, "info", 1400);
  }

  async function save() {
    const text = serialize();

    // 1) Tauri
    if ((window as any).__TAURI_IPC__) {
      const { writeTextFile } = await import("@tauri-apps/api/fs");
      const { save } = await import("@tauri-apps/api/dialog");
      if (!diskPath) {
        const picked = await save({
          defaultPath: `${fileName || "untitled"}.swon`,
          filters: [{ name: "Splitwriter Project", extensions: ["swon"] }],
        });
        if (typeof picked !== "string") return; // 취소
        diskPath = picked;
      }
      await writeTextFile(diskPath, text);
      clearDirty();
      opts.notify(`Saved${fileName ? `: ${fileName}.swon` : ""}`, "info", 1400);
      return;
    }

    // 2) 웹
    if (fileHandle && (fileHandle as any).createWritable) {
      const w = await (fileHandle as any).createWritable();
      await w.write(text);
      await w.close();
      clearDirty();
      opts.notify(`Saved${fileName ? `: ${fileName}.swon` : ""}`, "info", 1400);
      return;
    }

    // 3) 폴백 다운로드
    const blob = new Blob([text], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${fileName || "untitled"}.swon`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    clearDirty();
    opts.notify(`Saved${fileName ? `: ${fileName}.swon` : ""}`, "info", 1400);
  }


  // ────────────────────────────────────────────────────────────── open
  async function open() {
    // 1) Tauri
    if ((window as any).__TAURI_IPC__) {
      const { open } = await import("@tauri-apps/api/dialog");
      const { readTextFile } = await import("@tauri-apps/api/fs");
      const picked = await open({
        multiple: false,
        filters: [{ name: "Splitwriter Project", extensions: ["swon", "json"] }],
      });
      if (typeof picked !== "string") return; // 취소
      const text = await readTextFile(picked);
      const data = JSON.parse(text) as SwonFile;
      if (data.kind !== "splitwriter") throw new Error("Not a SWON file");
      applySwon(data, /* bump */ true);
      diskPath = picked;
      fileHandle = null;
      try { fileName = picked.split(/[\\/]/).pop()?.replace(/\.swon$/i, "") || data.title || "untitled"; } catch {}
      opts.notify(`${fileName}.swon loaded`, "info", 1600);
      return;
    }

    // 2) 웹
    const showOpen = (window as any).showOpenFilePicker;
    try {
      if (showOpen) {
        const [handle] = await showOpen({
          multiple: false,
          types: [{ description: "Splitwriter Project", accept: { "application/json": [".swon", ".json"] } }],
        });
        const file = await handle.getFile();
        const text = await file.text();
        const data = JSON.parse(text) as SwonFile;
        if (data.kind !== "splitwriter") throw new Error("Not a SWON file");
        applySwon(data, /* bump */ true);
        fileHandle = handle;
        fileName = (handle as any).name?.replace(/\.swon$/i, "") || data.title || "untitled";
        opts.notify(`${fileName}.swon loaded`, "info", 1600);
        return;
      }
    } catch (e) {
      console.error(e);
    }

    // 3) 인풋 폴백
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "application/json,.swon,.json";
    inp.onchange = async () => {
      const f = inp.files?.[0];
      if (!f) return;
      const text = await f.text();
      const data = JSON.parse(text) as SwonFile;
      if (data.kind !== "splitwriter") throw new Error("Not a SWON file");
      applySwon(data, /* bump */ true);
      fileHandle = null;
      diskPath = null;
      fileName = f.name?.replace(/\.swon$/i, "") || data.title || "untitled";
      opts.notify(`${fileName}.swon loaded`, "info", 1600);
    };
    inp.click();
  }

  async function openAt(absPath: string) {
    if (!(window as any).__TAURI_IPC__) {
      // 웹 환경에서는 일반 open() 사용
      return open();
    }
    const { readTextFile } = await import("@tauri-apps/api/fs");
    const text = await readTextFile(absPath);
    const data = JSON.parse(text) as SwonFile;
    if (data.kind !== "splitwriter") throw new Error("Not a SWON file");
    applySwon(data, /* bump */ true);
    diskPath = absPath;
    fileHandle = null;
    try { fileName = absPath.split(/[\\/]/).pop()?.replace(/\.swon$/i, "") || data.title || "untitled"; } catch {}
    opts.notify(`${fileName}.swon loaded`, "info", 1600);
  }

  // ────────────────────────────────────────────────────────────── new
  function newFile() {
    const empty: SwonFile = {
      kind: "splitwriter", version: 1,
      tree: freshTree(), openText: {}, archivedText: {}, images: {},
      prefs: opts.getPrefs() || {}, echoBg: null,
    };
    applySwon(empty, /* bump */ true);
    fileHandle = null;
    diskPath  = null;    // ★ tauriPath 대신 초기화
    fileName  = "untitled";
    clearDirty();
    opts.notify(`New file`, "info", 1200);
  }

  const getTitle = () => fileName || "untitled";

  return {
    markDirty, clearDirty, isDirty,
    save, saveAs, open, openAt, newFile, getTitle,
    notify: opts.notify, canQuickSave,
  };
}

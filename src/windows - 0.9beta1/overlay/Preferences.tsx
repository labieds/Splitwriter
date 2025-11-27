import React, { useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { readDir, writeTextFile, readTextFile, createDir } from "@tauri-apps/api/fs";
import { homeDir, join } from "@tauri-apps/api/path";
import { platform } from "@tauri-apps/api/os";
import { open as openDialog } from "@tauri-apps/api/dialog";
import { listPresets, loadPreset, savePreset, applyDefault, revealPresetFolder } from "../../shared/presets";
import { DEFAULT_PREFS, type Preferences, type FontTriplet, SYSTEM_STACK, SYSTEM_LABEL } from "../../shared/defaultPrefs";
import { emit } from "@tauri-apps/api/event";
import { applyAccentTokens } from "../runtime/accent";

export const PREFS_STORAGE_KEY = "splitwriter:preferences:v4";
const FALLBACK_ACCENT = "#2AA4FF";

/** Deprecated: external text-engine CSS injection.
 *  Splitwriter v4 applies typefaces inside TextBoard.
 *  Keeping this stub to avoid regressions.
 */
function installPresetCSS(_tf: Preferences["typeface"]) {
  // no-op
}

export function usePreferences() {
  const [prefs, setPrefs] = React.useState<Preferences>(() => {
    try {
      const raw = localStorage.getItem(PREFS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Preferences>;
        if (!parsed.typeface?.etc) {
          parsed.typeface = { ...DEFAULT_PREFS.typeface, ...parsed.typeface, etc: DEFAULT_PREFS.typeface.etc };
        }

        const merged: Preferences = {
          ...DEFAULT_PREFS,
          workingFolder: parsed.workingFolder ?? DEFAULT_PREFS.workingFolder,
          autosave: parsed.autosave ?? DEFAULT_PREFS.autosave,
          autosaveIntervalSec: parsed.autosaveIntervalSec ?? DEFAULT_PREFS.autosaveIntervalSec,
          typeface: {
            headline: parsed.typeface?.headline ?? DEFAULT_PREFS.typeface.headline,
            body:     parsed.typeface?.body     ?? DEFAULT_PREFS.typeface.body,
            accent:   parsed.typeface?.accent   ?? DEFAULT_PREFS.typeface.accent,
            etc:      parsed.typeface?.etc      ?? DEFAULT_PREFS.typeface.etc,
          },
          accentColor: parsed.accentColor ?? DEFAULT_PREFS.accentColor,
          writingGoal: parsed.writingGoal ?? DEFAULT_PREFS.writingGoal,
          bracket:     parsed.bracket     ?? DEFAULT_PREFS.bracket,
        };
        merged.typeface = normalizeTypeface(merged.typeface);
        return merged;
      }

      const v2 = localStorage.getItem("splitwriter:preferences:v2");
      if (v2) {
        const p = JSON.parse(v2) as any;
        const tf = p.typeface || p.fonts || {};
        const fromV2: Preferences = {
          ...DEFAULT_PREFS,
          ...p,
          theme: p.theme ?? "dark",
          typeface: {
            headline: tf.headline ?? DEFAULT_PREFS.typeface.headline,
            body: tf.body ?? DEFAULT_PREFS.typeface.body,
            accent: tf.accent ?? DEFAULT_PREFS.typeface.accent,
            etc: tf.etc ?? tf.etc2 ?? DEFAULT_PREFS.typeface.etc,
          },
          bracket: p.bracket ? stripLegacyBrackets(p.bracket) : DEFAULT_PREFS.bracket,
          writingGoal: p.writingGoal ?? DEFAULT_PREFS.writingGoal,
        };
        fromV2.typeface = normalizeTypeface(fromV2.typeface);
        return fromV2;
      }
      return DEFAULT_PREFS;
    } catch {
      return DEFAULT_PREFS;
    }
  });

  useEffect(() => {
    try { installPresetCSS(prefs.typeface); } catch (e) { console.warn(e); }
  }, [prefs.typeface]);

  useEffect(() => {
    const toStore = {
      workingFolder: prefs.workingFolder,
      autosave: prefs.autosave,
      autosaveIntervalSec: prefs.autosaveIntervalSec,
      typeface: prefs.typeface,
      accentColor: prefs.accentColor,
      writingGoal: prefs.writingGoal,
      bracket: prefs.bracket,
    };
    try { localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(toStore)); } catch {}
    try { emit("prefs-changed", {}); } catch {}

    (async () => { await writeShadowPrefs(toStore); })();
  }, [prefs]);

  useEffect(() => {
    applyAccentTokens(validateHex(prefs.accentColor) || FALLBACK_ACCENT);
  }, [prefs.accentColor]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", prefs.theme);
  }, [prefs.theme]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const fromFile = await readShadowPrefs();

      if (cancelled) return;

      if (fromFile) {
        setPrefs(prev => {
          const p = fromFile as Partial<Preferences>;
          const merged: Preferences = {
            ...DEFAULT_PREFS,
            workingFolder: p.workingFolder ?? prev.workingFolder,
            autosave: p.autosave ?? prev.autosave,
            autosaveIntervalSec: p.autosaveIntervalSec ?? prev.autosaveIntervalSec,
            theme: p.theme ?? prev.theme,
            typeface: normalizeTypeface({
              headline: p.typeface?.headline ?? prev.typeface.headline,
              body:     p.typeface?.body     ?? prev.typeface.body,
              accent:   p.typeface?.accent   ?? prev.typeface.accent,
              etc:      p.typeface?.etc      ?? prev.typeface.etc,
            }),
            accentColor: p.accentColor ?? prev.accentColor,
            writingGoal: p.writingGoal ?? prev.writingGoal,
            bracket:     p.bracket     ?? prev.bracket,
          };
          return merged;
        });
      } else {
        setPrefs(prev => {
          // Factory reset: keep previous accentColor, reset other fields to DEFAULT_PREFS
          const next: Preferences = {
            ...DEFAULT_PREFS,
            accentColor: prev.accentColor, 
          };
          next.typeface = normalizeTypeface(next.typeface);
          return next;
        });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return [prefs, setPrefs] as const;
}

const IcFolder = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" aria-hidden width={16} height={16} {...p}>
    <path
      fill="currentColor"
      d="M3 6.75A1.75 1.75 0 0 1 4.75 5h4.19c.46 0 .9.18 1.22.5l.56.56c.33.33.77.51 1.23.51h5.55A1.75 1.75 0 0 1 19.25 9v8.25A1.75 1.75 0 0 1 17.5 19h-13A1.75 1.75 0 0 1 2.75 17.25v-9.5Z"
    />
  </svg>
);
const IcClock = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" aria-hidden width={16} height={16} {...p}>
    <path
      fill="currentColor"
      d="M12 2.75a9.25 9.25 0 1 0 0 18.5 9.25 9.25 0 0 0 0-18.5Zm.75 4.75a.75.75 0 1 0-1.5 0v5.06c0 .3.17.57.45.69l3.72 1.66a.75.75 0 0 0 .63-1.36l-3.3-1.47V7.5Z"
    />
  </svg>
);
const IcA = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" aria-hidden width={16} height={16} {...p}>
    <path fill="currentColor" d="M12.92 6.2 16.5 17h-2l-.84-2.6H8.37L7.5 17h-2l3.62-10.8h3.8Zm-3.9 6.3h3.06L10.5 8.4 9.02 12.5Z" />
  </svg>
);

const CURLY_ICON = "/assets/icons/curly.png";

async function shadowPrefDir() {
  const base = await homeDir();
  return await join(base, "Splitwriter"); 
}
async function shadowPrefPath() {
  const dir = await shadowPrefDir();
  return await join(dir, "prefs.json");
}

async function writeShadowPrefs(obj: any) {
  if (!isTauri()) return;
  try {
    const dir = await shadowPrefDir();
    await createDir(dir, { recursive: true });
    const file = await shadowPrefPath();
    await writeTextFile(file, JSON.stringify(obj, null, 2));
  } catch (e) {
    console.warn("[prefs] writeShadowPrefs failed:", e);
  }
}

async function readShadowPrefs(): Promise<any | null> {
  if (!isTauri()) return null;
  try {
    const file = await shadowPrefPath();
    const txt = await readTextFile(file);
    return JSON.parse(txt);
  } catch {
    return null; 
  }
}

export async function bootstrapPrefsOnAppStart() {
  try {
    let fromShadow: any = await readShadowPrefs();
    if (!fromShadow) {
      const raw = localStorage.getItem(PREFS_STORAGE_KEY);
      if (raw) fromShadow = JSON.parse(raw);
    }

    const merged: Preferences = {
      ...DEFAULT_PREFS,
      workingFolder: fromShadow?.workingFolder ?? DEFAULT_PREFS.workingFolder,
      autosave: fromShadow?.autosave ?? DEFAULT_PREFS.autosave,
      autosaveIntervalSec: fromShadow?.autosaveIntervalSec ?? DEFAULT_PREFS.autosaveIntervalSec,
      typeface: {
        headline: fromShadow?.typeface?.headline ?? DEFAULT_PREFS.typeface.headline,
        body:     fromShadow?.typeface?.body     ?? DEFAULT_PREFS.typeface.body,
        accent:   fromShadow?.typeface?.accent   ?? DEFAULT_PREFS.typeface.accent,
        etc:      fromShadow?.typeface?.etc      ?? DEFAULT_PREFS.typeface.etc,
      },
      accentColor: fromShadow?.accentColor ?? DEFAULT_PREFS.accentColor,
      writingGoal: fromShadow?.writingGoal ?? DEFAULT_PREFS.writingGoal,
      bracket:     fromShadow?.bracket     ?? DEFAULT_PREFS.bracket,
      // Merge other optional fields (e.g., theme/language) here when needed
      theme: fromShadow?.theme ?? DEFAULT_PREFS.theme,
      language: fromShadow?.language ?? (DEFAULT_PREFS as any).language,
    };
    merged.typeface = normalizeTypeface(merged.typeface);

    // NEW: persist the bootstrap result so usePreferences() can pick it up immediately
    try {
      const toStore = {
        workingFolder: merged.workingFolder,
        autosave: merged.autosave,
        autosaveIntervalSec: merged.autosaveIntervalSec,
        typeface: merged.typeface,
        accentColor: merged.accentColor,
        writingGoal: merged.writingGoal,
        bracket: merged.bracket,
      };
      localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(toStore));
    } catch {}

    try { installPresetCSS(merged.typeface); } catch {}

    const acc = validateHex(merged.accentColor) || FALLBACK_ACCENT;
    applyAccentTokens(acc);
    document.documentElement.setAttribute("data-theme", merged.theme);

    try { await emit("prefs-changed", {}); } catch {}
  } catch (e) {
    console.warn("[prefs bootstrap] failed:", e);
  }
}

const STRINGS = {
  en: {
    title: "Preferences",
    close: "Close",
    theme: "Theme",
    dark: "Dark",
    light: "Light",
    workingFolder: "Working Folder",
    workingFolderHint: "Default save location for Splitwriter",
    browse: "Browse…",
    autosave: "Autosave",
    autosaveDesc: "Periodically saves while you type.",
    autosaveInterval: "Autosave Interval (sec)",
    autosaveRange: "Recommended 10–600",
    fonts: "Typeface Presets (v4)",
    fontsHint: "Ctrl/Cmd + 1·2·3·4 to switch (Headline / Body / Accent / Etc)",
    headline: "Headline",
    body: "Body",
    accent: "Accent",
    etc: "Etc",
    preview: "Preview",
    accentColor: "Accent Color",
    accentDesc: "Used for highlights and focus. Stored as HEX.",
    bracket: "Curly Braces Replacement",
    bracketDesc: "Replace { and } while typing.",
    enable: "Enable",
    none: "None",
    doubleCorner: "『 』 (double corner)",
    doubleAngle: "≪ ≫ (double angle)",
    singleCorner: "｢ ｣ (single corner)",
    singleAngle: "< > (single angle)",
    goalTitle: "Writing Goal (HUD)",
    goalDesc: "Show a small counter on screen while writing.",
    goalEnable: "Enable",
    goalUnit: "Unit",
    unitChars: "Characters",
    unitWords: "Words",
    goalTarget: "Target",
    goalPreview: "Preview",
  },
} as const;

type LangKey = keyof typeof STRINGS;

function normalizeTypeface(tf: Preferences["typeface"]) {
  const norm = (f: FontTriplet): FontTriplet =>
    f.name === SYSTEM_LABEL ? { ...f, name: SYSTEM_STACK } : f;
  return {
    headline: norm(tf.headline),
    body: norm(tf.body),
    accent: norm(tf.accent),
    etc: norm(tf.etc),
  };
}

const BRACKET_MAP: Record<Preferences["bracket"]["style"], [string, string]> = {
  none: ["{", "}"],
  doubleCorner: ["『", "』"],
  doubleAngle: ["≪", "≫"],
  singleCorner: ["｢", "｣"],
  singleAngle: ["<", ">"],
};
const NONE_STYLE = "(none)";

type FontDict = Record<string, Set<string>>;
function buildFallbackFonts(): FontDict {
  const map: FontDict = {};
  const add = (fam: string, styles: string[]) => {
    if (!map[fam]) map[fam] = new Set();
    styles.forEach((s) => map[fam].add(s));
  };
  add("Inter", ["Thin", "Light", "Regular", "Medium", "Semibold", "Bold", "Black"]);
  add("Noto Sans KR", ["Regular", "Medium", "Bold", "Black"]);
  add("Segoe UI", ["Regular", "Semibold", "Bold"]);
  add("Malgun Gothic", ["Regular", "Bold"]);
  add("Arial", ["Regular", "Bold", "Italic", "Bold Italic"]);
  add("Times New Roman", ["Regular", "Bold", "Italic", "Bold Italic"]);
  add("Roboto", ["Thin", "Light", "Regular", "Medium", "Bold", "Black"]);
  add("Pretendard", ["Regular", "Medium", "Semibold", "Bold"]);
  return map;
}
function stripLegacyBrackets(b: any): Preferences["bracket"] {
  const style: Preferences["bracket"]["style"] =
    ["none", "doubleCorner", "doubleAngle", "singleCorner", "singleAngle"].includes(b?.style)
      ? b.style
      : "none";
  return { enable: !!b?.enable, style };
}
function validateHex(s: string): string | null {
  const x = s?.trim();
  if (!x) return null;
  const m = x.match(/^#([0-9A-Fa-f]{6})$/);
  return m ? `#${m[1].toUpperCase()}` : null;
}
function hexA(hex: string, alpha: number) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}
function clampN(v: any, min: number, max: number, fallback: number) {
  const n = Number(v);
  if (Number.isFinite(n)) return Math.max(min, Math.min(max, n));
  return fallback;
}
function inferStyleFromName(fam: string): string | null {
  const n = fam.toLowerCase().replace(/\s+/g, "");

  // NEW: prefer combined styles when both "bold" and "italic/oblique" appear
  if (n.includes("bold") && (n.includes("italic") || n.includes("oblique"))) {
    return "Bold Italic";
  }

  const table: Array<[RegExp, string]> = [
    [/(?:^|[-_])(thin|hairline)/, "Thin"],
    [/(?:^|[-_])(extralight|ultralight)/, "ExtraLight"],
    [/(?:^|[-_])(light)/, "Light"],
    [/(?:^|[-_])(regular|book|normal)/, "Regular"],
    [/(?:^|[-_])(medium)/, "Medium"],
    [/(?:^|[-_])(semibold|demibold)/, "SemiBold"],
    [/(?:^|[-_])(bold)/, "Bold"],
    [/(?:^|[-_])(extrabold|ultrabold)/, "ExtraBold"],
    [/(?:^|[-_])(black|heavy)/, "Black"],
  ];
  for (const [re, label] of table) if (re.test(n)) return label;
  if (/(?:^|[-_])(italic|oblique)/.test(n)) return "Italic";
  return null;
}
function isTauri() {
  try {
    const w = window as any;
    return !!(w.__TAURI__ || w.__TAURI_INTERNALS__ || w.__TAURI_IPC__);
  } catch { return false; }
}

/** Override a subset of preferences from a SWON file.
 *  Overrides: autosave (+interval), typeface (4 slots), accentColor.
 *  Usage: setPrefs(p => overridePrefsFromSwon(p, swonPrefs));
 */
export function overridePrefsFromSwon(curr: Preferences, from: Partial<Preferences>): Preferences {
  const next: Preferences = { ...curr };
  if (typeof (from as any)?.autosave === "boolean") next.autosave = !!(from as any).autosave;
  if (typeof (from as any)?.autosaveIntervalSec === "number") {
    next.autosaveIntervalSec = clampN((from as any).autosaveIntervalSec, 10, 600, curr.autosaveIntervalSec);
  }
  if ((from as any)?.typeface) {
    const tf = (from as any).typeface;
    next.typeface = {
      headline: { ...next.typeface.headline, ...(tf.headline ?? {}) },
      body:     { ...next.typeface.body,     ...(tf.body ?? {}) },
      accent:   { ...next.typeface.accent,   ...(tf.accent ?? {}) },
      etc:      { ...next.typeface.etc,      ...(tf.etc ?? {}) },
    };
  }
  if ((from as any)?.accentColor) {
    next.accentColor = validateHex((from as any).accentColor) || next.accentColor;
  }
  return next;
}

// Reusable UI components
function Select({
  value, onChange, children, disabled, style,
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      value={value}
      onChange={onChange}
      disabled={disabled}
      className="w-full rounded-lg border px-2 py-2 text-sm outline-none"
      style={{
        background: "var(--select-bg, rgba(255,255,255,0.05))",
        color: "var(--select-fg, #fff)",
        borderColor: "rgba(255,255,255,0.10)",
        ...style,
      }}
    >
      {children}
    </select>
  );
}
const Option: React.FC<React.OptionHTMLAttributes<HTMLOptionElement>> = (p) => (
  <option {...p} style={{ background: "var(--select-popup, #151518)", color: "var(--select-popup-fg, #fff)" }} />
);

function MonoInput(
  props: React.InputHTMLAttributes<HTMLInputElement> & { right?: React.ReactNode; accent: string }
) {
  const { right, className = "", accent, style, ...rest } = props;
  const focus = {
    outline: "none",
    boxShadow: `0 0 0 1px ${hexA(accent, 0.45)}`,
    borderColor: hexA(accent, 0.45),
  } as React.CSSProperties;
  return (
    <div className="relative flex items-center">
      <input
        {...rest}
        className={`flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none placeholder:text-white/30 ${className}`}
        onFocus={(e) => Object.assign(e.currentTarget.style, focus)}
        onBlur={(e) => {
          e.currentTarget.style.boxShadow = "";
          e.currentTarget.style.borderColor = "";
        }}
        style={style}
      />
      {right && <div className="absolute right-2 text-xs text-white/40">{right}</div>}
    </div>
  );
}

function NumberInput(
  props: React.InputHTMLAttributes<HTMLInputElement> & { accent: string; width?: number }
) {
  const { accent, width = 96, style, ...rest } = props;
  const focus = {
    outline: "none",
    boxShadow: `0 0 0 1px ${hexA(accent, 0.45)}`,
    borderColor: hexA(accent, 0.45),
  } as React.CSSProperties;
  return (
    <input
      {...rest}
      type="number"
      className="bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-sm text-right outline-none"
      style={{ width, ...style }}
      onFocus={(e) => Object.assign(e.currentTarget.style, focus)}
      onBlur={(e) => {
        e.currentTarget.style.boxShadow = "";
        e.currentTarget.style.borderColor = "";
      }}
    />
  );
}

function useSystemFonts() {
  const [fonts, setFonts] = React.useState<FontDict>({});
  useEffect(() => {
    (async () => {
      if (!isTauri()) { setFonts(buildFallbackFonts()); return; }
      try {
        try {
          // Try Rust list_fonts; if unavailable, fall back to scanning common font directories
          const list = await invoke<Array<{ name: string; styles: string[] }>>("list_fonts");
          if (Array.isArray(list) && list.length > 0) {
            const dict: FontDict = {};
            for (const f of list) dict[f.name] = new Set(f.styles?.length ? f.styles : [NONE_STYLE]);
            setFonts(dict);
            return;
          }
        } catch (e) {
          console.warn("[fonts] rust list_fonts failed, fallback to dir scan", e);
        }

        const pf = await platform();
        const home = await homeDir();
        const dirs: string[] = [];
        if (pf === "darwin") {
          dirs.push("/System/Library/Fonts", "/Library/Fonts", `${home}Library/Fonts`);
        } else if (pf === "win32") {
          const homeNorm = String(home).replace(/\\/g, "/");
          dirs.push("C:/Windows/Fonts", `${homeNorm}AppData/Local/Microsoft/Windows/Fonts`);
        } else {
          dirs.push("/usr/share/fonts", "/usr/local/share/fonts", `${home}.fonts`);
        }

        const found: FontDict = {};
        for (const dir of dirs) {
          try {
            const safeDir = dir.replace(/\\/g, "/");
            const entries = await readDir(safeDir, { recursive: true });
            for (const e of entries) collectFonts(e, found);
          } catch (err) {
            console.warn("[fonts] scan failed:", dir, err);
          }
        }
        if (Object.keys(found).length < 4) {
          const fb = buildFallbackFonts();
          for (const fam of Object.keys(fb)) {
            if (!found[fam]) found[fam] = new Set();
            fb[fam].forEach((s) => found[fam].add(s));
          }
        }
        setFonts(found);
      } catch (err) {
        console.error("[fonts] unexpected error:", err);
        setFonts(buildFallbackFonts());
      }
    })();
  }, []);
  return fonts;
}

function collectFonts(entry: any, dict: FontDict) {
  if (entry.children) { entry.children.forEach((c: any) => collectFonts(c, dict)); return; }
  const name: string = entry.name || "";
  if (!/\.(ttf|otf|ttc|otc)$/i.test(name)) return;
  const base = name.replace(/\.(ttf|otf|ttc|otc)$/i, "");
  let fam = base, style = "Regular";
  const dash = base.lastIndexOf("-");
  if (dash > 0) { fam = base.slice(0, dash); style = base.slice(dash + 1); }
  fam = fam.replace(/_/g, " "); style = style.replace(/_/g, " ");
  if (!dict[fam]) dict[fam] = new Set();
  dict[fam].add(style);
}

export function PreferenceModal({
  prefs, onChange, onClose,
}: { prefs: Preferences; onChange: (next: Preferences) => void; onClose: () => void; }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    // Also push CSS immediately for live preview (effect above covers normal updates)
    installPresetCSS({
      headline: prefs.typeface.headline,
      body:     prefs.typeface.body,
      accent:   prefs.typeface.accent,
      etc:      prefs.typeface.etc,
    });
  }, [prefs.typeface]);

  const [presetOpen, setPresetOpen] = React.useState(false);
  const [presetItems, setPresetItems] = React.useState<string[]>([]);
  const presetBtnRef = React.useRef<HTMLButtonElement | null>(null);
  const presetMenuRef = React.useRef<HTMLDivElement | null>(null);

  const [nameDlg, setNameDlg] = React.useState<{ open: boolean; value: string }>({
    open: false, value: ""
  });

  useEffect(() => {
    if (!presetOpen) return;
    const onPointerDown = (e: Event) => {
      const t = e.target as Node;
      if (presetMenuRef.current?.contains(t)) return;
      if (presetBtnRef.current?.contains(t)) return;
      setPresetOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPresetOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [presetOpen]);

  function toUserPreset(p: Preferences) {
    return {
      workingFolder: p.workingFolder,
      autosave: p.autosave,
      autosaveIntervalSec: p.autosaveIntervalSec,
      typeface: p.typeface,
      accentColor: p.accentColor,
      writingGoal: p.writingGoal,
      bracket: p.bracket,
    };
  }

  // Modal dialog for naming and saving user presets
  function NamePresetDialog({
    open, initial = "", onCancel, onSubmit,
  }: {
    open: boolean;
    initial?: string;
    onCancel: () => void;
    onSubmit: (name: string) => void;
  }) {
    const [name, setName] = React.useState(initial);
    useEffect(() => { setName(initial || ""); }, [initial, open]);
    if (!open) return null;

    const onEnter: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
      if (e.key === "Enter") onSubmit(name);
      if (e.key === "Escape") onCancel();
    };

    return (
      <div className="fixed inset-0 z-[999]" onMouseDown={onCancel}>
        <div className="absolute inset-0 bg-black/60" />
        <div className="absolute inset-0 flex items-center justify-center p-4" onMouseDown={(e) => e.stopPropagation()}>
          <div className="w-[420px] max-w-[90vw] bg-[#151518] text-white rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10 text-[15px] font-medium">Save preset</div>
            <div className="p-4 space-y-3">
              <label className="text-xs text-white/60 block">Preset name</label>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={onEnter}
                placeholder="e.g. My Writing Set"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none"
              />
              <div className="text-[11px] text-white/40">
                The preset will include: Working Folder, Autosave(+Interval), Typeface v4, Accent Color, Writing Goal, Curly Braces.
              </div>
            </div>
            <div className="px-4 py-3 border-t border-white/10 flex justify-end gap-2">
              <button
                className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs border border-white/10"
                onClick={onCancel}
              >
                Cancel
              </button>
              <button
                className="px-3 py-1.5 rounded-lg text-xs border"
                style={{ background: "var(--accent, rgba(255,255,255,0.08))", borderColor: "rgba(255,255,255,0.12)" }}
                onClick={() => onSubmit(name)}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  async function openPresetMenu() {
    try { setPresetItems(await listPresets()); } catch {}
    setPresetOpen(v => !v);
  }
  async function handleLoadPreset(name: string) {
    const data = await loadPreset(name);
    if (!data) { alert("Failed to load preset."); return; }
    const merged = { ...(prefs as any), ...(data as any) } as Preferences;
    merged.typeface = normalizeTypeface(merged.typeface);
    onChange(merged);
    setPresetOpen(false);
  }
  async function handleSavePreset() {
    setNameDlg({ open: true, value: "" });
  }

  async function doSavePreset(name: string) {
    if (!name || !name.trim()) return;
    const trimmed = name.trim();

    // Check name collision and prompt for overwrite
    let exists = false;
    try {
      const all = await listPresets();
      exists = Array.isArray(all) && all.includes(trimmed);
    } catch {}

    if (exists) {
      const ok = window.confirm(`Preset "${trimmed}" already exists.\nOverwrite it?`);
      if (!ok) return;
    }

    await savePreset(trimmed, toUserPreset(prefs) as any);
    try { setPresetItems(await listPresets()); } catch {}
    alert("Saved.");
    setPresetOpen(false);
    setNameDlg({ open: false, value: "" });
  }

  async function handleApplyDefault() {
    const base = await applyDefault();
    const merged = { ...(prefs as any), ...(base as any) } as Preferences;
    merged.typeface = normalizeTypeface(merged.typeface);
    onChange(merged);
    setPresetOpen(false);
  }

  const t = useMemo(() => {
    const lang = String((prefs as any).language);
    return (lang in STRINGS ? (STRINGS as any)[lang] : STRINGS.en);
  }, [prefs.language]);

  const set = (patch: Partial<Preferences>) => onChange({ ...prefs, ...patch });
  const setTF = (k: keyof Preferences["typeface"], patch: Partial<FontTriplet>) => {
    const next = { ...prefs.typeface, [k]: { ...prefs.typeface[k], ...patch } };
    set({ typeface: next });
    installPresetCSS({
      headline: next.headline,
      body:     next.body,
      accent:   next.accent,
      etc:      next.etc,
    });
  };
  const setBracket = (patch: Partial<Preferences["bracket"]>) =>
    set({ bracket: { ...prefs.bracket, ...patch } });

  const interval = Math.max(10, Math.min(600, Number(prefs.autosaveIntervalSec) || 10));
  const ACC = validateHex(prefs.accentColor) || FALLBACK_ACCENT;

  const sysFonts = useSystemFonts();
  const families = useMemo(() => Object.keys(sysFonts).sort((a, b) => a.localeCompare(b)), [sysFonts]);
  const stylesFor = (fam: string) => {
    const famSet = sysFonts[fam];
    if (!famSet || famSet.size === 0) return [NONE_STYLE];
    return Array.from(famSet).sort((a, b) => a.localeCompare(b));
  };

  useEffect(() => {
    const r = document.documentElement;
    r.style.setProperty("--select-bg", "rgba(255,255,255,0.05)");
    r.style.setProperty("--select-fg", "#fff");
    r.style.setProperty("--select-popup", "#151518");
    r.style.setProperty("--select-popup-fg", "#fff");
  }, []);

  const CONTENT_W = 740;
  const sharedMax = { width: `min(100%, ${CONTENT_W}px)` } as React.CSSProperties;

  const onBrowseWorkingFolder = async () => {
    if (!isTauri()) {
      alert("This action is available in the Tauri app.");
      return;
    }
    try {
      const picked = await openDialog({
        title: "Choose a working folder for Splitwriter",
        directory: true,
        multiple: false,
        defaultPath: prefs.workingFolder || undefined,
      });
      const abs =
        typeof picked === "string"
          ? picked
          : Array.isArray(picked) && picked.length > 0 && typeof picked[0] === "string"
          ? picked[0]
          : null;
      if (abs) set({ workingFolder: abs });
    } catch (err) {
      console.error("Folder picking failed:", err);
      alert("Failed to open folder picker.");
    }
  };

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          className="w-[880px] max-w-[95vw] bg-[#0f0f10] text-white rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
          style={{ maxHeight: "min(92vh, 1080px)" }}
        >
          <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="text-[15px] font-medium tracking-wide truncate">{t.title}</div>

              <div className="flex items-center gap-1 text-xs text-white/60">
                <span className="opacity-80">{t.theme}</span>
                <span className="inline-block w-0" />
                <div
                  role="switch"
                  aria-checked={prefs.theme === "dark"}
                  onClick={() => set({ theme: prefs.theme === "dark" ? "light" : "dark" })}
                  className="relative h-5 w-10 rounded-full border transition-colors shrink-0"
                  style={{
                    backgroundColor: prefs.theme === "dark" ? hexA(ACC, 0.25) : "rgba(255,255,255,0.08)",
                    borderColor:     prefs.theme === "dark" ? hexA(ACC, 0.4) : "rgba(255,255,255,0.15)",
                  }}
                  title={`${t.dark}/${t.light}`}
                >
                  <span
                    className="absolute top-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full bg-white shadow transition-[left]"
                    style={{ left: prefs.theme === "dark" ? 22 : 4 }}
                  />
                </div>
                <span className="text-xs text-white/60 ml-1">{prefs.theme === "dark" ? t.dark : t.light}</span>
              </div>
            </div>

            <div className="relative flex items-center gap-2">
              <button
                ref={presetBtnRef}
                className="w-[96px] py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs border border-white/10 text-white/85 text-center"
                onClick={openPresetMenu}
                title="Presets"
              >
                Presets ▾
              </button>

              {presetOpen && (
                <div
                  ref={presetMenuRef}
                  className="absolute right-0 top-full mt-2 w-60 rounded-lg border border-white/10 bg-[#151518] shadow-xl z-50"
                >
                  <div className="py-1 text-xs text-white/85">
                    <div className="px-3 py-1.5 text-white/45">Load preset</div>
                    {presetItems.length === 0 ? (
                      <div className="px-3 py-1.5 text-white/45">No presets</div>
                    ) : (
                      presetItems.slice(0, 10).map((name) => (
                        <button
                          key={name}
                          className="w-full text-left px-3 py-1.5 hover:bg-white/10"
                          onClick={() => handleLoadPreset(name)}
                        >
                          {name}
                        </button>
                      ))
                    )}
                    <div className="my-1 border-t border-white/10" />
                    <button className="w-full text-left px-3 py-1.5 hover:bg-white/10" onClick={handleSavePreset}>
                      Save preset…
                    </button>
                    <button className="w-full text-left px-3 py-1.5 hover:bg-white/10" onClick={handleApplyDefault}>
                      Default preset
                    </button>
                    <div className="my-1 border-t border-white/10" />
                    <button
                      className="w-full text-left px-3 py-1.5 hover:bg-white/10"
                      onClick={async () => { await revealPresetFolder(); setPresetOpen(false); }}
                    >
                      Open presets folder
                    </button>
                  </div>
                </div>
              )}

              <button className="text-white/60 hover:text-white" onClick={onClose} aria-label={t.close}>✕</button>
            </div>
          </div>

          <div className="p-5 space-y-6 overflow-y-auto" style={{ maxHeight: "calc(min(92vh,1080px) - 96px)" }}>
            <section className="space-y-2 mx-auto" style={sharedMax}>
              <label className="flex items-center gap-2 text-sm text-white/85">
                <IcFolder className="opacity-80" />
                <span>{t.workingFolder}</span>
              </label>
              <p className="text-xs text-white/45">{t.workingFolderHint}</p>
              <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                <MonoInput
                  placeholder="/Users/you/Documents/splitwriter"
                  value={prefs.workingFolder}
                  onChange={(e) => set({ workingFolder: e.target.value })}
                  accent={ACC}
                  className="w-full"
                />
                <button
                  className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-xs border border-white/10"
                  style={{ borderColor: hexA(ACC, 0.45) }}
                  onClick={onBrowseWorkingFolder}
                >
                  {t.browse}
                </button>
              </div>
            </section>

            <hr className="border-white/10" />

            <section className="grid grid-cols-[1fr_auto] items-center gap-3 mx-auto" style={sharedMax}>
              <div>
                <label className="flex items-center gap-2 text-sm text-white/85">
                  <IcClock className="opacity-80" />
                  <span>{t.autosave}</span>
                </label>
                <p className="text-xs text-white/45 mt-1">{t.autosaveDesc}</p>
              </div>
              <button
                role="switch"
                aria-checked={prefs.autosave}
                onClick={() => set({ autosave: !prefs.autosave })}
                className="relative h-6 w-12 rounded-full border transition-colors"
                style={{
                  backgroundColor: prefs.autosave ? hexA(ACC, 0.25) : "rgba(255,255,255,0.05)",
                  borderColor: prefs.autosave ? hexA(ACC, 0.4) : "rgba(255,255,255,0.15)",
                }}
                title={prefs.autosave ? "ON" : "OFF"}
              >
                <span
                  className="absolute top-1/2 -translate-y-1/2 h-4 w-4 rounded-full bg-white shadow transition-[left]"
                  style={{ left: prefs.autosave ? 28 : 4 }}
                />
              </button>
            </section>

            <section className="grid grid-cols-[1fr_auto] items-center gap-3 mx-auto" style={sharedMax}>
              <div>
                <label className="text-sm text-white/85">{t.autosaveInterval}</label>
                <p className="text-xs text-white/45 mt-1">{t.autosaveRange}</p>
              </div>
              <NumberInput
                min={10}
                max={600}
                step={5}
                value={interval}
                width={120}
                onChange={(e) => {
                  const n = Math.max(10, Math.min(600, Number(e.target.value) || 10));
                  set({ autosaveIntervalSec: n });
                }}
                disabled={!prefs.autosave}
                accent={ACC}
              />
            </section>

            <hr className="border-white/10" />

            <section className="space-y-2 mx-auto" style={sharedMax}>
              <label className="flex items-center gap-2 text-sm text-white/85">
                <IcA className="opacity-80" />
                <span>{t.fonts}</span>
              </label>
              <p className="text-xs text-white/45">{t.fontsHint}</p>

              {(["headline", "body", "accent", "etc"] as const).map((key) => {
                const label = key === "headline" ? t.headline : key === "body" ? t.body : key === "accent" ? t.accent : t.etc;
                const triplet = prefs.typeface[key];
                const styles = stylesFor(triplet.name);

                return (
                  <div key={key} className="grid grid-cols-[96px_280px_220px_120px] items-center gap-2">
                    <div className="text-xs text-white/60">{label}</div>

                    <Select
                      value={triplet.name}
                      onChange={(e) => {
                        const fam = e.target.value;
                        const candidates = stylesFor(fam);
                        const inferred = inferStyleFromName(fam);
                        const nextStyle =
                          candidates.length === 1 && candidates[0] === NONE_STYLE
                            ? NONE_STYLE
                            : inferred && candidates.includes(inferred)
                            ? inferred
                            : candidates.includes(triplet.style)
                            ? triplet.style
                            : (candidates[0] || "Regular");
                        setTF(key, { name: fam, style: nextStyle });
                      }}
                    >
                      <Option value={SYSTEM_STACK}>{SYSTEM_LABEL}</Option>
                      {families.map((fam) => (
                        <Option key={fam} value={fam}>{fam}</Option>
                      ))}
                    </Select>

                    <Select
                      value={triplet.style}
                      onChange={(e) => setTF(key, { style: e.target.value })}
                      disabled={styles.length === 1 && styles[0] === NONE_STYLE}
                      title={styles.length === 1 && styles[0] === NONE_STYLE ? "No style variants" : undefined}
                    >
                      {styles.length === 1 && styles[0] === NONE_STYLE ? (
                        <Option value={NONE_STYLE}>{NONE_STYLE}</Option>
                      ) : (
                        styles.map((st) => (
                          <Option key={st} value={st} title={`${triplet.name.replace(/\s+/g, "_")}_${st.replace(/\s+/g, "_")}`}>
                            {st}
                          </Option>
                        ))
                      )}
                    </Select>

                    <NumberInput
                      accent={ACC}
                      width={120}
                      value={triplet.size}
                      min={8}
                      max={96}
                      onChange={(e) => setTF(key, { size: clampN(e.target.value, 8, 96, triplet.size) })}
                    />
                  </div>
                );
              })}

              <div className="mt-2 rounded-lg border px-3 py-3 text-sm bg-white/5 border-white/10">
                <div className="grid grid-cols-1 gap-2">
                  <div>
                    <div className="text-white/50 text-[11px]">{t.preview} — Headline</div>
                    <div
                      style={{
                        fontFamily: prefs.typeface.headline.name,
                        fontSize: prefs.typeface.headline.size,
                        fontWeight: weightFromStyle(prefs.typeface.headline.style),
                      }}
                    >
                      The quick brown fox jumps over the lazy dog.
                    </div>
                  </div>
                  <div>
                    <div className="text-white/50 text-[11px]">{t.preview} — Body</div>
                    <div
                      style={{
                        fontFamily: prefs.typeface.body.name,
                        fontSize: prefs.typeface.body.size,
                        fontWeight: weightFromStyle(prefs.typeface.body.style),
                      }}
                    >
                      Sphinx of black quartz, judge my vow.
                    </div>
                  </div>
                  <div>
                    <div className="text-white/50 text-[11px]">{t.preview} — Accent</div>
                    <div
                      style={{
                        fontFamily: prefs.typeface.accent.name,
                        fontSize: prefs.typeface.accent.size,
                        fontWeight: weightFromStyle(prefs.typeface.accent.style),
                        color: ACC,
                      }}
                    >
                      Pack my box with five dozen liquor jugs.
                    </div>
                  </div>
                  <div>
                    <div className="text-white/50 text-[11px]">{t.preview} — Etc</div>
                    <div
                      style={{
                        fontFamily: prefs.typeface.etc.name,
                        fontSize: prefs.typeface.etc.size,
                        fontWeight: weightFromStyle(prefs.typeface.etc.style),
                        opacity: 0.85,
                      }}
                    >
                      (Etc) Waltz, bad nymph, for quick jigs vex.
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <hr className="border-white/10" />

            <section className="space-y-2 mx-auto" style={sharedMax}>
              <label className="flex items-center gap-2 text-sm text-white/85">
                <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: ACC }} />
                <span>{t.accentColor}</span>
              </label>
              <p className="text-xs text-white/45">{t.accentDesc}</p>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="color"
                  value={ACC}
                  onChange={(e) => set({ accentColor: validateHex(e.target.value) || FALLBACK_ACCENT })}
                  className="h-9 w-12 p-0 bg-transparent border border-white/10 rounded"
                  title="Pick accent color"
                />
                <MonoInput
                  placeholder="#2AA4FF"
                  value={ACC}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const v = validateHex(raw);
                    // Commit only when value is a valid 6-digit HEX; otherwise noop (matches <input type="color"> behavior)
                    if (v) set({ accentColor: v });                    
                  }}
                  accent={ACC}
                  className="w-44"
                />
              </div>
            </section>

            <hr className="border-white/10" />

            <section className="space-y-2 mx-auto" style={sharedMax}>
              <label className="flex items-center gap-2 text-sm text-white/85">
                <span className="inline-block w-3 h-3 rounded bg-white/20" />
                <span>{t.goalTitle}</span>
              </label>
              <p className="text-xs text-white/45">{t.goalDesc}</p>

              <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 items-center">
                <span className="text-sm">{t.goalEnable}</span>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="accent-white"
                    checked={prefs.writingGoal.enabled}
                    onChange={(e) => set({ writingGoal: { ...prefs.writingGoal, enabled: e.target.checked } })}
                  />
                  <span className="text-sm text-white/70">{prefs.writingGoal.enabled ? "ON" : "OFF"}</span>
                </label>

                <span className="text-sm">{t.goalUnit}</span>
                <Select
                  value={prefs.writingGoal.unit}
                  onChange={(e) => set({ writingGoal: { ...prefs.writingGoal, unit: e.target.value as any } })}
                  disabled={!prefs.writingGoal.enabled}
                >
                  <Option value="chars">{t.unitChars}</Option>
                  <Option value="words">{t.unitWords}</Option>
                </Select>

                <span className="text-sm">{t.goalTarget}</span>
                <NumberInput
                  accent={ACC}
                  min={1}
                  max={1_000_000}
                  value={prefs.writingGoal.target}
                  onChange={(e) =>
                    set({
                      writingGoal: {
                        ...prefs.writingGoal,
                        target: clampN(e.target.value, 1, 1_000_000, prefs.writingGoal.target),
                      },
                    })
                  }
                  disabled={!prefs.writingGoal.enabled}
                  width={120}
                />

                <span className="text-sm">{t.goalPreview}</span>
                <div className="text-sm text-white/80">
                  <span style={{ color: ACC, fontVariantNumeric: "tabular-nums" }}>900</span>
                  <span className="text-white/50"> / </span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{prefs.writingGoal.target.toLocaleString()}</span>
                  <span className="text-white/40 ml-2">
                    {prefs.writingGoal.unit === "chars" ? t.unitChars.toLowerCase() : t.unitWords.toLowerCase()}
                  </span>
                </div>
              </div>
            </section>

            <hr className="border-white/10" />

            <section className="space-y-2 mx-auto" style={sharedMax}>
              <label className="flex items-center gap-2 text-sm text-white/85">
                <img src={CURLY_ICON} alt="{ }" width={16} height={16} className="opacity-80" />
                <span>{t.bracket}</span>
              </label>
              <p className="text-xs text-white/45">{t.bracketDesc}</p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <label className="inline-flex items-center gap-2 select-none">
                  <input
                    type="checkbox"
                    className="accent-white"
                    checked={prefs.bracket.enable}
                    onChange={(e) => setBracket({ enable: e.target.checked })}
                  />
                  <span className="text-sm">{t.enable}</span>
                </label>
                <Select
                  value={prefs.bracket.style}
                  onChange={(e) => setBracket({ style: e.target.value as Preferences["bracket"]["style"] })}
                  disabled={!prefs.bracket.enable}
                >
                  <Option value="none">{t.none}</Option>
                  <Option value="doubleCorner">{t.doubleCorner}</Option>
                  <Option value="doubleAngle">{t.doubleAngle}</Option>
                  <Option value="singleCorner">{t.singleCorner}</Option>
                  <Option value="singleAngle">{t.singleAngle}</Option>
                </Select>
              </div>
              <div className="text-xs text-white/60 mt-1">{t.preview}:
                <code className="px-1 py-0.5 bg-white/5 rounded">{'{'}</code>content
                <code className="px-1 py-0.5 bg-white/5 rounded">{'}'}</code>
                <span className="text-white/40 mx-1">→</span>
                <span style={{ color: ACC }}>{BRACKET_MAP[prefs.bracket.style][0]}</span>
                content
                <span style={{ color: ACC }}>{BRACKET_MAP[prefs.bracket.style][1]}</span>
              </div>
            </section>
            <NamePresetDialog
                open={nameDlg.open}
                initial={nameDlg.value}
                onCancel={() => setNameDlg({ open: false, value: "" })}
                onSubmit={(n) => doSavePreset(n)}
              />
          </div>
        </div>
      </div>
    </div>
  );
}

function weightFromStyle(style: string | undefined) {
  if (!style) return 400;
  const s = style.toLowerCase();
  if (s === "(none)") return 400;
  if (s.includes("thin")) return 100;
  if (s.includes("extralight") || s.includes("ultralight")) return 200;
  if (s.includes("light")) return 300;
  if (s.includes("regular") || s.includes("normal") || s === "") return 400;
  if (s.includes("medium")) return 500;
  if (s.includes("semibold") || s.includes("demibold")) return 600;
  if (s.includes("bold")) return 700;
  if (s.includes("extrabold") || s.includes("ultrabold")) return 800;
  if (s.includes("black") || s.includes("heavy")) return 900;
  return 400;
}

export default PreferenceModal;

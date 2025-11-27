// src/board/EditBoard.tsx
import * as React from "react";

const CTL_FONT = 12;
const CTL_H = 28;

const ICONS = {
  Refresh: new URL("../icons/Refresh.png", import.meta.url).href,
};

const sx = {
  input: {
    width: "100%",
    height: CTL_H,
    lineHeight: `${CTL_H}px`,
    fontSize: CTL_FONT,
    padding: "0 10px",
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)",
    color: "#e6e6e6",
    outline: "none",
  } as React.CSSProperties,

  btn: {
    height: CTL_H,
    lineHeight: `${CTL_H}px`,
    fontSize: CTL_FONT,
    padding: "0 10px",
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "var(--text-1)",
    cursor: "pointer",
    fontWeight: 600,
  } as React.CSSProperties,

  btnIcon: {
    width: CTL_H,
    height: CTL_H,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    cursor: "pointer",
    padding: 0,
  } as React.CSSProperties,
};

type TextEntry = { id: string; html?: string; preview?: string; source?: "open" | "saved" };
type Props = { onDeleteRequest: (ids: string[]) => void };

// Derive first line preview from HTML
function firstLineFromHTML(html: string, max = 80) {
  const div = document.createElement("div");
  div.innerHTML = html || "";
  const raw = (div.textContent || "").replace(/\u00A0/g, " ").trim();
  const line = raw.split(/\r?\n/)[0] || "";
  return line.length > max ? line.slice(0, max - 1) + "…" : line;
}

// Icon-only button with hover highlight and tooltip
function IconButton({
  icon,
  title,
  onClick,
  disabled,
}: {
  icon: string;
  title: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={!!disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...sx.btnIcon,
        cursor: disabled ? "default" : "pointer",
        background:
          hover && !disabled
            ? "color-mix(in srgb, var(--accent, #6aa8ff) 16%, rgba(255,255,255,0.06))"
            : sx.btnIcon.background as string,
        border:
          hover && !disabled
            ? "1px solid color-mix(in srgb, var(--accent, #6aa8ff) 70%, rgba(255,255,255,0.12))"
            : sx.btnIcon.border as string,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <img src={icon} alt="" width={14} height={14} draggable={false} />
    </button>
  );
}

export default function EditBoard({ onDeleteRequest }: Props) {
  const [texts, setTexts] = React.useState<TextEntry[]>([]);
  const [q, setQ] = React.useState("");
  const [sel, setSel] = React.useState<Record<string, boolean>>({});
  const [isRefreshing, setRefreshing] = React.useState(false);

  // Listen for edit state and seed list
  React.useEffect(() => {
    const onState = (e: Event) => {
      const { texts = [] } = (e as CustomEvent).detail || {};
      setTexts(
        (texts as TextEntry[]).map(t => ({ ...t, preview: t.preview ?? firstLineFromHTML(t.html || "") }))
      );
      setSel({});
      setRefreshing(false);
    };
    window.addEventListener("sw:edit:state", onState as any, { capture: true });
    window.dispatchEvent(new CustomEvent("sw:edit:get"));
    return () => window.removeEventListener("sw:edit:state", onState as any, { capture: true });
  }, []);

  const filtered = React.useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return texts;
    return texts.filter(b => b.id.toLowerCase().includes(s) || (b.preview || "").toLowerCase().includes(s));
  }, [q, texts]);

  const anyChecked = Object.values(sel).some(Boolean);
  const toggleAll = (v: boolean) => {
    const next: Record<string, boolean> = {};
    for (const t of filtered) next[t.id] = v;
    setSel(next);
  };

  const sendDelete = (ids: string[]) => {
    if (!ids.length) return;
    onDeleteRequest(ids);
  };

  const deleteSelected = () => {
    const ids = Object.keys(sel).filter(k => sel[k]);
    sendDelete(ids);
  };
  const deleteOne = (id: string) => sendDelete([id]);

  const refresh = React.useCallback(() => {
    if (isRefreshing) return;
    setRefreshing(true);
    window.dispatchEvent(new CustomEvent("sw:edit:get"));
  }, [isRefreshing]);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "grid",
        gridTemplateRows: "auto 1fr",
        color: "#d7dbe0",
        paddingTop: 30,
        background: "var(--bg)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "10px 10px 6px",
          display: "grid",
          gridTemplateColumns: "minmax(320px, 1fr) auto auto", // input grows; right buttons fixed
          gap: 8,
          alignItems: "center",
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search boards…"
          style={sx.input}
        />

        {/* Refresh (icon-only) */}
        <IconButton icon={ICONS.Refresh} title="Refresh" onClick={refresh} disabled={isRefreshing} />

        {/* Delete selected */}
        <button
          type="button"
          onClick={deleteSelected}
          disabled={!anyChecked}
          style={{
            ...sx.btn,
            background: anyChecked ? "var(--accent)" : "rgba(255,255,255,0.06)",
            color: anyChecked ? "#0b0d0f" : "var(--text-1)",
            cursor: anyChecked ? "pointer" : "default",
          }}
        >
          Delete selected
        </button>
      </div>

      {/* List */}
      <div style={{ overflow: "auto", padding: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <div style={{ fontSize: 12, color: "rgba(231,234,238,0.85)" }}>{`Text boards (${filtered.length})`}</div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <SmallButton onClick={() => toggleAll(true)}>Select all</SmallButton>
            <SmallButton onClick={() => toggleAll(false)}>Clear</SmallButton>
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyRow label="No text boards" />
        ) : (
          filtered.map(t => (
            <Row key={t.id}>
              <input
                type="checkbox"
                checked={!!sel[t.id]}
                onChange={(e) => setSel({ ...sel, [t.id]: e.target.checked })}
                style={{ marginRight: 10 }}
              />
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    color: "#e7eaee",
                  }}
                  title={t.preview}
                >
                  {t.preview || "(Empty line)"}
                </div>
                <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>
                  {t.id}{t.source ? ` • ${t.source}` : ""}
                </div>
              </div>
              <div style={{ marginLeft: "auto" }}>
                <SmallButton onClick={() => deleteOne(t.id)}>delete</SmallButton>
              </div>
            </Row>
          ))
        )}
      </div>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "center",
        padding: "10px 12px",
        border: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(255,255,255,0.03)",
        borderRadius: 8,
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

function EmptyRow({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: 12,
        opacity: 0.65,
        fontSize: 12,
        border: "1px dashed rgba(255,255,255,0.10)",
        borderRadius: 8,
        marginBottom: 8,
        color: "#cfd3d8",
      }}
    >
      {label}
    </div>
  );
}

function SmallButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 26,
        lineHeight: "26px",
        fontSize: 12,
        padding: "0 10px",
        borderRadius: 6,
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.10)",
        color: "#e6e6e6",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

// 가벼운 고유 ID (브라우저/Tauri 둘 다 OK)
export function makeBoardId(prefix = "tb"): string {
  const a = crypto?.getRandomValues?.(new Uint32Array(2));
  const rand = a ? (a[0].toString(36) + a[1].toString(36)) : Math.random().toString(36).slice(2);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}
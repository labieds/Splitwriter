// text-engine/gutter.ts
// 가터 컨트롤러(현재는 비활성 스텁). 나중에 필요해지면 안전 로직만 이곳에 구현.

import type { EngineRefs } from "./engine";

/** 왼쪽 가터: 현재는 비활성(호출해도 영향 없음) */
export function onLeftGutterMouseDown(_ev: MouseEvent, _refs: EngineRefs): void {
  // no-op (stub)
}

/** 오른쪽 가터: 현재는 비활성(호출해도 영향 없음) */
export function onRightGutterMouseDown(_ev: MouseEvent, _refs: EngineRefs): void {
  // no-op (stub)
}
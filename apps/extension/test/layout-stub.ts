import { vi } from 'vitest';

/**
 * jsdom has no layout, so `getClientRects()` is always empty. This stub gives every connected element
 * one rect unless it or an ancestor is `display: none` / `hidden` — enough to model "rendered or not".
 */
export function stubLayout() {
  return vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(function (this: Element) {
    if (!this.isConnected) return [] as unknown as DOMRectList;
    for (let e: Element | null = this; e; e = e.parentElement) {
      if ((e as HTMLElement).hidden || getComputedStyle(e).display === 'none') return [] as unknown as DOMRectList;
    }
    return [{ width: 1, height: 1 }] as unknown as DOMRectList;
  });
}

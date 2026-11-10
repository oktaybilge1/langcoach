const MAP: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape text for HTML element content and quoted attributes. */
export const escapeHtml = (s: string): string => String(s).replace(/[&<>"']/g, (c) => MAP[c]!);

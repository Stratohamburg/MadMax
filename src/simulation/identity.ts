/** getRandomValues 在局域网 HTTP 页面也可用；randomUUID 要求安全上下文。 */
export function uniqueId(): string {
  const bytes = new Uint8Array(16); globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

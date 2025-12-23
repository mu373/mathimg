import type { WebToNativeMessages } from './types';

/**
 * Check if running inside WKWebView (native macOS app)
 */
export function isRunningInNative(): boolean {
  return typeof window !== 'undefined' &&
         typeof window.webkit !== 'undefined' &&
         typeof window.webkit.messageHandlers !== 'undefined';
}

/**
 * Send a message to the native Swift layer
 */
export function sendToNative<K extends keyof WebToNativeMessages>(
  type: K,
  data: WebToNativeMessages[K]
): void {
  if (!isRunningInNative()) {
    console.log('[Bridge] Not in native context, message:', type, data);
    return;
  }

  const handler = window.webkit?.messageHandlers[type];
  if (handler) {
    handler.postMessage(data);
  } else {
    console.warn(`[Bridge] No handler for message type: ${type}`);
  }
}

/**
 * Notify native that the web app is ready
 */
export function notifyReady(): void {
  sendToNative('ready', undefined as never);
}

/**
 * Send document change to native
 */
export function notifyDocumentChanged(
  document: string,
  equations: WebToNativeMessages['documentChanged']['equations'],
  frontmatter: WebToNativeMessages['documentChanged']['frontmatter']
): void {
  sendToNative('documentChanged', { document, equations, frontmatter });
}

/**
 * Send equation selection to native
 */
export function notifyEquationSelected(equationId: string, line: number): void {
  sendToNative('equationSelected', { equationId, line });
}

/**
 * Send cursor position change to native
 */
export function notifyCursorPositionChanged(
  line: number,
  column: number,
  equationId: string | null
): void {
  sendToNative('cursorPositionChanged', { line, column, equationId });
}

/**
 * Request rendering of equations
 */
export function requestRender(
  equations: WebToNativeMessages['requestRender']['equations'],
  frontmatter: WebToNativeMessages['requestRender']['frontmatter']
): void {
  sendToNative('requestRender', { equations, frontmatter });
}

/**
 * Import SVG file dropped on editor
 */
export function importSvg(svgContent: string): void {
  sendToNative('importSvg', { svgContent });
}

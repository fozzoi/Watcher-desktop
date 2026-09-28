"use client";

/**
 * Safely opens an external URL in the user's default system browser
 * Works across Tauri desktop (Windows, macOS, Linux) and web browsers.
 */
export async function openExternalUrl(url: string) {
  if (typeof window === 'undefined') return;

  // 1. Try Tauri native opener command if running inside Tauri
  try {
    if ((window as any).__TAURI_INTERNALS__) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('open_in_browser', { url });
      return;
    }
  } catch (e) {
    console.warn("Tauri open_in_browser invoke error, falling back:", e);
  }

  // 2. Try anchor click fallback
  try {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return;
  } catch (e) {
    // 3. Fallback to window.open
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

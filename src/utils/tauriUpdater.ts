// src/utils/tauriUpdater.ts
// Safe wrapper around @tauri-apps/plugin-updater.
// Only runs when the app is inside the Tauri shell — gracefully no-ops on web.

export interface UpdateInfo {
  available: boolean;
  version?: string;
  date?: string;
  body?: string;
}

export interface UpdateResult {
  success: boolean;
  info?: UpdateInfo;
  error?: string;
}

/**
 * Returns true when running inside the Tauri desktop shell.
 */
export function isTauriApp(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Check GitHub Releases for a newer version of the app.
 * Returns null outside the Tauri shell (web/vercel).
 */
export async function checkForUpdate(): Promise<UpdateResult> {
  if (!isTauriApp()) {
    return { success: false, error: 'Not running in Tauri' };
  }

  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();

    if (!update) {
      return { success: true, info: { available: false } };
    }

    return {
      success: true,
      info: {
        available: true,
        version: update.version,
        date: update.date ?? undefined,
        body: update.body ?? undefined,
      },
    };
  } catch (err: any) {
    console.error('[TauriUpdater] Check failed:', err?.message || err);
    return { success: false, error: err?.message || 'Update check failed' };
  }
}

/**
 * Download and install the latest update.
 * Returns only when the installer is ready (passive install on Windows).
 */
export async function downloadAndInstallUpdate(
  onProgress?: (downloaded: number, total: number | null) => void
): Promise<{ success: boolean; error?: string }> {
  if (!isTauriApp()) {
    return { success: false, error: 'Not running in Tauri' };
  }

  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();

    if (!update?.available) {
      return { success: false, error: 'No update available' };
    }

    let downloaded = 0;
    let total: number | null = null;

    await update.downloadAndInstall((event) => {
      if (event.event === 'Started') {
        total = event.data.contentLength ?? null;
      } else if (event.event === 'Progress') {
        downloaded += event.data.chunkLength;
        onProgress?.(downloaded, total);
      }
    });

    return { success: true };
  } catch (err: any) {
    console.error('[TauriUpdater] Install failed:', err?.message || err);
    return { success: false, error: err?.message || 'Update installation failed' };
  }
}

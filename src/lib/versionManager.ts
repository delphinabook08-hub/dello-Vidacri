export const CURRENT_APP_VERSION = "2.4.0";
export const CURRENT_BUILD_TIMESTAMP = 1770984125000;

export interface RemoteVersionInfo {
  version: string;
  buildTime?: number;
  minSupportedVersion?: string;
  forceUpdate?: boolean;
  releaseDate?: string;
  title?: string;
  message?: string;
  features?: string[];
}

export interface VersionCheckResult {
  isOutdated: boolean;
  isMandatory: boolean;
  currentVersion: string;
  remoteInfo: RemoteVersionInfo | null;
}

/**
 * Compare two semver strings like "2.4.0" and "2.3.1"
 * Returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
export function compareVersions(v1: string, v2: string): number {
  if (!v1 || !v2) return 0;
  const parts1 = v1.replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
  const parts2 = v2.replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);

  const len = Math.max(parts1.length, parts2.length);
  for (let i = 0; i < len; i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}

export async function fetchRemoteVersion(): Promise<RemoteVersionInfo | null> {
  try {
    const response = await fetch(`/version.json?_t=${Date.now()}`, {
      method: "GET",
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
      },
    });

    if (!response.ok) {
      return null;
    }

    const data: RemoteVersionInfo = await response.json();
    return data;
  } catch (err) {
    console.warn("Could not check for app updates:", err);
    return null;
  }
}

export async function checkAppVersion(): Promise<VersionCheckResult> {
  const remote = await fetchRemoteVersion();

  if (!remote || !remote.version) {
    return {
      isOutdated: false,
      isMandatory: false,
      currentVersion: CURRENT_APP_VERSION,
      remoteInfo: null,
    };
  }

  const comparison = compareVersions(CURRENT_APP_VERSION, remote.version);
  const isOutdated = comparison < 0;

  // Check if minimum supported version requirement is broken or forceUpdate flag is set
  const minVersion = remote.minSupportedVersion || remote.version;
  const violatesMin = compareVersions(CURRENT_APP_VERSION, minVersion) < 0;
  const isMandatory = (isOutdated && remote.forceUpdate === true) || violatesMin;

  return {
    isOutdated,
    isMandatory,
    currentVersion: CURRENT_APP_VERSION,
    remoteInfo: remote,
  };
}

/**
 * Purge cache, service worker, and force hard reload to load latest deployed Netlify bundle
 */
export async function forceUpdateAndReload(): Promise<void> {
  try {
    // 1. Tell Service Worker to purge cache and skip waiting
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        if (reg.active) {
          reg.active.postMessage({ type: "CLEAR_CACHES" });
          reg.active.postMessage({ type: "SKIP_WAITING" });
        }
        if (reg.waiting) {
          reg.waiting.postMessage({ type: "SKIP_WAITING" });
        }
        await reg.update().catch(() => {});
      }
    }

    // 2. Clear browser cache storage
    if ("caches" in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
    }
  } catch (err) {
    console.warn("Error clearing cache before reload:", err);
  } finally {
    // 3. Force reload with cache-busting query parameter
    const url = new URL(window.location.href);
    url.searchParams.set("v_update", Date.now().toString());
    window.location.replace(url.toString());
  }
}

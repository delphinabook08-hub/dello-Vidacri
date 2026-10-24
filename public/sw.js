const CACHE_NAME = "abookscan-v4.1";
const ASSETS_TO_CACHE = [
  "/",
  "/manifest.json",
  "/favicon.png",
  "/icon.png",
  "/icon-192.png",
  "/icon-maskable.png",
  "/icon-maskable-192.png",
  "/icon.jpg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn("Precache failed for some assets:", err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data && event.data.type === "CLEAR_CACHES") {
    event.waitUntil(
      caches.keys().then((keys) => {
        return Promise.all(keys.map((k) => caches.delete(k)));
      })
    );
  }
});

function saveSharedFileToIDB(file) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("abookscan_share_db", 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("shared_files")) {
        db.createObjectStore("shared_files");
      }
    };
    request.onsuccess = (e) => {
      const db = e.target.result;
      const tx = db.transaction("shared_files", "readwrite");
      const store = tx.objectStore("shared_files");
      store.put({ file, name: file.name, type: file.type, timestamp: Date.now() }, "latest_file");
      tx.oncomplete = () => resolve();
      tx.onerror = (err) => reject(err);
    };
    request.onerror = (err) => reject(err);
  });
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Intercept PWA Share Target POST request when user chooses "Ouvrir avec" / "Partager avec" AbookScan
  if (event.request.method === "POST" && url.searchParams.get("share_target") === "true") {
    event.respondWith(
      (async () => {
        try {
          const formData = await event.request.formData();
          const file = formData.get("file") || formData.get("media") || formData.get("audio");
          if (file && file instanceof File) {
            await saveSharedFileToIDB(file);
          }
        } catch (err) {
          console.error("Error processing shared target file:", err);
        }
        return Response.redirect("/?shared_file=1", 303);
      })()
    );
    return;
  }

  // Do not intercept non-GET requests or API routes
  if (event.request.method !== "GET" || event.request.url.includes("/api/")) {
    return;
  }

  // Network First with Cache Fallback for complete PWA compliance
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.status === 200 && event.request.url.startsWith(self.location.origin)) {
          const resClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          if (event.request.mode === "navigate") {
            return caches.match("/");
          }
          return new Response("Hors ligne", { status: 503, statusText: "Service Unavailable" });
        });
      })
  );
});

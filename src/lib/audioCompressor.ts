/**
 * Client-side Audio Converter & Resampler for Speech-To-Text AI.
 * Fast, lightweight, non-blocking and memory efficient.
 * Avoids freezing the UI thread or exceeding payload thresholds.
 */

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = reader.result as string;
      if (res) resolve(res);
      else reject(new Error("Échec de lecture du fichier audio"));
    };
    reader.onerror = () => reject(new Error("Erreur de lecture du flux audio"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Prepares and optimizes any audio Blob/File for Gemini Speech-to-Text.
 * Gemini natively supports direct audio/mp3, audio/wav, audio/m4a, audio/webm, audio/aac, audio/ogg, audio/flac.
 * Using direct native base64 encoding avoids heavy CPU audio resampling that freezes browser tabs.
 */
export async function optimizeAudioBlob(
  blob: Blob,
  onStatusUpdate?: (status: string) => void
): Promise<{ base64: string; mimeType: string }> {
  try {
    if (onStatusUpdate) onStatusUpdate("Préparation rapide de l'audio...");
    
    // Determine the cleanest MIME type for Gemini
    let mimeType = blob.type || "audio/webm";
    const typeLower = mimeType.toLowerCase();

    if (typeLower.includes("webm")) {
      mimeType = "audio/webm";
    } else if (typeLower.includes("wav") || typeLower.includes("wave")) {
      mimeType = "audio/wav";
    } else if (typeLower.includes("m4a") || typeLower.includes("mp4") || typeLower.includes("quicktime") || typeLower.includes("3gp")) {
      mimeType = "audio/mp4";
    } else if (typeLower.includes("aac")) {
      mimeType = "audio/aac";
    } else if (typeLower.includes("ogg") || typeLower.includes("vorbis")) {
      mimeType = "audio/ogg";
    } else if (typeLower.includes("flac")) {
      mimeType = "audio/flac";
    } else if (typeLower.includes("mpeg") || typeLower.includes("mp3")) {
      mimeType = "audio/mp3";
    } else {
      mimeType = "audio/webm";
    }

    const base64 = await blobToBase64(blob);
    return {
      base64,
      mimeType,
    };
  } catch (err: any) {
    console.error("Audio optimization error:", err);
    const fallbackBase64 = await blobToBase64(blob);
    return { base64: fallbackBase64, mimeType: blob.type || "audio/webm" };
  }
}


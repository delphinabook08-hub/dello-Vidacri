/**
 * Utility to compress high-resolution images client-side before sending to Gemini API.
 * This saves bandwidth, prevents timeouts, and speeds up the OCR processing times.
 */
export function compressImage(base64Str: string, maxWidth = 1000, quality = 0.65): Promise<string> {
  return new Promise((resolve) => {
    // If it's not a standard data URL, bypass
    if (!base64Str.startsWith("data:image/")) {
      resolve(base64Str);
      return;
    }

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let width = img.width;
      let height = img.height;

      // Retain aspect ratio under standard max dimension limits
      if (width > maxWidth || height > maxWidth) {
        if (width > height) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        } else {
          width = Math.round((width * maxWidth) / height);
          height = maxWidth;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(base64Str);
        return;
      }

      // Handle white background backing (preserves white paper contrast for scanned documents)
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, width, height);
      
      ctx.drawImage(img, 0, 0, width, height);

      // High-performance low size JPG compression
      const compressedDataUrl = canvas.toDataURL("image/jpeg", quality);
      resolve(compressedDataUrl);
    };

    img.onerror = () => {
      // Graceful fallback to raw image representation in case of browser decoder error
      resolve(base64Str);
    };

    img.src = base64Str;
  });
}

/**
 * Compresses an array of base64 images in parallel.
 */
export async function compressImagesInParallel(base64Array: string[], maxWidth = 1000, quality = 0.65): Promise<string[]> {
  try {
    return await Promise.all(base64Array.map(img => compressImage(img, maxWidth, quality)));
  } catch (err) {
    console.error("Parallel compression failure:", err);
    return base64Array; // Fallback
  }
}

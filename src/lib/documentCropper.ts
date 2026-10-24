/**
 * Advanced Client-Side CamScanner-Grade Automatic Paper Detection, Cropping,
 * Perspective Quad Warping, Filters, Watermarks & Image Enhancement Engine.
 */

export type ScanFilterMode = "magic" | "bw" | "lighten" | "grayscale" | "original";

export interface Point {
  x: number;
  y: number;
}

export interface QuadCorners {
  topLeft: Point;
  topRight: Point;
  bottomRight: Point;
  bottomLeft: Point;
}

export interface CropOptions {
  padding?: number; // Safety padding in pixels around cropped paper
  filterMode?: ScanFilterMode; // CamScanner filter mode
  minPaperAreaRatio?: number; // Minimum ratio of image area considered paper (e.g. 0.20)
  brightness?: number; // -50 to +50
  contrast?: number; // -50 to +50
  watermarkText?: string; // Optional custom watermark
}

/**
 * Calculates adaptive paper corner quadrilateral coordinates from an image using
 * directional inward edge & gradient analysis.
 */
export function detectPaperCorners(
  imgWidth: number,
  imgHeight: number,
  imageData?: ImageData
): QuadCorners {
  const marginX = Math.round(imgWidth * 0.04);
  const marginY = Math.round(imgHeight * 0.04);

  const defaultCorners: QuadCorners = {
    topLeft: { x: marginX, y: marginY },
    topRight: { x: imgWidth - marginX, y: marginY },
    bottomRight: { x: imgWidth - marginX, y: imgHeight - marginY },
    bottomLeft: { x: marginX, y: imgHeight - marginY }
  };

  if (!imageData || imgWidth < 50 || imgHeight < 50) {
    return defaultCorners;
  }

  const data = imageData.data;
  const w = imgWidth;
  const h = imgHeight;

  // Downsample grid step for high performance
  const stepX = Math.max(1, Math.floor(w / 160));
  const stepY = Math.max(1, Math.floor(h / 160));

  // Helper function to get luminance at pixel (x, y)
  const getLum = (x: number, y: number) => {
    const idx = (y * w + x) * 4;
    return data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114;
  };

  // 1. Calculate outer border luminance (perimeter sampling)
  let borderLumSum = 0;
  let borderPixelCount = 0;

  for (let x = 0; x < w; x += stepX * 2) {
    borderLumSum += getLum(x, 0) + getLum(x, h - 1);
    borderPixelCount += 2;
  }
  for (let y = 0; y < h; y += stepY * 2) {
    borderLumSum += getLum(0, y) + getLum(w - 1, y);
    borderPixelCount += 2;
  }

  const bgLum = borderPixelCount > 0 ? borderLumSum / borderPixelCount : 120;

  // 2. Inward directional edge scan
  let topY = marginY;
  let bottomY = h - marginY;
  let leftX = marginX;
  let rightX = w - marginX;

  // Scan Top -> Down
  const topLimit = Math.floor(h * 0.42);
  for (let y = stepY; y < topLimit; y += stepY) {
    let rowPaperCount = 0;
    const samplesInRow = Math.floor(w / stepX);
    for (let x = stepX; x < w - stepX; x += stepX) {
      const lum = getLum(x, y);
      const grad = Math.abs(lum - getLum(x, Math.max(0, y - stepY)));
      if (Math.abs(lum - bgLum) > 18 || grad > 15 || lum > 135) {
        rowPaperCount++;
      }
    }
    if (rowPaperCount / samplesInRow > 0.22) {
      topY = y;
      break;
    }
  }

  // Scan Bottom -> Up
  const bottomLimit = Math.floor(h * 0.58);
  for (let y = h - stepY - 1; y > bottomLimit; y -= stepY) {
    let rowPaperCount = 0;
    const samplesInRow = Math.floor(w / stepX);
    for (let x = stepX; x < w - stepX; x += stepX) {
      const lum = getLum(x, y);
      const grad = Math.abs(lum - getLum(x, Math.min(h - 1, y + stepY)));
      if (Math.abs(lum - bgLum) > 18 || grad > 15 || lum > 135) {
        rowPaperCount++;
      }
    }
    if (rowPaperCount / samplesInRow > 0.22) {
      bottomY = y;
      break;
    }
  }

  // Scan Left -> Right
  const leftLimit = Math.floor(w * 0.42);
  for (let x = stepX; x < leftLimit; x += stepX) {
    let colPaperCount = 0;
    const samplesInCol = Math.floor(h / stepY);
    for (let y = stepY; y < h - stepY; y += stepY) {
      const lum = getLum(x, y);
      const grad = Math.abs(lum - getLum(Math.max(0, x - stepX), y));
      if (Math.abs(lum - bgLum) > 18 || grad > 15 || lum > 135) {
        colPaperCount++;
      }
    }
    if (colPaperCount / samplesInCol > 0.22) {
      leftX = x;
      break;
    }
  }

  // Scan Right -> Left
  const rightLimit = Math.floor(w * 0.58);
  for (let x = w - stepX - 1; x > rightLimit; x -= stepX) {
    let colPaperCount = 0;
    const samplesInCol = Math.floor(h / stepY);
    for (let y = stepY; y < h - stepY; y += stepY) {
      const lum = getLum(x, y);
      const grad = Math.abs(lum - getLum(Math.min(w - 1, x + stepX), y));
      if (Math.abs(lum - bgLum) > 18 || grad > 15 || lum > 135) {
        colPaperCount++;
      }
    }
    if (colPaperCount / samplesInCol > 0.22) {
      rightX = x;
      break;
    }
  }

  // Ensure minimum valid size
  if (rightX - leftX < w * 0.3 || bottomY - topY < h * 0.3) {
    return defaultCorners;
  }

  const finalTopY = Math.max(0, topY);
  const finalBottomY = Math.min(h, bottomY);
  const finalLeftX = Math.max(0, leftX);
  const finalRightX = Math.min(w, rightX);

  return {
    topLeft: { x: finalLeftX, y: finalTopY },
    topRight: { x: finalRightX, y: finalTopY },
    bottomRight: { x: finalRightX, y: finalBottomY },
    bottomLeft: { x: finalLeftX, y: finalBottomY }
  };
}

/**
 * Unwarps a 4-corner quadrilateral region into a flat rectangular document canvas
 * using high-precision bilinear coordinate interpolation.
 */
export function warpPerspectiveBilinear(
  sourceCanvas: HTMLCanvasElement,
  corners: QuadCorners,
  targetWidth: number,
  targetHeight: number
): HTMLCanvasElement {
  const srcCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  const outCanvas = document.createElement("canvas");
  outCanvas.width = targetWidth;
  outCanvas.height = targetHeight;
  const outCtx = outCanvas.getContext("2d", { willReadFrequently: true });

  if (!srcCtx || !outCtx) return sourceCanvas;

  const srcData = srcCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const outData = outCtx.createImageData(targetWidth, targetHeight);

  const s = srcData.data;
  const d = outData.data;
  const sw = sourceCanvas.width;
  const sh = sourceCanvas.height;

  const { topLeft: tl, topRight: tr, bottomRight: br, bottomLeft: bl } = corners;

  for (let y = 0; y < targetHeight; y++) {
    const v = y / targetHeight;
    const invV = 1 - v;

    for (let x = 0; x < targetWidth; x++) {
      const u = x / targetWidth;
      const invU = 1 - u;

      // Bilinear interpolation for subpixel mapping
      const sx = Math.round(invU * invV * tl.x + u * invV * tr.x + u * v * br.x + invU * v * bl.x);
      const sy = Math.round(invU * invV * tl.y + u * invV * tr.y + u * v * br.y + invU * v * bl.y);

      const boundedX = Math.min(sw - 1, Math.max(0, sx));
      const boundedY = Math.min(sh - 1, Math.max(0, sy));

      const srcIdx = (boundedY * sw + boundedX) * 4;
      const dstIdx = (y * targetWidth + x) * 4;

      d[dstIdx] = s[srcIdx];
      d[dstIdx + 1] = s[srcIdx + 1];
      d[dstIdx + 2] = s[srcIdx + 2];
      d[dstIdx + 3] = 255;
    }
  }

  outCtx.putImageData(outData, 0, 0);
  return outCanvas;
}

/**
 * Applies CamScanner-style document processing filters to an ImageData buffer.
 */
export function applyScanFilter(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  mode: ScanFilterMode = "magic"
) {
  if (mode === "original") return;

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const len = data.length;

  if (mode === "grayscale") {
    for (let i = 0; i < len; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const lum = r * 0.299 + g * 0.587 + b * 0.114;
      
      const enhanced = lum > 160 ? Math.min(255, lum + (255 - lum) * 0.4) : Math.max(0, lum * 0.82);
      data[i] = enhanced;
      data[i + 1] = enhanced;
      data[i + 2] = enhanced;
    }
    ctx.putImageData(imageData, 0, 0);
    return;
  }

  if (mode === "bw") {
    for (let i = 0; i < len; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const lum = r * 0.299 + g * 0.587 + b * 0.114;

      let val = 255;
      if (lum < 135) {
        val = Math.max(0, (lum / 135) * 35);
      } else {
        val = 255;
      }

      data[i] = val;
      data[i + 1] = val;
      data[i + 2] = val;
    }
    ctx.putImageData(imageData, 0, 0);
    return;
  }

  if (mode === "lighten") {
    for (let i = 0; i < len; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];
      const lum = r * 0.299 + g * 0.587 + b * 0.114;

      if (lum > 135) {
        const factor = 0.50;
        r = Math.min(255, r + (255 - r) * factor);
        g = Math.min(255, g + (255 - g) * factor);
        b = Math.min(255, b + (255 - b) * factor);
      } else {
        r = Math.max(0, r * 0.85);
        g = Math.max(0, g * 0.85);
        b = Math.max(0, b * 0.85);
      }

      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
    ctx.putImageData(imageData, 0, 0);
    return;
  }

  if (mode === "magic") {
    let minLum = 255;
    let maxLum = 0;

    const step = Math.max(1, Math.floor((width * height) / 10000));
    for (let i = 0; i < len; i += 4 * step) {
      const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      if (lum < minLum) minLum = lum;
      if (lum > maxLum) maxLum = lum;
    }

    const lumRange = Math.max(40, maxLum - minLum);

    for (let i = 0; i < len; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];
      const lum = r * 0.299 + g * 0.587 + b * 0.114;

      const normLum = (lum - minLum) / lumRange;

      if (normLum > 0.58) {
        const whiteLift = Math.min(1.0, (normLum - 0.58) * 2.5);
        r = Math.min(255, r + (255 - r) * (0.55 + whiteLift * 0.45));
        g = Math.min(255, g + (255 - g) * (0.55 + whiteLift * 0.45));
        b = Math.min(255, b + (255 - b) * (0.55 + whiteLift * 0.45));
      } else if (normLum < 0.42) {
        const inkDarken = 0.65 + normLum * 0.30;
        r = Math.max(0, r * inkDarken);
        g = Math.max(0, g * inkDarken);
        b = Math.max(0, b * inkDarken);
      } else {
        r = Math.min(255, Math.max(0, (r - 128) * 1.25 + 128));
        g = Math.min(255, Math.max(0, (g - 128) * 1.25 + 128));
        b = Math.min(255, Math.max(0, (b - 128) * 1.25 + 128));
      }

      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }

    ctx.putImageData(imageData, 0, 0);
    applySharpenKernel(ctx, width, height);
  }
}

/**
 * Applies custom user brightness (-50 to +50) & contrast (-50 to +50) adjustments.
 */
export function applyCustomAdjustments(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  brightness: number = 0,
  contrast: number = 0
) {
  if (brightness === 0 && contrast === 0) return;

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const len = data.length;

  const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

  for (let i = 0; i < len; i += 4) {
    let r = data[i] + brightness * 2.55;
    let g = data[i + 1] + brightness * 2.55;
    let b = data[i + 2] + brightness * 2.55;

    r = factor * (r - 128) + 128;
    g = factor * (g - 128) + 128;
    b = factor * (b - 128) + 128;

    data[i] = Math.min(255, Math.max(0, r));
    data[i + 1] = Math.min(255, Math.max(0, g));
    data[i + 2] = Math.min(255, Math.max(0, b));
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Draws custom watermark text across document page.
 */
export function applyWatermark(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  text: string
) {
  if (!text || text.trim() === "") return;

  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate((-35 * Math.PI) / 180);

  const fontSize = Math.max(18, Math.floor(width / 16));
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillText(text.toUpperCase(), 0, 0);
  ctx.restore();
}

/**
 * Fast 3x3 Sharpen Convolution Matrix for crisp text rendering.
 */
function applySharpenKernel(ctx: CanvasRenderingContext2D, width: number, height: number) {
  try {
    const src = ctx.getImageData(0, 0, width, height);
    const dst = ctx.createImageData(width, height);
    const s = src.data;
    const d = dst.data;

    const wCenter = 2.4;
    const wEdge = -0.35;

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;
        const top = ((y - 1) * width + x) * 4;
        const bot = ((y + 1) * width + x) * 4;
        const left = (y * width + (x - 1)) * 4;
        const right = (y * width + (x + 1)) * 4;

        for (let c = 0; c < 3; c++) {
          const val =
            s[idx + c] * wCenter +
            (s[top + c] + s[bot + c] + s[left + c] + s[right + c]) * wEdge;
          d[idx + c] = Math.min(255, Math.max(0, val));
        }
        d[idx + 3] = 255;
      }
    }
    ctx.putImageData(dst, 0, 0);
  } catch (_) {}
}

/**
 * Rotates image by degrees (90, 180, 270).
 */
export function rotateImage(dataUrl: string, degrees: number): Promise<string> {
  return new Promise((resolve) => {
    if (degrees === 0) {
      resolve(dataUrl);
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }

      if (degrees === 90 || degrees === 270) {
        canvas.width = img.height;
        canvas.height = img.width;
      } else {
        canvas.width = img.width;
        canvas.height = img.height;
      }

      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((degrees * Math.PI) / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);

      resolve(canvas.toDataURL("image/jpeg", 0.88));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/**
 * Detects paper boundaries on canvas, crops perspective and applies CamScanner filters automatically.
 */
export function autoCropAndTrimPaper(
  inputDataUrl: string,
  options: CropOptions = {}
): Promise<{ croppedDataUrl: string; cropped: boolean; bounds?: { x: number; y: number; width: number; height: number } }> {
  const { filterMode = "magic", brightness = 0, contrast = 0, watermarkText } = options;

  return new Promise((resolve) => {
    if (!inputDataUrl || !inputDataUrl.startsWith("data:image/")) {
      resolve({ croppedDataUrl: inputDataUrl, cropped: false });
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      try {
        const origWidth = img.width;
        const origHeight = img.height;

        const srcCanvas = document.createElement("canvas");
        srcCanvas.width = origWidth;
        srcCanvas.height = origHeight;
        const srcCtx = srcCanvas.getContext("2d", { willReadFrequently: true });

        if (!srcCtx) {
          resolve({ croppedDataUrl: inputDataUrl, cropped: false });
          return;
        }

        srcCtx.drawImage(img, 0, 0, origWidth, origHeight);
        const imageData = srcCtx.getImageData(0, 0, origWidth, origHeight);

        // Detect 4 paper corners
        const corners = detectPaperCorners(origWidth, origHeight, imageData);

        // Calculate destination unwarped canvas size
        const topW = Math.hypot(corners.topRight.x - corners.topLeft.x, corners.topRight.y - corners.topLeft.y);
        const botW = Math.hypot(corners.bottomRight.x - corners.bottomLeft.x, corners.bottomRight.y - corners.bottomLeft.y);
        const leftH = Math.hypot(corners.bottomLeft.x - corners.topLeft.x, corners.bottomLeft.y - corners.topLeft.y);
        const rightH = Math.hypot(corners.bottomRight.x - corners.topRight.x, corners.bottomRight.y - corners.topRight.y);

        const targetW = Math.max(300, Math.round(Math.max(topW, botW)));
        const targetH = Math.max(400, Math.round(Math.max(leftH, rightH)));

        // Perspective unwarp paper onto destination canvas
        const unwarpedCanvas = warpPerspectiveBilinear(srcCanvas, corners, targetW, targetH);
        const outCtx = unwarpedCanvas.getContext("2d", { willReadFrequently: true });

        if (!outCtx) {
          resolve({ croppedDataUrl: inputDataUrl, cropped: false });
          return;
        }

        // Apply CamScanner Filters
        applyScanFilter(outCtx, targetW, targetH, filterMode);
        applyCustomAdjustments(outCtx, targetW, targetH, brightness, contrast);
        if (watermarkText) {
          applyWatermark(outCtx, targetW, targetH, watermarkText);
        }

        const croppedDataUrl = unwarpedCanvas.toDataURL("image/jpeg", 0.88);
        resolve({
          croppedDataUrl,
          cropped: true,
          bounds: { x: corners.topLeft.x, y: corners.topLeft.y, width: targetW, height: targetH }
        });

      } catch (err) {
        console.error("CamScanner paper processing error:", err);
        resolve({ croppedDataUrl: inputDataUrl, cropped: false });
      }
    };

    img.onerror = () => {
      resolve({ croppedDataUrl: inputDataUrl, cropped: false });
    };

    img.src = inputDataUrl;
  });
}

/**
 * Process multiple scanned images with auto paper cropping and CamScanner filter in parallel.
 */
export async function autoCropBatch(
  images: string[],
  options?: CropOptions
): Promise<string[]> {
  try {
    const results = await Promise.all(images.map(img => autoCropAndTrimPaper(img, options)));
    return results.map(res => res.croppedDataUrl);
  } catch (err) {
    console.error("Batch auto crop error:", err);
    return images;
  }
}

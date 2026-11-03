// src/utils/colorExtractor.ts
// Ported from the Watcher Expo app — extracts vibrant dominant colors and produces
// an Apple Music / Netflix style ambient pastel-dark palette for movie/cast detail pages.
// Uses browser Canvas for zero-dependency, ultra-fast (<2ms) extraction.

import { useEffect, useState } from 'react';
import { getImageUrl } from './tmdb';

export interface ExtractedPalette {
  dominant: string;
  pastelDark: string;
  gradient: [string, string, string];
}

export const AMBIENT_PENDING_BG = '#1B1A1F';

// In-memory cache to make re-renders and repeat visits instantaneous
const paletteCache = new Map<string, ExtractedPalette>();

// Extractions currently running to prevent duplicate image decodes
const inFlight = new Map<string, Promise<ExtractedPalette | null>>();

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return [h * 360, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;

  if (h >= 0 && h < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (h >= 60 && h < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (h >= 120 && h < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (h >= 180 && h < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (h >= 240 && h < 300) {
    r = x;
    g = 0;
    b = c;
  } else {
    r = c;
    g = 0;
    b = x;
  }

  const toHex = (val: number) => Math.round((val + m) * 255).toString(16).padStart(2, '0');
  return '#' + toHex(r) + toHex(g) + toHex(b);
}

/**
 * Extracts the vibrant dominant color and produces an ambient palette.
 * Deduped by URL: concurrent callers share a single download/decode.
 */
export function extractPaletteFromUrl(imageUrl: string): Promise<ExtractedPalette | null> {
  if (!imageUrl) return Promise.resolve(null);
  console.log('[COLOR_EXTRACTOR] Starting extraction for:', imageUrl);

  const cached = paletteCache.get(imageUrl);
  if (cached) return Promise.resolve(cached);

  const pending = inFlight.get(imageUrl);
  if (pending) return pending;

  const task = new Promise<ExtractedPalette | null>((resolve) => {
    if (typeof window === 'undefined') {
      return resolve(null);
    }

    // Use smaller thumbnail (w92) for instant download (<5KB) and append ?cors=1
    // to bypass any non-CORS cached entry created by the DOM's <img> tags.
    const extractUrl = imageUrl.replace(/\/w(500|780|1280|original)\//, '/w92/') +
      (imageUrl.includes('?') ? '&cors=1' : '?cors=1');

    const processDrawable = (drawable: CanvasImageSource) => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return resolve(null);

        // 32x32 spatial thumbnail for fast extraction (< 1ms)
        const w = 32;
        const h = 32;
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(drawable, 0, 0, w, h);

        const imgData = ctx.getImageData(0, 0, w, h);
        const pixels = imgData.data;
        if (!pixels || pixels.length < 4) return resolve(null);

        // 36 hue bins (10 degrees each)
        const bins = new Array(36).fill(0);
        const binRgb = new Array(36).fill(0).map(() => ({ r: 0, g: 0, b: 0, count: 0 }));

        let totalR = 0;
        let totalG = 0;
        let totalB = 0;
        let totalSamples = 0;

        const len = pixels.length;
        // Sample every pixel in the 32x32 image
        for (let i = 0; i < len; i += 4) {
          const a = pixels[i + 3];
          if (a < 180) continue;

          const r = pixels[i];
          const g = pixels[i + 1];
          const b = pixels[i + 2];

          const [hue, sat, lum] = rgbToHsl(r, g, b);

          // Skip pure black letterboxes (< 0.05) and blown-out highlights (> 0.95)
          if (lum < 0.05 || lum > 0.95) continue;

          totalR += r;
          totalG += g;
          totalB += b;
          totalSamples++;

          // Filter near-grayscale pixels (s < 0.10) for hue extraction
          if (sat < 0.10) continue;

          // Weight combines visual mass with chromatic boost
          const weight = 1.0 + (sat * 1.4) * (1.0 - Math.abs(lum - 0.45));
          const binIdx = Math.floor(hue / 10) % 36;
          bins[binIdx] += weight;
          binRgb[binIdx].r += r;
          binRgb[binIdx].g += g;
          binRgb[binIdx].b += b;
          binRgb[binIdx].count += 1;
        }

        // Find the winning hue bucket
        let bestBin = -1;
        let maxScore = 0;
        for (let i = 0; i < 36; i++) {
          if (bins[i] > maxScore) {
            maxScore = bins[i];
            bestBin = i;
          }
        }

        let avgR = 0;
        let avgG = 0;
        let avgB = 0;
        let finalHue = 0;
        let finalSat = 0;

        if (bestBin !== -1 && binRgb[bestBin].count > 0) {
          avgR = Math.round(binRgb[bestBin].r / binRgb[bestBin].count);
          avgG = Math.round(binRgb[bestBin].g / binRgb[bestBin].count);
          avgB = Math.round(binRgb[bestBin].b / binRgb[bestBin].count);
          [finalHue, finalSat] = rgbToHsl(avgR, avgG, avgB);
        } else if (totalSamples > 0) {
          avgR = Math.round(totalR / totalSamples);
          avgG = Math.round(totalG / totalSamples);
          avgB = Math.round(totalB / totalSamples);
          [finalHue, finalSat] = rgbToHsl(avgR, avgG, avgB);
        } else {
          avgR = 24;
          avgG = 28;
          avgB = 34;
          finalHue = 220;
          finalSat = 0.15;
        }

        // Refined Pastel Dark Color:
        // Rich, tinted dark background: lightness ~12.5%, saturation ~32%
        const clampedSat = Math.max(0.28, Math.min(0.40, finalSat));
        const pastelDark = hslToHex(finalHue, clampedSat, 0.125);

        // Multi-stop hero transition gradient
        const gradient: [string, string, string] = [
          'transparent',
          `rgba(${avgR}, ${avgG}, ${avgB}, 0.35)`,
          pastelDark,
        ];

        const palette: ExtractedPalette = {
          dominant: hslToHex(finalHue, Math.max(0.60, finalSat), 0.50),
          pastelDark,
          gradient,
        };

        paletteCache.set(imageUrl, palette);
        console.log('[COLOR_EXTRACTOR] Extracted palette:', palette.pastelDark, palette.dominant, 'for', imageUrl);
        resolve(palette);
      } catch (e) {
        console.error('[COLOR_EXTRACTOR_ERROR]', e);
        resolve(null);
      }
    };

    // Load with fetch -> blob -> createImageBitmap (zero CORS/cache issues)
    fetch(extractUrl)
      .then((res) => res.blob())
      .then((blob) => createImageBitmap(blob))
      .then((bitmap) => processDrawable(bitmap))
      .catch(() => {
        // Fallback to Image element
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => processDrawable(img);
        img.onerror = (err) => {
          console.error('[COLOR_EXTRACTOR_IMG_ERROR]', err, 'for url:', extractUrl);
          resolve(null);
        };
        img.src = extractUrl;
      });
  }).finally(() => {
    inFlight.delete(imageUrl);
  });

  inFlight.set(imageUrl, task);
  return task;
}

export function warmPalette(imageUrl?: string | null): void {
  if (!imageUrl) return;
  extractPaletteFromUrl(imageUrl).catch(() => {});
}

export function warmPaletteForMedia(
  item?: { poster_path?: string | null; backdrop_path?: string | null; profile_path?: string | null } | null
): void {
  if (!item) return;
  if (item.poster_path) {
    warmPalette(getImageUrl(item.poster_path, 'w500'));
  } else if (item.backdrop_path) {
    warmPalette(getImageUrl(item.backdrop_path, 'w780'));
  } else if (item.profile_path) {
    warmPalette(getImageUrl(item.profile_path, 'w500'));
  }
}

/**
 * React hook to automatically extract and observe the ambient palette for a given image URL.
 */
export function useImagePalette(imageUrl?: string | null): {
  palette: ExtractedPalette | null;
  loading: boolean;
  failed: boolean;
} {
  const [palette, setPalette] = useState<ExtractedPalette | null>(() => {
    return imageUrl && paletteCache.has(imageUrl) ? paletteCache.get(imageUrl)! : null;
  });
  const [loading, setLoading] = useState<boolean>(() => {
    return Boolean(imageUrl && !paletteCache.has(imageUrl));
  });
  const [failed, setFailed] = useState<boolean>(false);

  useEffect(() => {
    if (!imageUrl) {
      setPalette(null);
      setLoading(false);
      setFailed(false);
      return;
    }

    const cached = paletteCache.get(imageUrl);
    if (cached) {
      setPalette(cached);
      setLoading(false);
      setFailed(false);
      return;
    }

    setLoading(true);
    setFailed(false);

    let isMounted = true;
    extractPaletteFromUrl(imageUrl).then((result) => {
      if (!isMounted) return;
      if (result) {
        setPalette(result);
        setFailed(false);
      } else {
        setFailed(true);
      }
      setLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, [imageUrl]);

  return { palette, loading, failed };
}

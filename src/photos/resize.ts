export const MAX_EDGE = 1600;
export const JPEG_QUALITY = 0.8;

export interface Dimensions {
  width: number;
  height: number;
}

/**
 * Pure, so it can be tested without a canvas. Never enlarges: a small photo
 * stays small rather than being upscaled into a larger file.
 */
export function fitWithin(source: Dimensions, maxEdge: number = MAX_EDGE): Dimensions {
  const longest = Math.max(source.width, source.height);
  if (longest <= maxEdge) return { ...source };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(source.width * scale)),
    height: Math.max(1, Math.round(source.height * scale)),
  };
}

export interface ResizedImage {
  blob: Blob;
  width: number;
  height: number;
}

/**
 * The single most important function in the photo path, per doc 06. A phone
 * photo goes from roughly 4 MB to roughly 200 KB, which is the difference
 * between an upload that finishes on a hotspot and one that does not. It also
 * keeps every file under the 2 MB ceiling storage.rules enforces.
 *
 * `imageOrientation: "from-image"` applies the EXIF rotation, so a portrait
 * photo does not arrive sideways.
 */
export async function resizeForUpload(file: File | Blob): Promise<ResizedImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const target = fitWithin({ width: bitmap.width, height: bitmap.height });

  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get a drawing context for the photo.");
  ctx.drawImage(bitmap, 0, 0, target.width, target.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
  );
  if (!blob) throw new Error("Could not process the photo.");

  return { blob, width: target.width, height: target.height };
}

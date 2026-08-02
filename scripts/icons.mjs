/**
 * Rasterizes public/icon.svg into the PNG sizes Android and iOS require for
 * an install prompt. Run once, or after editing the SVG. The outputs are
 * committed so a clean clone does not need sharp to build.
 */
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const src = "public/icon.svg";
const targets = [
  ["public/pwa-192.png", 192],
  ["public/pwa-512.png", 512],
  ["public/pwa-512-maskable.png", 512],
  ["public/apple-touch-icon.png", 180],
];

await mkdir("public", { recursive: true });
for (const [out, size] of targets) {
  await sharp(src).resize(size, size).png().toFile(out);
  console.log(`wrote ${out}`);
}

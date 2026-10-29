// Generates favicon / PWA / apple-touch icons from Paddy's green mark.
// Usage: node scripts/generate-icons.mjs   (needs `sharp`, bundled with Next)
import sharp from "sharp";
import { writeFileSync, mkdirSync } from "node:fs";

const MARK = `
  <defs>
    <linearGradient id="g" x1="8" y1="6" x2="40" y2="44" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#2dd4bf"/><stop offset="1" stop-color="#0f766e"/>
    </linearGradient>
  </defs>
  <path d="M24 10c0-3 1.5-5.5 4.5-6.5-.2 3.3-1.8 5.6-4.5 6.5Z" fill="#5eead4"/>
  <path d="M24 10c-.2-2.4-1.6-4.2-3.9-4.9.3 2.5 1.6 4.2 3.9 4.9Z" fill="#99f6e4"/>
  <path d="M24 9.5c9.6 0 17 6.9 17 16.6C41 36 33.9 42 24 42S7 36 7 26.1C7 16.4 14.4 9.5 24 9.5Z" fill="url(#g)"/>
  <circle cx="18.5" cy="25" r="2.2" fill="#f0fdfa"/>
  <circle cx="29.5" cy="25" r="2.2" fill="#f0fdfa"/>
  <path d="M19.5 31.2c2.6 2.4 6.4 2.4 9 0" stroke="#f0fdfa" stroke-width="2.2" stroke-linecap="round" fill="none"/>
  <circle cx="15" cy="30" r="1.8" fill="#fda4af" opacity=".55"/>
  <circle cx="33" cy="30" r="1.8" fill="#fda4af" opacity=".55"/>`;

// Transparent, tightly cropped (favicon / "any" icons)
const tight = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="4 2.5 40 40">${MARK}</svg>`;
// Opaque mint tile with padding (apple-touch, maskable: content inside the 80% safe zone)
const tile = (pad) => {
  const s = 40 + pad * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${4 - pad} ${2.5 - pad} ${s} ${s}">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#f0fdfa"/><stop offset="1" stop-color="#ccfbf1"/></linearGradient></defs>
  <rect x="${4 - pad}" y="${2.5 - pad}" width="${s}" height="${s}" fill="url(#bg)"/>${MARK}</svg>`;
};

const png = (svg, size) => sharp(Buffer.from(svg), { density: 600 }).resize(size, size).png().toBuffer();

mkdirSync("public/icons", { recursive: true });
writeFileSync("src/app/icon.svg", tight + "\n");
writeFileSync("public/icons/paddy-mark.svg", tight + "\n");

const out = {
  "public/icon-192.png": [tight, 192],
  "public/icon-512.png": [tight, 512],
  "public/icons/maskable-192.png": [tile(12), 192],
  "public/icons/maskable-512.png": [tile(12), 512],
  "public/icons/badge-96.png": [tight, 96],
  "src/app/apple-icon.png": [tile(6), 180],
  "public/apple-touch-icon.png": [tile(6), 180],
};
for (const [file, [svg, size]] of Object.entries(out)) writeFileSync(file, await png(svg, size));

// favicon.ico (16/32/48 PNG-in-ICO)
const sizes = [16, 32, 48];
const imgs = await Promise.all(sizes.map((s) => png(tight, s)));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((s, i) => {
  const e = 6 + i * 16;
  header.writeUInt8(s, e); header.writeUInt8(s, e + 1); header.writeUInt8(0, e + 2); header.writeUInt8(0, e + 3);
  header.writeUInt16LE(1, e + 4); header.writeUInt16LE(32, e + 6);
  header.writeUInt32LE(imgs[i].length, e + 8); header.writeUInt32LE(offset, e + 12);
  offset += imgs[i].length;
});
writeFileSync("src/app/favicon.ico", Buffer.concat([header, ...imgs]));
console.log("icons written");

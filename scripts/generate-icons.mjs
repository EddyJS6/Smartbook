import { deflateSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const outputDirectory = join(process.cwd(), "public", "icons");

function crc32(buffer) {
  let value = 0xffffffff;

  for (const byte of buffer) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
    }
  }

  return (value ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  const checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function insideRoundedRect(x, y, left, top, right, bottom, radius) {
  const closestX = Math.max(left + radius, Math.min(x, right - radius));
  const closestY = Math.max(top + radius, Math.min(y, bottom - radius));
  const dx = x - closestX;
  const dy = y - closestY;
  return dx * dx + dy * dy <= radius * radius;
}

function createIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const colors = {
    paper: [245, 241, 233, 255],
    green: [49, 95, 77, 255],
    cream: [255, 253, 249, 255],
    clay: [185, 97, 70, 255],
  };

  const paint = (x, y, color) => {
    const offset = (y * size + x) * 4;
    pixels.set(color, offset);
  };

  const margin = Math.round(size * 0.08);
  const bookLeft = Math.round(size * 0.23);
  const bookRight = Math.round(size * 0.77);
  const bookTop = Math.round(size * 0.19);
  const bookBottom = Math.round(size * 0.81);
  const middle = Math.round(size * 0.5);
  const bookRadius = Math.round(size * 0.055);
  const stroke = Math.max(2, Math.round(size * 0.018));

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const tile = insideRoundedRect(
        x,
        y,
        margin,
        margin,
        size - margin,
        size - margin,
        Math.round(size * 0.2),
      );
      paint(x, y, tile ? colors.green : colors.paper);

      if (
        insideRoundedRect(
          x,
          y,
          bookLeft,
          bookTop,
          bookRight,
          bookBottom,
          bookRadius,
        )
      ) {
        paint(x, y, colors.cream);
      }

      if (
        x >= middle - stroke &&
        x <= middle + stroke &&
        y >= bookTop &&
        y <= bookBottom
      ) {
        paint(x, y, colors.green);
      }

      const bookmarkLeft = Math.round(size * 0.61);
      const bookmarkRight = Math.round(size * 0.68);
      const bookmarkBottom = Math.round(size * 0.45);
      if (
        x >= bookmarkLeft &&
        x <= bookmarkRight &&
        y >= bookTop &&
        y <= bookmarkBottom
      ) {
        paint(x, y, colors.clay);
      }
    }
  }

  const rows = [];
  for (let y = 0; y < size; y += 1) {
    rows.push(Buffer.from([0]), pixels.subarray(y * size * 4, (y + 1) * size * 4));
  }

  const signature = Buffer.from([
    137, 80, 78, 71, 13, 10, 26, 10,
  ]);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;

  return Buffer.concat([
    signature,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(join(outputDirectory, "icon-192.png"), createIcon(192)),
  writeFile(join(outputDirectory, "icon-512.png"), createIcon(512)),
  writeFile(join(outputDirectory, "apple-touch-icon.png"), createIcon(180)),
]);

console.log("Icônes BrainBook générées dans public/icons.");

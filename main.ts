const { readFileSync, mkdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

const MAX_BYTES = 1048576;
const CANDIDATES = ["phoenix", "phoenix-v2", "manta", "manta-v2", "cosmos", "narwhal"];

function validateJpeg(bytes) {
  if (bytes.length < 4 || bytes.length > MAX_BYTES) {
    throw new Error("Image must be between 4 bytes and 1 MiB.");
  }
  if (bytes.readUInt16BE(0) !== 0xffd8 || bytes.readUInt16BE(bytes.length - 2) !== 0xffd9) {
    throw new Error("JPEG start or end marker is missing.");
  }

  let offset = 2;
  let dimensions;
  let inScan = false;
  let sawScan = false;
  while (offset < bytes.length) {
    if (bytes[offset++] !== 0xff) {
      if (inScan) continue;
      throw new Error("Invalid JPEG marker.");
    }
    while (bytes[offset] === 0xff) offset++;
    if (offset >= bytes.length) throw new Error("Truncated JPEG marker.");
    const marker = bytes[offset++];
    if (inScan && (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7))) continue;
    inScan = false;
    if (marker === 0xd9) {
      if (!sawScan || offset !== bytes.length) throw new Error("Incomplete JPEG or trailing bytes.");
      if (!dimensions || dimensions.width !== 1024 || dimensions.height !== 1024) {
        throw new Error("Bundled artwork must be exactly 1024 by 1024 pixels.");
      }
      return;
    }
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      throw new Error("Unexpected standalone JPEG marker.");
    }
    if (offset + 2 > bytes.length) throw new Error("Truncated JPEG segment.");
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length - 2) {
      throw new Error("Invalid JPEG segment length.");
    }
    if (marker === 0xc0 || marker === 0xc2) {
      if (dimensions || length < 8 || bytes[offset + 2] !== 8 ||
          length !== 8 + 3 * bytes[offset + 7]) {
        throw new Error("Invalid JPEG frame header.");
      }
      dimensions = { height: bytes.readUInt16BE(offset + 3), width: bytes.readUInt16BE(offset + 5) };
    }
    if (marker === 0xda) {
      if (!dimensions || length < 6 || length !== 6 + 2 * bytes[offset + 2]) {
        throw new Error("Invalid JPEG scan header.");
      }
      sawScan = true;
      inScan = true;
    }
    offset += length;
  }
  throw new Error("JPEG ended before its end marker.");
}

function main() {
  const selected = readFileSync(join(__dirname, "selected.txt"), "utf8").trim();
  if (!CANDIDATES.includes(selected)) {
    throw new Error("selected.txt must contain phoenix, phoenix-v2, manta, manta-v2, cosmos, or narwhal.");
  }
  const bytes = readFileSync(join(__dirname, "assets", `${selected}.jpg`));
  validateJpeg(bytes);
  const outputDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, "entry.png"), bytes);
  console.log(`${selected}: wrote ${bytes.length} JPEG bytes to entry.png`);
}

main();

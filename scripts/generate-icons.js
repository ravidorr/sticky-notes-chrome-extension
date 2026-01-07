/**
 * Generate placeholder PNG icons for the extension
 * Run with: node scripts/generate-icons.js
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { deflateSync } from 'zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, '..', 'public', 'icons');

// Ensure icons directory exists
if (!existsSync(iconsDir)) {
  mkdirSync(iconsDir, { recursive: true });
}

// CRC32 implementation
let crcTable = null;
function getCrcTable() {
  if (crcTable) return crcTable;
  
  crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1);
    }
    crcTable[i] = crc;
  }
  return crcTable;
}

function crc32(data) {
  let crc = 0xFFFFFFFF;
  const table = getCrcTable();
  
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  
  return crc ^ 0xFFFFFFFF;
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  
  const typeBuffer = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = crc32(crcData);
  
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc >>> 0, 0);
  
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

// Generate icons
const sizes = [16, 32, 48, 128];

for (const size of sizes) {
  // Create uncompressed data
  const rawData = [];
  for (let y = 0; y < size; y++) {
    rawData.push(0); // filter byte
    for (let x = 0; x < size; x++) {
      // Create a simple sticky note icon pattern
      const border = Math.max(1, Math.floor(size * 0.0625));
      const headerHeight = Math.floor(size * 0.3);
      const cornerRadius = Math.floor(size * 0.125);
      
      // Check if in rounded corner area
      const inTopLeftCorner = x < cornerRadius && y < cornerRadius;
      const inTopRightCorner = x >= size - cornerRadius && y < cornerRadius;
      const inBottomLeftCorner = x < cornerRadius && y >= size - cornerRadius;
      const inBottomRightCorner = x >= size - cornerRadius && y >= size - cornerRadius;
      
      let isInRoundedArea = false;
      if (inTopLeftCorner) {
        const dx = cornerRadius - x;
        const dy = cornerRadius - y;
        isInRoundedArea = dx * dx + dy * dy > cornerRadius * cornerRadius;
      } else if (inTopRightCorner) {
        const dx = x - (size - cornerRadius - 1);
        const dy = cornerRadius - y;
        isInRoundedArea = dx * dx + dy * dy > cornerRadius * cornerRadius;
      } else if (inBottomLeftCorner) {
        const dx = cornerRadius - x;
        const dy = y - (size - cornerRadius - 1);
        isInRoundedArea = dx * dx + dy * dy > cornerRadius * cornerRadius;
      } else if (inBottomRightCorner) {
        const dx = x - (size - cornerRadius - 1);
        const dy = y - (size - cornerRadius - 1);
        isInRoundedArea = dx * dx + dy * dy > cornerRadius * cornerRadius;
      }
      
      if (isInRoundedArea) {
        // Transparent (but PNG RGB doesn't support alpha, so use white)
        rawData.push(255, 255, 255);
      } else if (x < border || x >= size - border || y < border || y >= size - border) {
        // Border - amber
        rawData.push(202, 138, 4);
      } else if (y < headerHeight) {
        // Header - golden yellow
        rawData.push(250, 204, 21);
      } else {
        // Body - light yellow
        rawData.push(254, 249, 195);
      }
    }
  }
  
  const compressed = deflateSync(Buffer.from(rawData));
  
  // Build PNG
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 2;
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  
  const png = Buffer.concat([
    signature,
    createChunk('IHDR', ihdrData),
    createChunk('IDAT', compressed),
    createChunk('IEND', Buffer.alloc(0))
  ]);
  
  const iconPath = join(iconsDir, `icon${size}.png`);
  writeFileSync(iconPath, png);
  console.log(`Created ${iconPath}`);
}

console.log('Done generating icons!');

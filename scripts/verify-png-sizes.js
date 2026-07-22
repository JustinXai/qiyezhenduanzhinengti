const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = 'E:/企业诊断智能体_private/enterprise-report-final-v3';

const files = [
    'desktop-final-v3.png',
    'mobile-hd-01-summary.png',
    'mobile-hd-02-needs.png',
    'mobile-hd-03-assets.png',
    'mobile-hd-04-roadmap-evidence.png'
];

function getPngDimensions(buffer) {
    if (buffer.length < 24) return null;
    // PNG signature (8 bytes) + IHDR chunk (4 length + 4 type + 13 data + 4 CRC)
    // Width is at bytes 16-19, Height at 20-23 (big-endian)
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return { width, height };
}

console.log('\n========== PNG DIMENSIONS ==========\n');
for (const file of files) {
    const filePath = path.join(OUTPUT_DIR, file);
    if (fs.existsSync(filePath)) {
        const buffer = fs.readFileSync(filePath);
        const dims = getPngDimensions(buffer);
        if (dims) {
            console.log(`${file}: ${dims.width} x ${dims.height} px`);
        }
    }
}

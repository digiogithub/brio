/**
 * Generate PNG favicon files from the Brio SVG logo using sharp.
 * sharp reads the SVG via libvips (much more reliable than Chrome headless).
 *
 * Usage: node scripts/generate-favicons.mjs
 *   (runs from the repo root; uses sharp from api/node_modules)
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Resolve sharp from the API workspace where it is installed
const require = createRequire(import.meta.url);
const sharp = require(join(ROOT, 'api/node_modules/sharp'));

const SVG_PATH = join(ROOT, 'app/public/brio-favicon.svg');
const ICONS_DIR = join(ROOT, 'app/public/img/icons');
const PUBLIC_DIR = join(ROOT, 'app/public/img');

mkdirSync(ICONS_DIR, { recursive: true });
mkdirSync(PUBLIC_DIR, { recursive: true });

/** @type {{ size: number; output: string }[]} */
const SIZES = [
    // Browser favicons
    { size: 16, output: join(PUBLIC_DIR, 'favicon-16.png') },
    { size: 32, output: join(PUBLIC_DIR, 'favicon-32.png') },
    { size: 48, output: join(PUBLIC_DIR, 'favicon-48.png') },
    // Apple touch icon
    { size: 180, output: join(PUBLIC_DIR, 'apple-touch-icon.png') },
    // PWA icons
    { size: 192, output: join(ICONS_DIR, 'icon-192x192.png') },
    { size: 512, output: join(ICONS_DIR, 'icon-512x512.png') },
    // MS Tile
    { size: 150, output: join(ICONS_DIR, 'mstile-150x150.png') },
];

console.log('Generating PNG favicons from brio-favicon.svg …\n');

for (const { size, output } of SIZES) {
    const rel = output.replace(ROOT + '/', '');
    process.stdout.write(`  ${size}×${size} → ${rel} … `);
    try {
        // Render the SVG at 72 DPI (native viewBox resolution ~2048px), then resize.
        await sharp(SVG_PATH, { density: 72 })
            .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .png()
            .toFile(output);
        console.log('OK');
    } catch (err) {
        console.log('ERROR:', err.message);
    }
}

console.log('\nDone.');

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const publicDir = path.resolve(process.cwd(), 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Standard SVG Icon (512x512)
const standardSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e3a8a" />
      <stop offset="50%" stop-color="#2563eb" />
      <stop offset="100%" stop-color="#0284c7" />
    </linearGradient>
    <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8" />
      <stop offset="100%" stop-color="#4ade80" />
    </linearGradient>
    <linearGradient id="boltGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="100%" stop-color="#e0f2fe" />
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000000" flood-opacity="0.3"/>
    </filter>
  </defs>

  <!-- Background rounded rect -->
  <rect width="512" height="512" rx="112" fill="url(#bgGrad)" />

  <!-- Subtle grid / tech circles -->
  <circle cx="256" cy="256" r="180" stroke="rgba(255,255,255,0.08)" stroke-width="2" fill="none" />
  <circle cx="256" cy="256" r="130" stroke="rgba(255,255,255,0.08)" stroke-width="2" stroke-dasharray="8 8" fill="none" />

  <!-- Modern Rocket / Growth Impulse Symbol -->
  <g filter="url(#glow)">
    <!-- Upward Growth Arrow / Rocket Wings -->
    <path d="M256 96 C270 160 330 220 376 240 C340 250 310 270 290 310 L256 270 L222 310 C202 270 172 250 136 240 C182 220 242 160 256 96 Z" fill="url(#boltGrad)" />

    <!-- Core Dynamic Energy Pulse -->
    <path d="M256 140 L286 230 L240 250 L270 330 L220 260 L260 240 Z" fill="url(#accentGrad)" />

    <!-- Connecting network nodes -->
    <circle cx="256" cy="380" r="14" fill="#38bdf8" />
    <circle cx="180" cy="350" r="10" fill="#60a5fa" opacity="0.9" />
    <circle cx="332" cy="350" r="10" fill="#4ade80" opacity="0.9" />
    <line x1="256" y1="340" x2="256" y2="380" stroke="#38bdf8" stroke-width="4" stroke-linecap="round"/>
    <line x1="220" y1="310" x2="180" y2="350" stroke="#60a5fa" stroke-width="3" stroke-linecap="round" stroke-dasharray="4 4"/>
    <line x1="290" y1="310" x2="332" y2="350" stroke="#4ade80" stroke-width="3" stroke-linecap="round" stroke-dasharray="4 4"/>
  </g>

  <!-- Brand Wordmark small indicator -->
  <text x="256" y="440" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="34" font-weight="800" fill="#ffffff" text-anchor="middle" letter-spacing="4">IMPULSANET</text>
</svg>`;

// Maskable SVG with safe-zone margin (15% padding on all sides)
const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGradMask" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e3a8a" />
      <stop offset="50%" stop-color="#2563eb" />
      <stop offset="100%" stop-color="#0284c7" />
    </linearGradient>
    <linearGradient id="accentGradMask" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8" />
      <stop offset="100%" stop-color="#4ade80" />
    </linearGradient>
    <linearGradient id="boltGradMask" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="100%" stop-color="#e0f2fe" />
    </linearGradient>
  </defs>

  <!-- Full-bleed background -->
  <rect width="512" height="512" fill="url(#bgGradMask)" />

  <!-- Inner scaled content inside central 75% safe area -->
  <g transform="translate(256, 256) scale(0.72) translate(-256, -256)">
    <!-- Upward Growth Arrow / Rocket Wings -->
    <path d="M256 80 C270 150 340 216 390 238 C350 250 316 272 294 316 L256 270 L218 316 C196 272 162 250 122 238 C172 216 242 150 256 80 Z" fill="url(#boltGradMask)" />

    <!-- Core Dynamic Energy Pulse -->
    <path d="M256 130 L290 230 L240 252 L274 340 L218 262 L260 242 Z" fill="url(#accentGradMask)" />

    <!-- Connecting network nodes -->
    <circle cx="256" cy="386" r="16" fill="#38bdf8" />
    <circle cx="170" cy="350" r="12" fill="#60a5fa" />
    <circle cx="342" cy="350" r="12" fill="#4ade80" />
    <line x1="256" y1="340" x2="256" y2="386" stroke="#38bdf8" stroke-width="4" stroke-linecap="round"/>
    <line x1="218" y1="316" x2="170" y2="350" stroke="#60a5fa" stroke-width="4" stroke-linecap="round"/>
    <line x1="294" y1="316" x2="342" y2="350" stroke="#4ade80" stroke-width="4" stroke-linecap="round"/>

    <text x="256" y="446" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="36" font-weight="800" fill="#ffffff" text-anchor="middle" letter-spacing="4">IMPULSANET</text>
  </g>
</svg>`;

async function main() {
  fs.writeFileSync(path.join(publicDir, 'icon.svg'), standardSvg);
  fs.writeFileSync(path.join(publicDir, 'favicon.svg'), standardSvg);

  const stdBuffer = Buffer.from(standardSvg);
  const maskBuffer = Buffer.from(maskableSvg);

  // Generate 192x192
  await sharp(stdBuffer).resize(192, 192).png().toFile(path.join(publicDir, 'pwa-192x192.png'));
  console.log('Generated pwa-192x192.png');

  // Generate 512x512
  await sharp(stdBuffer).resize(512, 512).png().toFile(path.join(publicDir, 'pwa-512x512.png'));
  console.log('Generated pwa-512x512.png');

  // Generate maskable 512x512
  await sharp(maskBuffer).resize(512, 512).png().toFile(path.join(publicDir, 'pwa-maskable-512x512.png'));
  console.log('Generated pwa-maskable-512x512.png');

  // Generate apple-touch-icon 180x180
  await sharp(stdBuffer).resize(180, 180).png().toFile(path.join(publicDir, 'apple-touch-icon.png'));
  console.log('Generated apple-touch-icon.png');

  // Generate favicon 32x32
  await sharp(stdBuffer).resize(32, 32).png().toFile(path.join(publicDir, 'favicon.png'));
  console.log('Generated favicon.png');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

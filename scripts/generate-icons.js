import sharp from 'sharp';
import fs from 'fs';

const svgLogo = `
<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Background Gradient -->
    <linearGradient id="bgGrad" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#090d16" />
      <stop offset="50%" stop-color="#0d1527" />
      <stop offset="100%" stop-color="#04070d" />
    </linearGradient>

    <!-- Glowing Teal Accent -->
    <linearGradient id="tealGrad" x1="80" y1="80" x2="432" y2="432" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#2dd4bf" />
      <stop offset="50%" stop-color="#14b8a6" />
      <stop offset="100%" stop-color="#0f766e" />
    </linearGradient>

    <!-- Laser Beam -->
    <linearGradient id="laserGrad" x1="60" y1="256" x2="452" y2="256" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#2dd4bf" stop-opacity="0" />
      <stop offset="25%" stop-color="#2dd4bf" stop-opacity="0.8" />
      <stop offset="50%" stop-color="#ffffff" stop-opacity="1" />
      <stop offset="75%" stop-color="#2dd4bf" stop-opacity="0.8" />
      <stop offset="100%" stop-color="#2dd4bf" stop-opacity="0" />
    </linearGradient>

    <!-- Document Gradient -->
    <linearGradient id="docGrad" x1="140" y1="110" x2="372" y2="402" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#1e293b" />
      <stop offset="100%" stop-color="#0f172a" />
    </linearGradient>

    <!-- Inner Glow Filter -->
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="10" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>

    <filter id="laserGlow" x="-20%" y="-100%" width="140%" height="300%">
      <feGaussianBlur stdDeviation="6" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <!-- Base Rounded Container -->
  <rect width="512" height="512" rx="112" fill="url(#bgGrad)" />
  <rect x="6" y="6" width="500" height="500" rx="106" stroke="url(#tealGrad)" stroke-width="4" stroke-opacity="0.3" fill="none" />

  <!-- Subtle grid pattern in background -->
  <g opacity="0.07" stroke="#2dd4bf" stroke-width="1.5">
    <line x1="128" y1="0" x2="128" y2="512" />
    <line x1="256" y1="0" x2="256" y2="512" />
    <line x1="384" y1="0" x2="384" y2="512" />
    <line x1="0" y1="128" x2="512" y2="128" />
    <line x1="0" y1="256" x2="512" y2="256" />
    <line x1="0" y1="384" x2="512" y2="384" />
  </g>

  <!-- Viewfinder Frame Corner Brackets -->
  <!-- Top Left -->
  <path d="M 96 156 L 96 116 Q 96 96 116 96 L 156 96" stroke="#2dd4bf" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" fill="none" filter="url(#glow)" />
  <!-- Top Right -->
  <path d="M 356 96 L 396 96 Q 416 96 416 116 L 416 156" stroke="#2dd4bf" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" fill="none" filter="url(#glow)" />
  <!-- Bottom Left -->
  <path d="M 96 356 L 96 396 Q 96 416 116 416 L 156 416" stroke="#2dd4bf" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" fill="none" filter="url(#glow)" />
  <!-- Bottom Right -->
  <path d="M 356 416 L 396 416 Q 416 416 416 396 L 416 356" stroke="#2dd4bf" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" fill="none" filter="url(#glow)" />

  <!-- Document Card / Book Page in Center -->
  <g filter="url(#glow)">
    <!-- Document Body -->
    <rect x="144" y="128" width="224" height="256" rx="24" fill="url(#docGrad)" stroke="#334155" stroke-width="3" />
    
    <!-- Document Fold Corner -->
    <path d="M 320 128 L 368 176 L 328 176 Q 320 176 320 168 Z" fill="#2dd4bf" opacity="0.8" />

    <!-- Text Lines Placeholder -->
    <rect x="174" y="196" width="110" height="12" rx="6" fill="#2dd4bf" opacity="0.9" />
    <rect x="174" y="222" width="164" height="10" rx="5" fill="#94a3b8" opacity="0.6" />
    <rect x="174" y="246" width="140" height="10" rx="5" fill="#94a3b8" opacity="0.6" />
    <rect x="174" y="270" width="154" height="10" rx="5" fill="#94a3b8" opacity="0.6" />
    <rect x="174" y="294" width="90" height="10" rx="5" fill="#94a3b8" opacity="0.6" />
  </g>

  <!-- Vibrant Laser Scan Beam -->
  <g filter="url(#laserGlow)">
    <line x1="72" y1="240" x2="440" y2="240" stroke="url(#laserGrad)" stroke-width="6" stroke-linecap="round" />
    <line x1="120" y1="240" x2="392" y2="240" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" />
    <ellipse cx="256" cy="240" rx="20" ry="4" fill="#ffffff" opacity="0.9" />
  </g>

  <!-- AI Sparkles Top Right of Document -->
  <g transform="translate(376, 120)" filter="url(#glow)">
    <path d="M 0 -18 Q 0 0 18 0 Q 0 0 0 18 Q 0 0 -18 0 Q 0 0 0 -18 Z" fill="#2dd4bf" />
    <circle cx="0" cy="0" r="4" fill="#ffffff" />
  </g>

  <g transform="translate(126, 366)" filter="url(#glow)">
    <path d="M 0 -10 Q 0 0 10 0 Q 0 0 0 10 Q 0 0 -10 0 Q 0 0 0 -10 Z" fill="#38bdf8" />
  </g>
</svg>
`;

async function generate() {
  const svgBuffer = Buffer.from(svgLogo);

  // 1. Generate 512x512 PNG
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile('public/icon.png');
  console.log('Created public/icon.png (512x512)');

  // 2. Generate 192x192 PNG for PWA
  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile('public/icon-192.png');
  console.log('Created public/icon-192.png (192x192)');

  // 3. Generate 512x512 JPEG
  await sharp(svgBuffer)
    .resize(512, 512)
    .jpeg({ quality: 95 })
    .toFile('public/icon.jpg');
  console.log('Created public/icon.jpg (512x512)');

  // 4. Generate favicon.png
  await sharp(svgBuffer)
    .resize(64, 64)
    .png()
    .toFile('public/favicon.png');
  console.log('Created public/favicon.png (64x64)');
}

generate().catch(console.error);

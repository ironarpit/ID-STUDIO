import fs from 'fs';
import path from 'path';
import { Resvg } from '@resvg/resvg-js';

// Construct the high-fidelity SVG matching the official BSM IQ logo
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <!-- Background Radial Gradient -->
    <radialGradient id="bgGrad" cx="50%" cy="40%" r="65%" fx="45%" fy="35%">
      <stop offset="0%" stop-color="#151d3b" />
      <stop offset="55%" stop-color="#0c1024" />
      <stop offset="100%" stop-color="#050711" />
    </radialGradient>

    <!-- White 'B' Drop Shadow -->
    <filter id="shadowB" x="-15%" y="-15%" width="130%" height="130%">
      <feDropShadow dx="0" dy="14" stdDeviation="22" flood-color="#000000" flood-opacity="0.45" />
    </filter>

    <!-- Ribbon Main Glow & Drop Shadow -->
    <filter id="ribbonShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="10" stdDeviation="16" flood-color="#000000" flood-opacity="0.55" />
    </filter>

    <!-- Inner Ribbon Shadow -->
    <filter id="innerFoldShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="2" dy="6" stdDeviation="8" flood-color="#090526" flood-opacity="0.75" />
    </filter>

    <!-- Ribbon Outer Gradient -->
    <linearGradient id="ribbonGrad" x1="15%" y1="30%" x2="85%" y2="80%">
      <stop offset="0%" stop-color="#6d5dfc" />
      <stop offset="35%" stop-color="#5544f8" />
      <stop offset="70%" stop-color="#4330ee" />
      <stop offset="100%" stop-color="#6049f5" />
    </linearGradient>

    <!-- Ribbon Underside / Deep Shade Gradient -->
    <linearGradient id="underGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#120d3a" />
      <stop offset="50%" stop-color="#1e1654" />
      <stop offset="100%" stop-color="#2a1f73" />
    </linearGradient>

    <!-- Ribbon Highlight Gradient -->
    <linearGradient id="ribbonHighlight" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#8c7eff" stop-opacity="0.7" />
      <stop offset="50%" stop-color="#6351ff" stop-opacity="0.2" />
      <stop offset="100%" stop-color="#3c2ae0" stop-opacity="0" />
    </linearGradient>

    <!-- Outer Squircle Clip -->
    <clipPath id="squircleClip">
      <rect x="32" y="32" width="960" height="960" rx="220" ry="220" />
    </clipPath>
  </defs>

  <!-- Background Base with Squircle Corners -->
  <rect x="32" y="32" width="960" height="960" rx="220" ry="220" fill="url(#bgGrad)" />
  <rect x="32" y="32" width="960" height="960" rx="220" ry="220" fill="none" stroke="#ffffff" stroke-opacity="0.07" stroke-width="3" />

  <!-- Letter B Shape with Filter Shadow -->
  <g filter="url(#shadowB)">
    <!-- Main Solid Letter B -->
    <path fill="#ffffff" fill-rule="evenodd" d="
      M 288 180
      L 580 180
      C 696 180, 786 248, 786 364
      C 786 428, 744 480, 672 506
      C 766 534, 826 600, 826 712
      C 826 836, 720 904, 576 904
      L 288 904
      Z

      M 416 304
      L 416 462
      L 560 462
      C 628 462, 664 430, 664 382
      C 664 336, 626 304, 560 304
      Z

      M 416 572
      L 416 780
      L 568 780
      C 644 780, 696 742, 696 678
      C 696 612, 642 572, 568 572
      Z
    " />
  </g>

  <!-- Ribbon Underside / Inner Loop Behind Main Swoop -->
  <g filter="url(#innerFoldShadow)">
    <path fill="url(#underGrad)" d="
      M 370 538
      C 420 540, 480 575, 532 630
      C 590 690, 650 740, 715 745
      C 780 750, 810 695, 826 630
      C 804 745, 730 812, 640 802
      C 572 794, 510 740, 442 662
      C 400 615, 360 578, 305 572
      C 260 568, 222 590, 212 642
      C 204 600, 228 546, 278 522
      C 305 510, 338 518, 370 538
      Z
    " />
  </g>

  <!-- The Dynamic Electric Blue-Violet Ribbon Loop (Front) -->
  <g filter="url(#ribbonShadow)">
    <!-- Main Sweeping Infinity Ribbon -->
    <path fill="url(#ribbonGrad)" d="
      M 282 460
      C 210 472, 172 538, 172 616
      C 172 710, 238 782, 332 782
      C 428 782, 496 702, 574 616
      C 640 542, 706 480, 786 512
      C 840 534, 868 596, 846 680
      C 840 644, 824 590, 778 574
      C 724 554, 664 602, 602 672
      C 522 764, 440 850, 318 850
      C 186 850, 102 754, 102 626
      C 102 494, 188 410, 304 410
      C 382 410, 448 450, 508 506
      C 450 470, 364 446, 282 460
      Z
    " />

    <!-- Ribbon Highlight Top Sheen -->
    <path fill="url(#ribbonHighlight)" opacity="0.85" d="
      M 304 410
      C 382 410, 448 450, 508 506
      C 450 470, 364 446, 282 460
      C 210 472, 172 538, 172 616
      C 172 540, 218 474, 304 410
      Z
    " />
  </g>
</svg>`;

async function renderIcons() {
  const sizes = [
    { name: 'icon-512.png', size: 512 },
    { name: 'icon-192.png', size: 192 },
    { name: 'icon.png', size: 512 },
    { name: 'apple-touch-icon.png', size: 180 },
    { name: 'favicon-32.png', size: 32 },
    { name: 'favicon-16.png', size: 16 },
  ];

  const publicDir = path.resolve('public');
  const distDir = path.resolve('dist');
  const assetsImgDir = path.resolve('src/assets/images');

  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
  if (!fs.existsSync(assetsImgDir)) fs.mkdirSync(assetsImgDir, { recursive: true });

  // Save base SVG
  fs.writeFileSync(path.join(publicDir, 'logo.svg'), svgContent);
  fs.writeFileSync(path.join(assetsImgDir, 'bsm-logo.svg'), svgContent);

  for (const item of sizes) {
    const resvg = new Resvg(svgContent, {
      fitTo: {
        mode: 'width',
        value: item.size,
      },
    });
    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();

    const targetPublic = path.join(publicDir, item.name);
    fs.writeFileSync(targetPublic, pngBuffer);
    console.log(`Generated public/${item.name} (${item.size}x${item.size})`);

    if (fs.existsSync(distDir)) {
      fs.writeFileSync(path.join(distDir, item.name), pngBuffer);
    }
  }

  // Generate 1024x1024 master icon in public and src/assets/images
  const masterResvg = new Resvg(svgContent, {
    fitTo: { mode: 'width', value: 1024 },
  });
  const masterBuffer = masterResvg.render().asPng();
  fs.writeFileSync(path.join(publicDir, 'icon-1024.png'), masterBuffer);
  fs.writeFileSync(path.join(assetsImgDir, 'bsm_logo_master.png'), masterBuffer);

  // Also replace old jpg references with the PNG
  fs.writeFileSync(path.join(publicDir, 'icon.jpg'), masterBuffer);
  fs.writeFileSync(path.join(assetsImgDir, 'bsm_stock_iq_logo_1786375084595.jpg'), masterBuffer);

  console.log('All icons generated successfully!');
}

renderIcons().catch(err => {
  console.error('Error rendering icons:', err);
  process.exit(1);
});

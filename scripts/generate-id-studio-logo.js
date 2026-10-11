import fs from 'fs';
import path from 'path';
import { Resvg } from '@resvg/resvg-js';

// =========================================================================
// ID STUDIO — OFFICIAL ICON SVG (Matching the supplied Brand Spec Sheet)
// Palette:
//   #0B1E6D - Deep Navy Blue
//   #2563EB - Royal Blue
//   #00D4FF - Electric Cyan
//   #7C3AED - Royal Violet
// =========================================================================

export const idStudioIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <!-- Background Squircle Navy Radial Gradient -->
    <radialGradient id="bgNavyGrad" cx="42%" cy="32%" r="75%" fx="38%" fy="25%">
      <stop offset="0%" stop-color="#0f267a" />
      <stop offset="35%" stop-color="#0b1e6d" />
      <stop offset="70%" stop-color="#071448" />
      <stop offset="100%" stop-color="#030822" />
    </radialGradient>

    <!-- Deep Drop Shadows -->
    <filter id="markShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="24" stdDeviation="28" flood-color="#000000" flood-opacity="0.65" />
    </filter>

    <filter id="swooshGlow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="12" result="blur" />
      <feColorMatrix type="matrix" values="
        0 0 0 0 0
        0 0.83 0 0 0
        0 0 1 0 0
        0 0 0 0.7 0" result="cyanGlow" />
      <feMerge>
        <feMergeNode in="cyanGlow" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>

    <filter id="barcodeInnerGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="#00d4ff" flood-opacity="0.8" />
    </filter>

    <!-- Gradients for Pillar 'I' -->
    <linearGradient id="pillarGrad" x1="20%" y1="0%" x2="80%" y2="100%">
      <stop offset="0%" stop-color="#2563eb" />
      <stop offset="30%" stop-color="#3b82f6" />
      <stop offset="70%" stop-color="#6366f1" />
      <stop offset="100%" stop-color="#7c3aed" />
    </linearGradient>

    <linearGradient id="pillarDark" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0f172a" stop-opacity="0.8" />
      <stop offset="50%" stop-color="#090d1a" stop-opacity="0.95" />
      <stop offset="100%" stop-color="#1e1b4b" stop-opacity="0.7" />
    </linearGradient>

    <!-- Gradients for 3D 'D' Glyph -->
    <linearGradient id="dOuterGrad" x1="10%" y1="15%" x2="90%" y2="85%">
      <stop offset="0%" stop-color="#00d4ff" />
      <stop offset="25%" stop-color="#38bdf8" />
      <stop offset="55%" stop-color="#2563eb" />
      <stop offset="85%" stop-color="#1d4ed8" />
      <stop offset="100%" stop-color="#7c3aed" />
    </linearGradient>

    <linearGradient id="dInnerShadow" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#06123e" />
      <stop offset="50%" stop-color="#0a1a56" />
      <stop offset="100%" stop-color="#14266e" />
    </linearGradient>

    <linearGradient id="dBevelGloss" x1="0%" y1="0%" x2="100%" y2="40%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.7" />
      <stop offset="35%" stop-color="#00d4ff" stop-opacity="0.5" />
      <stop offset="75%" stop-color="#2563eb" stop-opacity="0" />
    </linearGradient>

    <!-- Gradients for Orbit Swoosh Ribbon -->
    <linearGradient id="swooshGrad" x1="0%" y1="70%" x2="100%" y2="20%">
      <stop offset="0%" stop-color="#00d4ff" stop-opacity="0.1" />
      <stop offset="25%" stop-color="#00d4ff" stop-opacity="0.95" />
      <stop offset="65%" stop-color="#67e8f9" stop-opacity="1" />
      <stop offset="88%" stop-color="#38bdf8" stop-opacity="0.9" />
      <stop offset="100%" stop-color="#2563eb" stop-opacity="0.2" />
    </linearGradient>

    <linearGradient id="swooshTrailGrad" x1="0%" y1="80%" x2="100%" y2="10%">
      <stop offset="0%" stop-color="#00d4ff" stop-opacity="0" />
      <stop offset="30%" stop-color="#00d4ff" stop-opacity="0.4" />
      <stop offset="70%" stop-color="#a5f3fc" stop-opacity="0.75" />
      <stop offset="100%" stop-color="#38bdf8" stop-opacity="0" />
    </linearGradient>
  </defs>

  <!-- Squircle Base with Border -->
  <rect x="32" y="32" width="960" height="960" rx="220" ry="220" fill="url(#bgNavyGrad)" />
  <rect x="32" y="32" width="960" height="960" rx="220" ry="220" fill="none" stroke="#38bdf8" stroke-opacity="0.18" stroke-width="4" />

  <!-- Center Composite Group with Drop Shadow -->
  <g filter="url(#markShadow)">

    <!-- ======================================================== -->
    <!-- 1. ORBIT SWOOSH — BACK SEGMENT (behind I and D) -->
    <!-- ======================================================== -->
    <path fill="none" stroke="url(#swooshGrad)" stroke-width="28" stroke-linecap="round" opacity="0.4" d="
      M 190 670
      C 130 630, 85 530, 115 425
      C 145 320, 240 250, 360 250
    " />

    <!-- ======================================================== -->
    <!-- 2. PILLAR 'I' (With retail barcode scanner stripes) -->
    <!-- ======================================================== -->
    <g id="pillar-i">
      <!-- Outer Solid Pillar Body -->
      <rect x="180" y="210" width="160" height="604" rx="34" ry="34" fill="url(#pillarGrad)" />

      <!-- Inner Recessed Barcode Window -->
      <rect x="198" y="280" width="124" height="464" rx="16" ry="16" fill="url(#pillarDark)" />

      <!-- Barcode Stripes Group (Clean white-to-cyan illuminated lines) -->
      <g filter="url(#barcodeInnerGlow)">
        <!-- Stripe 1: Thin -->
        <rect x="216" y="306" width="9" height="412" rx="4" fill="#ffffff" />
        <!-- Stripe 2: Thick -->
        <rect x="234" y="306" width="18" height="412" rx="5" fill="#ffffff" />
        <!-- Stripe 3: Thin -->
        <rect x="260" y="306" width="8" height="412" rx="4" fill="#e0f2fe" />
        <!-- Stripe 4: Thick -->
        <rect x="276" y="306" width="22" height="412" rx="6" fill="#ffffff" />
        <!-- Stripe 5: Medium -->
        <rect x="306" y="306" width="10" height="412" rx="4" fill="#e0f2fe" />
      </g>

      <!-- Pillar Left Bevel Highlight -->
      <path d="M 184 244 C 184 225, 196 214, 214 214 L 230 214 L 230 810 L 214 810 C 196 810, 184 799, 184 780 Z" fill="#ffffff" opacity="0.25" />
    </g>

    <!-- ======================================================== -->
    <!-- 3. DIMENSIONAL 'D' GLYPH -->
    <!-- ======================================================== -->
    <g id="glyph-d">
      <!-- Deep Interior Pocket / Back Wall of D (Shadow) -->
      <path fill="url(#dInnerShadow)" d="
        M 380 210
        L 570 210
        C 730 210, 844 324, 844 512
        C 844 700, 730 814, 570 814
        L 380 814
        Z
      " />

      <!-- Inner Cutout / Hole with Beveled Interior -->
      <path fill="#040a21" d="
        M 450 340
        L 550 340
        C 650 340, 720 415, 720 512
        C 720 609, 650 684, 550 684
        L 450 684
        Z
      " />

      <!-- Main 3D Glossy 'D' Arch Structure -->
      <path fill="url(#dOuterGrad)" fill-rule="evenodd" d="
        M 350 210
        L 576 210
        C 744 210, 854 328, 854 512
        C 854 696, 744 814, 576 814
        L 350 814
        C 336 814, 326 804, 326 790
        L 326 234
        C 326 220, 336 210, 350 210
        Z

        M 464 344
        L 560 344
        C 652 344, 724 418, 724 512
        C 724 606, 652 680, 560 680
        L 464 680
        C 456 680, 450 674, 450 666
        L 450 358
        C 450 350, 456 344, 464 344
        Z
      " />

      <!-- Top & Outer Curve Gloss Highlight -->
      <path fill="url(#dBevelGloss)" opacity="0.9" d="
        M 350 210
        L 576 210
        C 744 210, 854 328, 854 512
        C 854 550, 842 590, 824 630
        C 804 520, 730 390, 600 330
        C 530 295, 440 280, 350 280
        Z
      " />

      <!-- Inner Hole Bevel Shadow -->
      <path fill="#020617" opacity="0.6" d="
        M 450 344
        L 560 344
        C 610 344, 656 368, 686 404
        C 654 374, 610 356, 560 356
        L 464 356
        L 464 680
        L 450 680
        Z
      " />
    </g>

    <!-- ======================================================== -->
    <!-- 4. DYNAMIC ORBIT SWOOSH RING (Front Wrapping Arc) -->
    <!-- ======================================================== -->
    <g filter="url(#swooshGlow)">
      <!-- Soft Outer Glow Trail -->
      <path fill="none" stroke="url(#swooshTrailGrad)" stroke-width="64" stroke-linecap="round" opacity="0.5" d="
        M 108 558
        C 142 458, 230 380, 370 410
        C 510 440, 650 370, 756 256
        C 810 198, 834 140, 820 110
      " />

      <!-- Main Brilliant Cyan Planetary Swoosh Ribbon -->
      <path fill="none" stroke="url(#swooshGrad)" stroke-width="42" stroke-linecap="round" d="
        M 112 552
        C 152 462, 238 392, 376 422
        C 516 452, 650 382, 754 270
        C 804 216, 830 162, 818 136
      " />

      <!-- Core Intense White-Cyan Sheen Ribbon -->
      <path fill="none" stroke="#ffffff" stroke-width="14" stroke-linecap="round" opacity="0.95" d="
        M 136 534
        C 176 458, 252 402, 382 430
        C 510 458, 642 392, 742 286
        C 778 248, 804 204, 808 174
      " />
    </g>
  </g>
</svg>`;

// =========================================================================
// FULL LOGO SVG (Icon + "ID STUDIO" + "Greer Genius")
// For headers, exports, and desktop branding
// =========================================================================
export const idStudioFullLogoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 400" width="1200" height="400">
  <defs>
    <!-- Same high-fidelity defs from icon -->
    <radialGradient id="fbgNavyGrad" cx="42%" cy="32%" r="75%" fx="38%" fy="25%">
      <stop offset="0%" stop-color="#0f267a" />
      <stop offset="35%" stop-color="#0b1e6d" />
      <stop offset="70%" stop-color="#071448" />
      <stop offset="100%" stop-color="#030822" />
    </radialGradient>

    <filter id="fmarkShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#000000" flood-opacity="0.45" />
    </filter>

    <filter id="fswooshGlow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="6" result="blur" />
      <feColorMatrix type="matrix" values="
        0 0 0 0 0
        0 0.83 0 0 0
        0 0 1 0 0
        0 0 0 0.7 0" result="cyanGlow" />
      <feMerge>
        <feMergeNode in="cyanGlow" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>

    <linearGradient id="fpillarGrad" x1="20%" y1="0%" x2="80%" y2="100%">
      <stop offset="0%" stop-color="#2563eb" />
      <stop offset="30%" stop-color="#3b82f6" />
      <stop offset="70%" stop-color="#6366f1" />
      <stop offset="100%" stop-color="#7c3aed" />
    </linearGradient>

    <linearGradient id="fpillarDark" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0f172a" stop-opacity="0.85" />
      <stop offset="100%" stop-color="#1e1b4b" stop-opacity="0.75" />
    </linearGradient>

    <linearGradient id="fdOuterGrad" x1="10%" y1="15%" x2="90%" y2="85%">
      <stop offset="0%" stop-color="#00d4ff" />
      <stop offset="30%" stop-color="#38bdf8" />
      <stop offset="60%" stop-color="#2563eb" />
      <stop offset="100%" stop-color="#7c3aed" />
    </linearGradient>

    <linearGradient id="fswooshGrad" x1="0%" y1="70%" x2="100%" y2="20%">
      <stop offset="0%" stop-color="#00d4ff" stop-opacity="0.1" />
      <stop offset="25%" stop-color="#00d4ff" stop-opacity="0.95" />
      <stop offset="65%" stop-color="#67e8f9" stop-opacity="1" />
      <stop offset="100%" stop-color="#2563eb" stop-opacity="0.3" />
    </linearGradient>

    <linearGradient id="textGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0b1e6d" />
      <stop offset="40%" stop-color="#1e40af" />
      <stop offset="100%" stop-color="#2563eb" />
    </linearGradient>
  </defs>

  <!-- Left Icon Mark scaled into 320x320 box -->
  <g transform="translate(30, 40) scale(0.3125)">
    <!-- Squircle Base -->
    <rect x="32" y="32" width="960" height="960" rx="220" ry="220" fill="url(#fbgNavyGrad)" />
    <rect x="32" y="32" width="960" height="960" rx="220" ry="220" fill="none" stroke="#38bdf8" stroke-opacity="0.25" stroke-width="4" />

    <g filter="url(#fmarkShadow)">
      <!-- Pillar I -->
      <rect x="180" y="210" width="160" height="604" rx="34" ry="34" fill="url(#fpillarGrad)" />
      <rect x="198" y="280" width="124" height="464" rx="16" ry="16" fill="url(#fpillarDark)" />
      <rect x="216" y="306" width="9" height="412" rx="4" fill="#ffffff" />
      <rect x="234" y="306" width="18" height="412" rx="5" fill="#ffffff" />
      <rect x="260" y="306" width="8" height="412" rx="4" fill="#e0f2fe" />
      <rect x="276" y="306" width="22" height="412" rx="6" fill="#ffffff" />
      <rect x="306" y="306" width="10" height="412" rx="4" fill="#e0f2fe" />

      <!-- D Glyph -->
      <path fill="url(#fdOuterGrad)" fill-rule="evenodd" d="
        M 350 210 L 576 210 C 744 210, 854 328, 854 512 C 854 696, 744 814, 576 814 L 350 814 C 336 814, 326 804, 326 790 L 326 234 C 326 220, 336 210, 350 210 Z
        M 464 344 L 560 344 C 652 344, 724 418, 724 512 C 724 606, 652 680, 560 680 L 464 680 C 456 680, 450 674, 450 666 L 450 358 C 450 350, 456 344, 464 344 Z
      " />

      <!-- Orbit Swoosh -->
      <g filter="url(#fswooshGlow)">
        <path fill="none" stroke="url(#fswooshGrad)" stroke-width="42" stroke-linecap="round" d="
          M 112 552 C 152 462, 238 392, 376 422 C 516 452, 650 382, 754 270 C 804 216, 830 162, 818 136
        " />
        <path fill="none" stroke="#ffffff" stroke-width="14" stroke-linecap="round" opacity="0.95" d="
          M 136 534 C 176 458, 252 402, 382 430 C 510 458, 642 392, 742 286 C 778 248, 804 204, 808 174
        " />
      </g>
    </g>
  </g>

  <!-- Typography Right Side: ID STUDIO & Greer Genius -->
  <text x="390" y="215" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-size="140" font-weight="900" letter-spacing="-0.03em" fill="url(#textGrad)">ID STUDIO</text>
  <text x="398" y="295" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-size="52" font-weight="500" letter-spacing="0.28em" fill="#0b1e6d">Greer Genius</text>
</svg>`;

async function renderAllAssets() {
  const publicDir = path.resolve('public');
  const distDir = path.resolve('dist');
  const assetsImgDir = path.resolve('src/assets/images');

  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
  if (!fs.existsSync(assetsImgDir)) fs.mkdirSync(assetsImgDir, { recursive: true });

  // 1. Write SVGs
  fs.writeFileSync(path.join(publicDir, 'logo.svg'), idStudioIconSvg);
  fs.writeFileSync(path.join(publicDir, 'id-studio-icon.svg'), idStudioIconSvg);
  fs.writeFileSync(path.join(publicDir, 'id-studio-logo.svg'), idStudioFullLogoSvg);

  fs.writeFileSync(path.join(assetsImgDir, 'id-studio-icon.svg'), idStudioIconSvg);
  fs.writeFileSync(path.join(assetsImgDir, 'id-studio-logo.svg'), idStudioFullLogoSvg);
  fs.writeFileSync(path.join(assetsImgDir, 'bsm-logo.svg'), idStudioIconSvg);

  // 2. Icon sizes for PWA, iOS, and Favicons
  const sizes = [
    { name: 'icon-1024.png', size: 1024 },
    { name: 'icon-512.png', size: 512 },
    { name: 'icon-192.png', size: 192 },
    { name: 'id-studio-icon-512.png', size: 512 },
    { name: 'id-studio-icon-192.png', size: 192 },
    { name: 'icon.png', size: 512 },
    { name: 'apple-touch-icon.png', size: 180 },
    { name: 'favicon-32.png', size: 32 },
    { name: 'favicon-16.png', size: 16 },
  ];

  for (const item of sizes) {
    const resvg = new Resvg(idStudioIconSvg, {
      fitTo: { mode: 'width', value: item.size },
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

  // 3. Render 512 & 1024 icon for src/assets/images
  const iconResvg = new Resvg(idStudioIconSvg, { fitTo: { mode: 'width', value: 512 } });
  const iconBuffer = iconResvg.render().asPng();
  fs.writeFileSync(path.join(assetsImgDir, 'id_studio_icon.png'), iconBuffer);

  const fullLogoResvg = new Resvg(idStudioFullLogoSvg, { fitTo: { mode: 'width', value: 1200 } });
  const fullLogoBuffer = fullLogoResvg.render().asPng();
  fs.writeFileSync(path.join(assetsImgDir, 'id_studio_logo.png'), fullLogoBuffer);

  // 4. Update legacy references so any fallback displays ID STUDIO
  fs.writeFileSync(path.join(assetsImgDir, 'bsm_logo_master.png'), iconBuffer);
  fs.writeFileSync(path.join(assetsImgDir, 'bsm_stock_iq_logo_1786375084595.jpg'), iconBuffer);
  fs.writeFileSync(path.join(publicDir, 'icon.jpg'), iconBuffer);

  if (fs.existsSync(distDir)) {
    fs.writeFileSync(path.join(distDir, 'logo.svg'), idStudioIconSvg);
    fs.writeFileSync(path.join(distDir, 'icon.jpg'), iconBuffer);
  }

  console.log('All ID STUDIO brand assets rendered successfully!');
}

renderAllAssets().catch(err => {
  console.error('Error rendering ID STUDIO icons:', err);
  process.exit(1);
});

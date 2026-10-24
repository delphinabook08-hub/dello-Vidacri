import sharp from 'sharp';
import fs from 'fs';

async function processOriginalPreferredLogo() {
  const originalLogo = 'src/assets/images/abookscan_app_logo_1786906598385.jpg';
  const fallbackLogo = 'src/assets/images/abookscan_app_logo_1786964955015.jpg';
  
  const sourceImage = fs.existsSync(originalLogo) ? originalLogo : fallbackLogo;
  console.log('Using logo source:', sourceImage);

  // 1. Generate 512x512 PNG
  await sharp(sourceImage)
    .resize(512, 512, { fit: 'cover' })
    .png({ quality: 100 })
    .toFile('public/icon.png');
  console.log('Updated public/icon.png (512x512)');

  // 2. Generate 192x192 PNG for PWA
  await sharp(sourceImage)
    .resize(192, 192, { fit: 'cover' })
    .png({ quality: 100 })
    .toFile('public/icon-192.png');
  console.log('Updated public/icon-192.png (192x192)');

  // 3. Generate Maskable 512x512 PNG with safe-zone border
  const inner512 = await sharp(sourceImage)
    .resize(410, 410, { fit: 'cover' })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 10, g: 10, b: 12, alpha: 1 }
    }
  })
    .composite([{ input: inner512, gravity: 'center' }])
    .png({ quality: 100 })
    .toFile('public/icon-maskable.png');
  console.log('Created public/icon-maskable.png (512x512 maskable)');

  // 4. Generate Maskable 192x192 PNG
  const inner192 = await sharp(sourceImage)
    .resize(154, 154, { fit: 'cover' })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: 192,
      height: 192,
      channels: 4,
      background: { r: 10, g: 10, b: 12, alpha: 1 }
    }
  })
    .composite([{ input: inner192, gravity: 'center' }])
    .png({ quality: 100 })
    .toFile('public/icon-maskable-192.png');
  console.log('Created public/icon-maskable-192.png (192x192 maskable)');

  // 5. Generate 512x512 JPEG
  await sharp(sourceImage)
    .resize(512, 512, { fit: 'cover' })
    .jpeg({ quality: 95 })
    .toFile('public/icon.jpg');
  console.log('Updated public/icon.jpg (512x512)');

  // 6. Generate favicon.png
  await sharp(sourceImage)
    .resize(64, 64, { fit: 'cover' })
    .png()
    .toFile('public/favicon.png');
  console.log('Updated public/favicon.png (64x64)');
}

processOriginalPreferredLogo().catch(console.error);

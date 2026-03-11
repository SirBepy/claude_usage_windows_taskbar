const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const svgPath = path.join(__dirname, 'src', 'icon.svg');
const srcPngPath = path.join(__dirname, 'src', 'icon.png');
const buildDir = path.join(__dirname, 'build');
const buildPngPath = path.join(buildDir, 'icon.png');

async function generateIcons() {
  try {
    if (!fs.existsSync(buildDir)) {
      fs.mkdirSync(buildDir);
    }

    const svgBuffer = fs.readFileSync(svgPath);

    // Generate 512x512 PNG for high quality App Icons
    await sharp(svgBuffer)
      .resize(512, 512)
      .png()
      .toFile(srcPngPath);
    
    console.log(`✅ Generated ${srcPngPath}`);

    // Create a copy for electron-builder (build/icon.png)
    fs.copyFileSync(srcPngPath, buildPngPath);
    
    console.log(`✅ Copied to ${buildPngPath}`);
    console.log('Icon generation successful!');
  } catch (error) {
    console.error('Error generating icons:', error);
    process.exit(1);
  }
}

generateIcons();

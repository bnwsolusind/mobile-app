const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const iu = require('@expo/image-utils');

async function main() {
  const projectRoot = process.cwd();
  const sourceIcon = path.join(projectRoot, 'assets', 'launcher_source.png');

  console.log('Generating Expo and Android icons from:', sourceIcon);

  // 1. Generate 1024x1024 assets/icon.png
  const icon1024 = await iu.generateImageAsync(
    { projectRoot, cacheType: 'icons' },
    { src: sourceIcon, width: 1024, height: 1024, resizeMode: 'contain', backgroundColor: 'transparent' }
  );
  fs.writeFileSync(path.join(projectRoot, 'assets', 'icon.png'), icon1024.source);
  console.log('Created assets/icon.png (1024x1024)');

  // 2. Generate adaptive foreground: safe zone 720px centered in 1024x1024
  const icon720 = await iu.generateImageAsync(
    { projectRoot, cacheType: 'icons' },
    { src: sourceIcon, width: 720, height: 720, resizeMode: 'contain', backgroundColor: 'transparent' }
  );
  const temp720Path = path.join(projectRoot, 'assets', 'temp_720.png');
  fs.writeFileSync(temp720Path, icon720.source);

  const foreground1024 = await iu.generateImageAsync(
    { projectRoot, cacheType: 'icons' },
    { src: temp720Path, width: 1024, height: 1024, resizeMode: 'contain', backgroundColor: 'transparent' }
  );
  fs.writeFileSync(path.join(projectRoot, 'assets', 'android-icon-foreground.png'), foreground1024.source);
  fs.unlinkSync(temp720Path);
  console.log('Created assets/android-icon-foreground.png (1024x1024 with safe zone)');

  // 3. Update assets/splash-icon.png
  fs.writeFileSync(path.join(projectRoot, 'assets', 'splash-icon.png'), icon1024.source);
  console.log('Created assets/splash-icon.png');

  // 4. Android Mipmap dimensions
  const mipmaps = [
    { dir: 'mipmap-mdpi', legacySize: 48, adaptiveSize: 108 },
    { dir: 'mipmap-hdpi', legacySize: 72, adaptiveSize: 162 },
    { dir: 'mipmap-xhdpi', legacySize: 96, adaptiveSize: 216 },
    { dir: 'mipmap-xxhdpi', legacySize: 144, adaptiveSize: 324 },
    { dir: 'mipmap-xxxhdpi', legacySize: 192, adaptiveSize: 432 },
  ];

  const resBase = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res');

  for (const m of mipmaps) {
    const targetDir = path.join(resBase, m.dir);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // A. ic_launcher.webp (legacy icon)
    const legImg = await iu.generateImageAsync(
      { projectRoot, cacheType: 'icons' },
      { src: sourceIcon, width: m.legacySize, height: m.legacySize, resizeMode: 'contain', backgroundColor: 'transparent' }
    );
    const legPng = path.join(targetDir, 'temp_leg.png');
    fs.writeFileSync(legPng, legImg.source);
    try {
      execSync(`/usr/local/bin/cwebp -q 95 "${legPng}" -o "${path.join(targetDir, 'ic_launcher.webp')}"`, { stdio: 'pipe' });
    } catch {
      fs.copyFileSync(legPng, path.join(targetDir, 'ic_launcher.png'));
    }
    fs.unlinkSync(legPng);

    // B. ic_launcher_round.webp (round icon)
    const roundImg = await iu.generateImageAsync(
      { projectRoot, cacheType: 'icons' },
      { src: sourceIcon, width: m.legacySize, height: m.legacySize, resizeMode: 'contain', backgroundColor: 'transparent', borderRadius: m.legacySize / 2 }
    );
    const roundPng = path.join(targetDir, 'temp_round.png');
    fs.writeFileSync(roundPng, roundImg.source);
    try {
      execSync(`/usr/local/bin/cwebp -q 95 "${roundPng}" -o "${path.join(targetDir, 'ic_launcher_round.webp')}"`, { stdio: 'pipe' });
    } catch {
      fs.copyFileSync(roundPng, path.join(targetDir, 'ic_launcher_round.png'));
    }
    fs.unlinkSync(roundPng);

    // C. ic_launcher_foreground.webp (adaptive icon)
    const innerSize = Math.round(m.adaptiveSize * 0.72);
    const innerImg = await iu.generateImageAsync(
      { projectRoot, cacheType: 'icons' },
      { src: sourceIcon, width: innerSize, height: innerSize, resizeMode: 'contain', backgroundColor: 'transparent' }
    );
    const innerPng = path.join(targetDir, 'temp_inner.png');
    fs.writeFileSync(innerPng, innerImg.source);

    const fgImg = await iu.generateImageAsync(
      { projectRoot, cacheType: 'icons' },
      { src: innerPng, width: m.adaptiveSize, height: m.adaptiveSize, resizeMode: 'contain', backgroundColor: 'transparent' }
    );
    fs.unlinkSync(innerPng);

    const fgPng = path.join(targetDir, 'temp_fg.png');
    fs.writeFileSync(fgPng, fgImg.source);
    try {
      execSync(`/usr/local/bin/cwebp -q 95 "${fgPng}" -o "${path.join(targetDir, 'ic_launcher_foreground.webp')}"`, { stdio: 'pipe' });
    } catch {
      fs.copyFileSync(fgPng, path.join(targetDir, 'ic_launcher_foreground.png'));
    }
    fs.unlinkSync(fgPng);

    console.log(`Updated ${m.dir} icons (legacy: ${m.legacySize}px, adaptive: ${m.adaptiveSize}px)`);
  }

  // 5. Update native splash logos in drawable-*
  const splashDrawables = [
    { dir: 'drawable-mdpi', size: 288 },
    { dir: 'drawable-hdpi', size: 432 },
    { dir: 'drawable-xhdpi', size: 576 },
    { dir: 'drawable-xxhdpi', size: 864 },
    { dir: 'drawable-xxxhdpi', size: 1152 },
  ];

  for (const s of splashDrawables) {
    const splashImg = await iu.generateImageAsync(
      { projectRoot, cacheType: 'icons' },
      { src: sourceIcon, width: s.size, height: s.size, resizeMode: 'contain', backgroundColor: 'transparent' }
    );
    const targetFile = path.join(resBase, s.dir, 'splashscreen_logo.png');
    fs.writeFileSync(targetFile, splashImg.source);
    console.log(`Updated ${s.dir}/splashscreen_logo.png (${s.size}px)`);
  }

  console.log('ALL ICONS AND SPLASH LOGOS SUCCESSFULLY GENERATED!');
}

main().catch(err => {
  console.error('Fatal error generating icons:', err);
  process.exit(1);
});

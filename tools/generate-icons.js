#!/usr/bin/env node
// generate-icons.js — generate iOS AppIcon.appiconset PNGs from SVG using sharp
// Usage: node tools/generate-icons.js

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const svgPath = path.join(root, 'assets', 'icon.svg');
const outAppIconSet = path.join(root, 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset');
const outAssets = path.join(root, 'assets', 'appicons');

const images = [
  // size (pt), idiom, scales
  {size: 20, idiom: 'iphone', scales: [2,3]},
  {size: 29, idiom: 'iphone', scales: [1,2,3]},
  {size: 40, idiom: 'iphone', scales: [2,3]},
  {size: 60, idiom: 'iphone', scales: [2,3]},
  {size: 20, idiom: 'ipad', scales: [1,2]},
  {size: 29, idiom: 'ipad', scales: [1,2]},
  {size: 40, idiom: 'ipad', scales: [1,2]},
  {size: 76, idiom: 'ipad', scales: [1,2]},
  {size: 83.5, idiom: 'ipad', scales: [2]},
  // App Store / marketing
  {size: 1024, idiom: 'ios-marketing', scales: [1]}
];

async function ensureDir(d){ if(!fs.existsSync(d)) fs.mkdirSync(d, {recursive:true}); }

(async ()=>{
  try{
    if(!fs.existsSync(svgPath)) throw new Error('SVG source not found: ' + svgPath);
    await ensureDir(outAppIconSet);
    await ensureDir(outAssets);
    const svgBuf = fs.readFileSync(svgPath);

    const contents = { images: [], info: { version: 1, author: "xcode" } };

    for(const img of images){
      for(const scale of img.scales){
        const pxSize = Math.round(img.size * scale);
        // preserve extension; only replace '.' in the size portion (83.5 -> 83-dot-5)
        const sizeStr = String(img.size).replace('.', '-dot-');
        const filename = `icon-${sizeStr}@${scale}x.png`;
        const outPath = path.join(outAppIconSet, filename);
        const outAssetsPath = path.join(outAssets, filename);
        // rasterize with sharp: specify width & height
        await sharp(svgBuf)
          .resize(pxSize, pxSize, { fit: 'cover' })
          .png({quality: 100})
          .toFile(outPath);
        // also write to assets folder for manual inspection
        await sharp(svgBuf).resize(pxSize, pxSize, { fit: 'cover' }).png({quality:100}).toFile(outAssetsPath);

        contents.images.push({
          idiom: img.idiom,
          size: `${img.size}x${img.size}`,
          scale: `${scale}x`,
          filename: filename
        });
        console.log(`Wrote ${outPath} (${pxSize}x${pxSize})`);
      }
    }

    // ensure App Store icon entry (1024x1024) present — already covered above

    // write Contents.json
    const contentsPath = path.join(outAppIconSet, 'Contents.json');
    fs.writeFileSync(contentsPath, JSON.stringify(contents, null, 2));
    console.log('Wrote Contents.json to', contentsPath);

    // additionally generate web-friendly icons (192 & 512) for PWA manifest and copy into www/icons
    try{
      const webDir = path.join(root, 'www', 'icons');
      await ensureDir(webDir);
      const webSizes = [192, 512];
      for(const s of webSizes){ const filename = `icon-${s}.png`; const outPath = path.join(outAssets, filename); const outWebPath = path.join(webDir, filename); await sharp(svgBuf).resize(s, s, {fit:'cover'}).png({quality:100}).toFile(outPath); await sharp(svgBuf).resize(s,s,{fit:'cover'}).png({quality:100}).toFile(outWebPath); console.log(`Wrote web icon ${outWebPath} (${s}x${s})`); contents.images.push({idiom:'web', size:`${s}x${s}`, scale:'1x', filename}); }
    }catch(e){ console.warn('web icon generation failed', e); }

    console.log('Done. You can now open Xcode and verify AppIcon.appiconset contains the generated PNGs (or drag them into slots).');
  }catch(err){ console.error('generate-icons failed:', err); process.exit(1); }
})();

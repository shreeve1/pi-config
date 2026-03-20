#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function parseArg(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index === process.argv.length - 1) return null;
  return process.argv[index + 1];
}

function readVariants(mockupsDir) {
  const variantRoot = path.resolve(mockupsDir);
  if (!fs.existsSync(variantRoot)) return [];

  return fs.readdirSync(variantRoot)
    .map((name) => path.join(variantRoot, name))
    .filter((fullPath) => fs.statSync(fullPath).isDirectory())
    .map((variantDir) => {
      const metadataPath = path.join(variantDir, 'metadata.json');
      const htmlPath = path.join(variantDir, 'mockup.html');
      if (!fs.existsSync(metadataPath) || !fs.existsSync(htmlPath)) return null;
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      return {
        variantDir,
        htmlPath,
        metadata
      };
    })
    .filter(Boolean);
}

function main() {
  const mockupsDir = parseArg('--mockups-dir') || '.';
  const outputDir = path.resolve(parseArg('--output') || '.');
  fs.mkdirSync(outputDir, { recursive: true });

  const variants = readVariants(mockupsDir);
  if (!variants.length) {
    console.error(`No variants found in ${mockupsDir}`);
    process.exit(1);
  }

  const galleryVariants = [];
  for (const variant of variants) {
    const fileName = `${variant.metadata.name || path.basename(variant.variantDir)}.html`;
    const destination = path.join(outputDir, fileName);
    fs.copyFileSync(variant.htmlPath, destination);

    galleryVariants.push({
      name: variant.metadata.name,
      agent: variant.metadata.agent,
      description: variant.metadata.description || '',
      previewUrl: fileName,
      sourceUrl: fileName,
      theme: variant.metadata.theme || '',
      timestamp: variant.metadata.timestamp || new Date().toISOString()
    });
  }

  fs.writeFileSync(
    path.join(outputDir, 'gallery-data.json'),
    JSON.stringify({ generated: new Date().toISOString(), variants: galleryVariants }, null, 2)
  );

  const templatePath = path.join(__dirname, 'gallery-template.html');
  fs.copyFileSync(templatePath, path.join(outputDir, 'gallery.html'));
  console.log(JSON.stringify({ outputDir, gallery: path.join(outputDir, 'gallery.html'), variants: galleryVariants.length }, null, 2));
}

main();

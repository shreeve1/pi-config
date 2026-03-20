#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

function parseArg(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index === process.argv.length - 1) return null;
  return process.argv[index + 1];
}

function slugify(value) {
  return String(value || 'page')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'page';
}

async function run() {
  const url = parseArg('--url');
  const outputDir = parseArg('--output-dir') || path.resolve(process.cwd(), 'artifacts/ui-review');
  const sessionName = slugify(parseArg('--session-name') || 'page');
  const viewportsRaw = parseArg('--viewports-json') || '[]';
  const interactionsRaw = parseArg('--interactions-json') || '[]';
  const timeout = Number(parseArg('--timeout') || 30000);

  if (!url) {
    console.error('Missing required argument: --url');
    process.exit(1);
  }

  const viewports = JSON.parse(viewportsRaw);
  const interactions = JSON.parse(interactionsRaw);
  fs.mkdirSync(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const results = [];

  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height }
      });

      const page = await context.newPage();
      await page.goto(url, { waitUntil: 'networkidle', timeout });

      for (const step of interactions) {
        if (!step || !step.type || !step.selector) continue;
        const locator = page.locator(step.selector).first();
        await locator.waitFor({ state: 'visible', timeout });

        if (step.type === 'click') {
          await locator.click();
        } else if (step.type === 'hover') {
          await locator.hover();
        } else if (step.type === 'fill') {
          await locator.fill(step.value || '');
        } else if (step.type === 'submit') {
          await locator.evaluate((el) => {
            if (el instanceof HTMLFormElement) el.requestSubmit();
            else el.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
          });
        }
      }

      await page.waitForLoadState('networkidle', { timeout }).catch(() => {});
      const fileName = `${sessionName}-${slugify(viewport.name)}.png`;
      const filePath = path.join(outputDir, fileName);
      await page.screenshot({ path: filePath, fullPage: true });

      results.push({
        viewport: viewport.name,
        width: viewport.width,
        height: viewport.height,
        path: filePath,
        title: await page.title(),
        url: page.url()
      });

      await context.close();
    }
  } finally {
    await browser.close();
  }

  const metadata = {
    url,
    sessionName,
    outputDir,
    interactions,
    viewports,
    screenshots: results,
    generatedAt: new Date().toISOString()
  };

  const metadataPath = path.join(outputDir, `${sessionName}-metadata.json`);
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  process.stdout.write(JSON.stringify(metadata, null, 2));
}

run().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});

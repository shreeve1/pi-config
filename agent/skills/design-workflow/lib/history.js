const fs = require('fs');
const path = require('path');

const DESIGN_DIR = path.join(process.env.HOME, 'artifacts', 'design');

function ensureDesignDir() {
  if (!fs.existsSync(DESIGN_DIR)) {
    fs.mkdirSync(DESIGN_DIR, { recursive: true });
  }
}

function createSession(componentName) {
  ensureDesignDir();
  const now = new Date();
  const date = now.toISOString().split('T')[0];

  let sessionNum = 1;
  const existingSessions = fs.readdirSync(DESIGN_DIR).filter((name) => name.startsWith(date));
  if (existingSessions.length) {
    const nums = existingSessions
      .map((name) => Number((name.match(/session-(\d+)$/) || [])[1] || 0))
      .filter(Boolean);
    if (nums.length) sessionNum = Math.max(...nums) + 1;
  }

  const sessionDir = path.join(DESIGN_DIR, `${date}-session-${sessionNum}`);
  fs.mkdirSync(path.join(sessionDir, 'context'), { recursive: true });
  fs.mkdirSync(path.join(sessionDir, 'variants'), { recursive: true });
  fs.mkdirSync(path.join(sessionDir, 'selected'), { recursive: true });
  fs.mkdirSync(path.join(sessionDir, 'implementation'), { recursive: true });

  fs.writeFileSync(
    path.join(sessionDir, 'session.json'),
    JSON.stringify({ component: componentName, timestamp: now.toISOString(), status: 'active' }, null, 2)
  );

  return sessionDir;
}

function saveVariant(sessionPath, variantData) {
  const variantDir = path.join(sessionPath, 'variants', variantData.name);
  fs.mkdirSync(variantDir, { recursive: true });

  if (variantData.html) fs.writeFileSync(path.join(variantDir, 'mockup.html'), variantData.html);
  if (variantData.css) fs.writeFileSync(path.join(variantDir, 'mockup.css'), variantData.css);

  const metadata = {
    name: variantData.name,
    description: variantData.description || '',
    theme: variantData.theme || null,
    agent: variantData.agent || 'design-workflow',
    timestamp: new Date().toISOString(),
    rationale: variantData.rationale || ''
  };

  fs.writeFileSync(path.join(variantDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
  return variantDir;
}

function saveSelection(sessionPath, variantId, notes = '') {
  fs.writeFileSync(
    path.join(sessionPath, 'selected', 'selection.json'),
    JSON.stringify({ selectedVariant: variantId, notes, timestamp: new Date().toISOString() }, null, 2)
  );
}

function saveDiff(sessionPath, mockupPath, implementedPath) {
  const diff = {
    mockup: mockupPath,
    implemented: implementedPath,
    timestamp: new Date().toISOString()
  };
  fs.writeFileSync(
    path.join(sessionPath, 'implementation', 'diff.json'),
    JSON.stringify(diff, null, 2)
  );
}

function loadSession(sessionPath) {
  if (!fs.existsSync(sessionPath)) return null;
  const sessionMetadata = JSON.parse(fs.readFileSync(path.join(sessionPath, 'session.json'), 'utf8'));
  const variants = [];
  const variantsDir = path.join(sessionPath, 'variants');
  if (fs.existsSync(variantsDir)) {
    for (const name of fs.readdirSync(variantsDir)) {
      const metadataPath = path.join(variantsDir, name, 'metadata.json');
      if (fs.existsSync(metadataPath)) {
        variants.push({ name, metadata: JSON.parse(fs.readFileSync(metadataPath, 'utf8')) });
      }
    }
  }
  return { ...sessionMetadata, path: sessionPath, variants };
}

function listSessions() {
  ensureDesignDir();
  return fs.readdirSync(DESIGN_DIR)
    .filter((name) => /^\d{4}-\d{2}-\d{2}-session-\d+$/.test(name))
    .sort()
    .reverse()
    .map((name) => ({ name, path: path.join(DESIGN_DIR, name) }));
}

module.exports = { DESIGN_DIR, ensureDesignDir, createSession, saveVariant, saveSelection, saveDiff, loadSession, listSessions };

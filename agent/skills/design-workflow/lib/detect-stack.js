const fs = require('fs');
const path = require('path');

async function detectStack(projectPath) {
  try {
    const packageJsonPath = path.join(projectPath, 'package.json');

    if (!fs.existsSync(packageJsonPath)) {
      return {
        framework: 'unknown',
        componentLib: 'vanilla',
        cssFramework: 'vanilla',
        detectedFiles: []
      };
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const deps = {
      ...(packageJson.dependencies || {}),
      ...(packageJson.devDependencies || {})
    };

    let componentLib = 'vanilla';
    let cssFramework = 'vanilla';
    let framework = 'vanilla';
    const detectedFiles = [];

    if (deps['@shadcn/ui'] || fs.existsSync(path.join(projectPath, 'components.json'))) {
      componentLib = 'shadcn';
      framework = 'react';
      detectedFiles.push('components.json');
    } else if (deps['@mui/material']) {
      componentLib = 'mui';
      framework = 'react';
    } else if (deps['@chakra-ui/react']) {
      componentLib = 'chakra';
      framework = 'react';
    } else if (deps['antd']) {
      componentLib = 'ant';
      framework = 'react';
    }

    if (deps['tailwindcss']) {
      cssFramework = 'tailwind';
      detectedFiles.push('tailwind.config.*');
    } else if (deps['bootstrap']) {
      cssFramework = 'bootstrap';
    } else if (deps['styled-components']) {
      cssFramework = 'styled-components';
    }

    if (deps['next'] || deps['react']) framework = 'react';
    else if (deps['vue']) framework = 'vue';
    else if (deps['svelte']) framework = 'svelte';

    return {
      framework,
      componentLib,
      cssFramework,
      detectedFiles,
      rawDeps: Object.keys(deps)
    };
  } catch (error) {
    return {
      framework: 'unknown',
      componentLib: 'vanilla',
      cssFramework: 'vanilla',
      detectedFiles: [],
      error: error.message
    };
  }
}

module.exports = { detectStack };

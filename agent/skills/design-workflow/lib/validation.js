const fs = require('fs');
const path = require('path');

function captureImplementedUI(url) {
  return {
    targetUrl: url,
    status: 'pending',
    snapshotPath: null,
    screenshotPath: null,
    timestamp: new Date().toISOString()
  };
}

function compareMockupToImplementation(mockupSnapshot, implementedSnapshot) {
  return {
    mockupPresent: !!mockupSnapshot,
    implementationPresent: !!implementedSnapshot,
    differences: [],
    structureMatches: true,
    stylingMatches: true,
    accessibilityMatches: true
  };
}

function prepareAccessibilityAudit(htmlContent, cssContent) {
  return {
    htmlContent,
    cssContent,
    timestamp: new Date().toISOString(),
    checks: ['contrast-ratio', 'use-of-color', 'link-purpose']
  };
}

function assessSeverity(issues = {}) {
  const {
    accessibilityViolations = [],
    layoutIssues = [],
    interactionIssues = [],
    styleIssues = [],
    other = []
  } = issues;

  let severity = 'none';
  let recommendation = 'ship';

  if (accessibilityViolations.length) {
    severity = 'critical';
    recommendation = 'fix-immediately';
  } else if (layoutIssues.length || interactionIssues.length) {
    severity = 'major';
    recommendation = 'revise';
  } else if (styleIssues.length || other.length) {
    severity = 'minor';
    recommendation = 'refine';
  }

  return {
    severity,
    recommendation,
    details: {
      accessibilityViolations,
      layoutIssues,
      interactionIssues,
      styleIssues,
      other
    }
  };
}

function formatValidationReport(validation, severity) {
  const lines = ['## Implementation Validation Report', ''];
  lines.push(`**Status**: ${severity.severity.toUpperCase()}`);
  lines.push(`**Recommendation**: ${severity.recommendation}`);
  lines.push('');

  const details = severity.details;
  if (details.accessibilityViolations.length) {
    lines.push('### Critical Issues');
    for (const item of details.accessibilityViolations) lines.push(`- ${item}`);
    lines.push('');
  }
  if (details.layoutIssues.length || details.interactionIssues.length) {
    lines.push('### Major Issues');
    for (const item of details.layoutIssues) lines.push(`- Layout: ${item}`);
    for (const item of details.interactionIssues) lines.push(`- Interaction: ${item}`);
    lines.push('');
  }
  if (details.styleIssues.length || details.other.length) {
    lines.push('### Minor Issues');
    for (const item of details.styleIssues) lines.push(`- ${item}`);
    for (const item of details.other) lines.push(`- ${item}`);
    lines.push('');
  }
  if (severity.severity === 'none') lines.push('No blocking issues found.');
  return lines.join('\n');
}

function buildUserTestingQuestions() {
  return {
    question: 'Please interact with the implemented component. How does it look and feel?',
    options: [
      { label: 'Looks great - ship it!', value: 'approved' },
      { label: 'Minor tweaks needed', value: 'minor-fixes' },
      { label: 'Major issues - need new mockups', value: 'regenerate' },
      { label: 'Something specific to change', value: 'custom-feedback' }
    ]
  };
}

function buildIterationOptions(severity) {
  if (severity.severity === 'critical') {
    return { allowedActions: ['fix-immediate'], message: 'Critical accessibility issues must be fixed before proceeding.' };
  }
  const actions = ['refine-current', 'regenerate-variants', 'approve-as-is'];
  if (severity.severity === 'none') actions.unshift('ship');
  return { allowedActions: actions, message: 'Choose next step based on review.' };
}

function saveValidationResults(sessionPath, results) {
  const filePath = path.join(sessionPath, 'implementation', 'validation-results.json');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify({ ...results, timestamp: new Date().toISOString() }, null, 2));
  return filePath;
}

module.exports = {
  captureImplementedUI,
  compareMockupToImplementation,
  prepareAccessibilityAudit,
  assessSeverity,
  formatValidationReport,
  buildUserTestingQuestions,
  buildIterationOptions,
  saveValidationResults
};

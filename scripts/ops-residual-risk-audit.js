#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const backendRoot = path.resolve(__dirname, '..');
const reportDir = path.resolve(backendRoot, 'temp');

function nowIso() {
  return new Date().toISOString();
}

function nowFileSafe() {
  return nowIso().replace(/[:.]/g, '-');
}

function latestFile(prefix) {
  if (!fs.existsSync(reportDir)) return null;
  const files = fs.readdirSync(reportDir).filter((name) => name.startsWith(prefix) && name.endsWith('.md'));
  if (!files.length) return null;

  files.sort((a, b) => {
    const aStat = fs.statSync(path.resolve(reportDir, a)).mtimeMs;
    const bStat = fs.statSync(path.resolve(reportDir, b)).mtimeMs;
    return bStat - aStat;
  });

  return path.resolve(reportDir, files[0]);
}

function parseReportResult(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf8');
  const resultMatch =
    content.match(/- result:\s*(PASS|FAIL)/i) ||
    content.match(/Final result:\s*(PASS|FAIL)/i);
  return {
    filePath,
    result: resultMatch ? resultMatch[1].toUpperCase() : 'UNKNOWN'
  };
}

function checkPath(relPath) {
  return fs.existsSync(path.resolve(backendRoot, relPath));
}

function buildFindings() {
  const findings = [];

  const readiness = parseReportResult(latestFile('ops-readiness-'));
  const backendGate = parseReportResult(latestFile('ops-gate-backend-'));
  const frontendGate = parseReportResult(latestFile('ops-gate-frontend-'));
  const contingency = parseReportResult(latestFile('ops-contingency-drill-'));
  const uxAudit = parseReportResult(latestFile('ops-ux-audit-'));

  const essentials = [
    { rel: '.github/workflows/ci-production-gate.yml', label: 'CI production gate workflow' },
    { rel: 'scripts/README_ROBOT_MONITOR.md', label: 'Ops monitor guide' },
    { rel: 'scripts/RUNBOOK_CONTINGENCIA_PRODUCCION.md', label: 'Production contingency runbook' },
    { rel: 'scripts/ops-readiness-gate.js', label: 'Consolidated readiness gate script' }
  ];

  for (const item of essentials) {
    if (!checkPath(item.rel)) {
      findings.push({ severity: 'HIGH', type: 'missing-asset', message: `${item.label} missing (${item.rel})` });
    }
  }

  if (!readiness || readiness.result !== 'PASS') {
    findings.push({ severity: 'HIGH', type: 'readiness', message: 'Latest consolidated readiness is not PASS' });
  }
  if (!backendGate || backendGate.result !== 'PASS') {
    findings.push({ severity: 'HIGH', type: 'backend-gate', message: 'Latest backend gate is not PASS' });
  }
  if (!frontendGate || frontendGate.result !== 'PASS') {
    findings.push({ severity: 'HIGH', type: 'frontend-gate', message: 'Latest frontend gate is not PASS' });
  }

  if (!contingency) {
    findings.push({ severity: 'MEDIUM', type: 'contingency', message: 'No contingency drill report found' });
  } else if (contingency.result !== 'PASS') {
    findings.push({ severity: 'HIGH', type: 'contingency', message: 'Latest contingency drill is not PASS' });
  }

  if (!uxAudit) {
    findings.push({ severity: 'MEDIUM', type: 'ux-audit', message: 'No UX consistency audit report found' });
  }

  return { findings, readiness, backendGate, frontendGate, contingency, uxAudit };
}

function main() {
  const failOnHigh = String(process.env.RISK_AUDIT_FAIL_ON_HIGH || '1') === '1';
  const { findings, readiness, backendGate, frontendGate, contingency, uxAudit } = buildFindings();

  const highCount = findings.filter((f) => f.severity === 'HIGH').length;
  const mediumCount = findings.filter((f) => f.severity === 'MEDIUM').length;

  const lines = [];
  lines.push('# Residual Risk Audit Report');
  lines.push('');
  lines.push(`- generatedAt: ${nowIso()}`);
  lines.push(`- highFindings: ${highCount}`);
  lines.push(`- mediumFindings: ${mediumCount}`);
  lines.push(`- totalFindings: ${findings.length}`);
  lines.push(`- result: ${highCount === 0 ? 'PASS' : 'FAIL'}`);
  lines.push('');
  lines.push('## Evidence');
  lines.push(`- readiness: ${readiness ? `${readiness.result} (${readiness.filePath})` : 'MISSING'}`);
  lines.push(`- backendGate: ${backendGate ? `${backendGate.result} (${backendGate.filePath})` : 'MISSING'}`);
  lines.push(`- frontendGate: ${frontendGate ? `${frontendGate.result} (${frontendGate.filePath})` : 'MISSING'}`);
  lines.push(`- contingency: ${contingency ? `${contingency.result} (${contingency.filePath})` : 'MISSING'}`);
  lines.push(`- uxAudit: ${uxAudit ? `${uxAudit.result} (${uxAudit.filePath})` : 'MISSING'}`);
  lines.push('');
  lines.push('## Findings');

  if (!findings.length) {
    lines.push('- [OK] No residual risks detected by this audit profile');
  } else {
    for (const finding of findings) {
      lines.push(`- [${finding.severity}] ${finding.type}: ${finding.message}`);
    }
  }

  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const reportPath = path.resolve(reportDir, `ops-residual-risk-${nowFileSafe()}.md`);
  fs.writeFileSync(reportPath, `${lines.join('\n')}\n`, 'utf8');

  const shouldFail = failOnHigh && highCount > 0;
  console.log(`[RISK-AUDIT] Report: ${reportPath}`);
  console.log(`[RISK-AUDIT] Final result: ${shouldFail ? 'FAIL' : 'PASS'}`);

  process.exit(shouldFail ? 1 : 0);
}

main();

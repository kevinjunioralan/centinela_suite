#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const backendRoot = path.resolve(__dirname, '..');
const frontendRoot = path.resolve(backendRoot, '..', 'frontend');
const reportDir = path.resolve(backendRoot, 'temp');

function nowIso() {
  return new Date().toISOString();
}

function nowFileSafe() {
  return nowIso().replace(/[:.]/g, '-');
}

function runStep(title, command, args, cwd, env = {}) {
  const startedAt = Date.now();
  console.log(`\n[HARDENING][START] ${title}`);
  console.log(`[HARDENING][CMD] ${command} ${args.join(' ')}`);

  const result = spawnSync(command, args, {
    cwd,
    shell: true,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    maxBuffer: 20 * 1024 * 1024
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  const elapsedMs = Date.now() - startedAt;
  const ok = result.status === 0;

  console.log(`[HARDENING][END] ${title} -> ${ok ? 'OK' : 'FAIL'} (${elapsedMs}ms)`);

  return {
    title,
    command: `${command} ${args.join(' ')}`,
    ok,
    exitCode: result.status,
    elapsedMs,
    output: `${result.stdout || ''}\n${result.stderr || ''}`
  };
}

function extractReportPath(output) {
  const match = output.match(/Report:\s+(.+\.md)/i);
  return match ? match[1].trim() : null;
}

function main() {
  const steps = [];
  const strictContingencyDefault =
    process.env.CI === '1' || process.platform === 'linux' ? '1' : '0';

  steps.push(runStep(
    'Consolidated readiness gate',
    'npm',
    ['run', 'ops:production:readiness'],
    backendRoot,
    { CI: '1' }
  ));
  steps[steps.length - 1].reportPath = extractReportPath(steps[steps.length - 1].output);

  steps.push(runStep(
    'Frontend UX consistency audit',
    'node',
    ['scripts/ux-consistency-audit.js'],
    frontendRoot,
    { UX_AUDIT_FAIL_ON_HIGH: process.env.UX_AUDIT_FAIL_ON_HIGH || '0' }
  ));
  steps[steps.length - 1].reportPath = extractReportPath(steps[steps.length - 1].output);

  steps.push(runStep(
    'Contingency drill automation',
    'node',
    ['scripts/ops-contingency-drill.js'],
    backendRoot,
    {
      CONTINGENCY_FAIL_ON_SKIPPED:
        process.env.CONTINGENCY_FAIL_ON_SKIPPED || strictContingencyDefault
    }
  ));
  steps[steps.length - 1].reportPath = extractReportPath(steps[steps.length - 1].output);

  steps.push(runStep(
    'Residual risk audit',
    'node',
    ['scripts/ops-residual-risk-audit.js'],
    backendRoot,
    {
      RISK_AUDIT_FAIL_ON_HIGH: process.env.RISK_AUDIT_FAIL_ON_HIGH || '1'
    }
  ));
  steps[steps.length - 1].reportPath = extractReportPath(steps[steps.length - 1].output);

  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const total = steps.length;
  const passed = steps.filter((step) => step.ok).length;
  const failed = total - passed;

  const lines = [];
  lines.push('# Hardening Block Report');
  lines.push('');
  lines.push(`- generatedAt: ${nowIso()}`);
  lines.push(`- totalSteps: ${total}`);
  lines.push(`- passed: ${passed}`);
  lines.push(`- failed: ${failed}`);
  lines.push(`- result: ${failed === 0 ? 'PASS' : 'FAIL'}`);
  lines.push('');
  lines.push('## Steps');

  for (const step of steps) {
    lines.push(`- [${step.ok ? 'OK' : 'FAIL'}] ${step.title}`);
    lines.push(`  command: ${step.command}`);
    lines.push(`  exitCode: ${step.exitCode}`);
    lines.push(`  elapsedMs: ${step.elapsedMs}`);
    if (step.reportPath) {
      lines.push(`  report: ${step.reportPath}`);
    }
  }

  const reportPath = path.resolve(reportDir, `ops-hardening-block-${nowFileSafe()}.md`);
  fs.writeFileSync(reportPath, `${lines.join('\n')}\n`, 'utf8');

  console.log(`\n[HARDENING] Report: ${reportPath}`);
  console.log(`[HARDENING] Final result: ${failed === 0 ? 'PASS' : 'FAIL'}`);

  process.exit(failed === 0 ? 0 : 1);
}

main();

#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const backendRoot = path.resolve(__dirname, '..');
const scriptsDir = path.resolve(backendRoot, 'scripts');
const reportDir = path.resolve(backendRoot, 'temp');

function nowIso() {
  return new Date().toISOString();
}

function nowFileSafe() {
  return nowIso().replace(/[:.]/g, '-');
}

function hasBash() {
  const probe = spawnSync('bash', ['--version'], { shell: true, encoding: 'utf8' });
  return probe.status === 0;
}

function runBashStep(title, bashCommand, expectedExitCode) {
  const startedAt = Date.now();
  console.log(`\n[CONTINGENCY][START] ${title}`);

  const result = spawnSync('bash', ['-lc', bashCommand], {
    cwd: scriptsDir,
    shell: true,
    encoding: 'utf8',
    env: { ...process.env, CI: '1' },
    maxBuffer: 10 * 1024 * 1024
  });

  const elapsedMs = Date.now() - startedAt;
  const exitCode = typeof result.status === 'number' ? result.status : 1;
  const ok = exitCode === expectedExitCode;

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  console.log(`[CONTINGENCY][END] ${title} -> ${ok ? 'OK' : 'FAIL'} (exit=${exitCode}, expected=${expectedExitCode}, ${elapsedMs}ms)`);

  return {
    title,
    ok,
    exitCode,
    expectedExitCode,
    elapsedMs,
    output: `${result.stdout || ''}\n${result.stderr || ''}`
  };
}

function run() {
  const failOnSkipped = String(process.env.CONTINGENCY_FAIL_ON_SKIPPED || '0') === '1';
  const steps = [];

  if (!hasBash()) {
    const skipped = {
      title: 'Contingency drill requires bash',
      ok: !failOnSkipped,
      skipped: true,
      elapsedMs: 0,
      exitCode: null,
      expectedExitCode: null,
      output: 'bash not found in PATH'
    };
    steps.push(skipped);
  } else {
    steps.push(runBashStep(
      'Strict warning typed code validation (expect 27)',
      './preflight-smoke-strict.sh',
      0
    ));

    steps.push(runBashStep(
      'Backend-down typed preflight category (expect 21)',
      'HEALTH_URL=http://127.0.0.1:65535/estado EXIT_CODE_MODE=typed ./preflight-production.sh monitor_production >/dev/null 2>&1',
      21
    ));

    steps.push(runBashStep(
      'Unreachable SSH required check (expect failure=1)',
      'FINAL_CHECK_REQUIRE_ROBOT_SSH=1 ROBOT_HOST=10.255.255.1 ROBOT_USER=centinela ./final-check.sh monitor_production >/dev/null 2>&1',
      1
    ));
  }

  const passed = steps.filter((s) => s.ok).length;
  const failed = steps.length - passed;

  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const lines = [];
  lines.push('# Contingency Drill Report');
  lines.push('');
  lines.push(`- generatedAt: ${nowIso()}`);
  lines.push(`- totalSteps: ${steps.length}`);
  lines.push(`- passed: ${passed}`);
  lines.push(`- failed: ${failed}`);
  lines.push(`- result: ${failed === 0 ? 'PASS' : 'FAIL'}`);
  lines.push('');
  lines.push('## Steps');

  for (const step of steps) {
    lines.push(`- [${step.ok ? 'OK' : 'FAIL'}] ${step.title}`);
    if (step.skipped) {
      lines.push('  skipped: true');
    } else {
      lines.push(`  exitCode: ${step.exitCode}`);
      lines.push(`  expectedExitCode: ${step.expectedExitCode}`);
      lines.push(`  elapsedMs: ${step.elapsedMs}`);
    }
  }

  const reportPath = path.resolve(reportDir, `ops-contingency-drill-${nowFileSafe()}.md`);
  fs.writeFileSync(reportPath, `${lines.join('\n')}\n`, 'utf8');

  console.log(`\n[CONTINGENCY] Report: ${reportPath}`);
  console.log(`[CONTINGENCY] Final result: ${failed === 0 ? 'PASS' : 'FAIL'}`);

  process.exit(failed === 0 ? 0 : 1);
}

run();

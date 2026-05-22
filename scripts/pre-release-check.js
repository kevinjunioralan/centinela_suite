const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');

const backendRoot = path.resolve(__dirname, '..');
const apiBase = 'http://127.0.0.1:3012/api/centinela-banco-pruebas';

function runContracts() {
  const result = spawnSync('npm', ['run', 'test:contracts:all'], {
    cwd: backendRoot,
    shell: true,
    stdio: 'inherit'
  });

  if (result.status !== 0) {
    throw new Error('Fallaron los tests de contrato');
  }
}

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(url, timeoutMs = 30000) {
  const start = Date.now();
  let lastError = null;

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await wait(1000);
  }

  throw lastError || new Error('Timeout esperando endpoint de salud');
}

async function runSmokeChecks() {
  const env = {
    ...process.env,
    ALLOW_MONGO_FAILURE: 'true',
    MONGO_URI: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/centinela_precheck',
    PORT: '3012'
  };

  const server = spawn('node', ['src/index.js'], {
    cwd: backendRoot,
    env,
    shell: true,
    stdio: 'pipe'
  });

  server.stdout.on('data', (chunk) => process.stdout.write(chunk));
  server.stderr.on('data', (chunk) => process.stderr.write(chunk));

  try {
    const healthResponse = await waitForHealth(`${apiBase}/estado`);
    const healthJson = await healthResponse.json();

    if (!healthJson.success) {
      throw new Error('El endpoint /estado no devolvio success=true');
    }

    const notFoundResponse = await fetch(`${apiBase}/ruta-que-no-existe`);
    if (notFoundResponse.status !== 404) {
      throw new Error(`Se esperaba 404 en ruta inexistente y se obtuvo ${notFoundResponse.status}`);
    }

    console.log('✅ Smoke check backend OK (/estado y 404 de ruta inexistente)');
  } finally {
    server.kill('SIGTERM');
    await wait(800);
    if (!server.killed) {
      server.kill('SIGKILL');
    }
  }
}

async function main() {
  console.log('🧪 Ejecutando contratos...');
  runContracts();

  console.log('🚀 Ejecutando smoke check de backend...');
  await runSmokeChecks();

  console.log('✅ Pre-release check completado');
}

main().catch((error) => {
  console.error('❌ Pre-release check fallido:', error.message);
  process.exit(1);
});

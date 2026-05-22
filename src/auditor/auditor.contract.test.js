const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const auditorRouter = require('./auditor.routes');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/centinela-banco-pruebas/auditor', auditorRouter);
  return app;
}

async function withServer(run) {
  const app = buildApp();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });

  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}/api/centinela-banco-pruebas/auditor`;

  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

test('POST /eventos/registrar incluye headers y payload de deprecacion', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/eventos/registrar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    assert.equal(response.status, 400);
    assert.equal(response.headers.get('deprecation'), 'true');
    assert.equal(response.headers.get('x-centinela-legacy'), 'auditor-route-backed-by-auditoria');
    assert.match(response.headers.get('link') || '', /\/api\/centinela-banco-pruebas\/auditoria/);
    assert.match(response.headers.get('warning') || '', /deprecada/i);
    assert.ok(response.headers.get('sunset'));

    const body = await response.json();
    assert.equal(body.success, false);
    assert.equal(body.deprecation.deprecated, true);
    assert.equal(body.deprecation.successor, '/api/centinela-banco-pruebas/auditoria');
  });
});

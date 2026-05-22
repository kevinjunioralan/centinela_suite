const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const informesRouter = require('./informes.routes');
const InformeGenerado = require('./models/InformeGenerado');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/centinela-banco-pruebas/informes', informesRouter);
  return app;
}

async function withServer(run) {
  const app = buildApp();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });

  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}/api/centinela-banco-pruebas/informes`;

  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

test('GET /historial devuelve metadata paginada', async () => {
  const originalFind = InformeGenerado.find;
  const originalCountDocuments = InformeGenerado.countDocuments;

  const sampleItems = [
    { _id: 'i1', tipo: 'servidor_pdf', formato: 'pdf' },
    { _id: 'i2', tipo: 'servidor_pdf', formato: 'pdf' }
  ];

  let capturedSkip = null;
  let capturedLimit = null;

  InformeGenerado.find = () => {
    const chain = {
      sort() {
        return chain;
      },
      skip(value) {
        capturedSkip = value;
        return chain;
      },
      limit(value) {
        capturedLimit = value;
        return chain;
      },
      async lean() {
        return sampleItems;
      }
    };

    return chain;
  };

  InformeGenerado.countDocuments = async () => 5;

  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/historial?tipo=servidor_pdf&limit=2&offset=1`);

      assert.equal(response.status, 200);
      const body = await response.json();

      assert.equal(body.success, true);
      assert.equal(body.data.total, 5);
      assert.equal(body.data.limit, 2);
      assert.equal(body.data.offset, 1);
      assert.equal(body.data.hasMore, true);
      assert.equal(body.data.items.length, 2);
      assert.equal(capturedSkip, 1);
      assert.equal(capturedLimit, 2);
    });
  } finally {
    InformeGenerado.find = originalFind;
    InformeGenerado.countDocuments = originalCountDocuments;
  }
});

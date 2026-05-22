const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const expedienteRoutes = require('./expediente.routes');
const Expediente = require('./models/Expediente');

const TEST_ID = '507f191e810c19729de860ea';

function createChainableResult(result) {
  return {
    select() {
      return {
        lean: async () => result
      };
    }
  };
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/centinela-banco-pruebas/expediente', expedienteRoutes);
  return app;
}

async function withServer(run) {
  const app = buildApp();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });

  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}/api/centinela-banco-pruebas/expediente`;

  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

test('PUT /:id/estado retorna 200 para transicion valida', async () => {
  const originalFindById = Expediente.findById;
  const originalFindByIdAndUpdate = Expediente.findByIdAndUpdate;

  Expediente.findById = () => createChainableResult({
    _id: TEST_ID,
    estado: 'en_cuarentena',
    historialEstados: []
  });

  Expediente.findByIdAndUpdate = (_id, updateData) => createChainableResult({
    _id: TEST_ID,
    estado: updateData.estado,
    historialEstados: updateData.historialEstados
  });

  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/${TEST_ID}/estado`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estado: 'en_pruebas',
          observacion: 'Paso a pruebas'
        })
      });

      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.success, true);
      assert.equal(body.data.estado, 'en_pruebas');
      assert.ok(Array.isArray(body.data.historialEstados));
      assert.equal(body.data.historialEstados.length, 1);
    });
  } finally {
    Expediente.findById = originalFindById;
    Expediente.findByIdAndUpdate = originalFindByIdAndUpdate;
  }
});

test('PUT /:id/estado retorna 400 para transicion no permitida', async () => {
  const originalFindById = Expediente.findById;

  Expediente.findById = () => createChainableResult({
    _id: TEST_ID,
    estado: 'pendiente',
    historialEstados: []
  });

  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/${TEST_ID}/estado`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: 'diagnosticado' })
      });

      assert.equal(response.status, 400);
      const body = await response.json();
      assert.equal(body.success, false);
      assert.match(body.error, /Transición de estado no permitida/);
    });
  } finally {
    Expediente.findById = originalFindById;
  }
});

test('PUT /:id/estado retorna 400 para estado invalido', async () => {
  const originalFindById = Expediente.findById;

  Expediente.findById = () => createChainableResult({
    _id: TEST_ID,
    estado: 'pendiente',
    historialEstados: []
  });

  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/${TEST_ID}/estado`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: 'estado_inventado' })
      });

      assert.equal(response.status, 400);
      const body = await response.json();
      assert.equal(body.success, false);
      assert.match(body.error, /Estado inválido/);
    });
  } finally {
    Expediente.findById = originalFindById;
  }
});

test('PUT /:id/estado retorna 404 cuando expediente no existe', async () => {
  const originalFindById = Expediente.findById;

  Expediente.findById = () => createChainableResult(null);

  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/${TEST_ID}/estado`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: 'en_cuarentena' })
      });

      assert.equal(response.status, 404);
      const body = await response.json();
      assert.equal(body.success, false);
      assert.match(body.error, /no encontrado/);
    });
  } finally {
    Expediente.findById = originalFindById;
  }
});

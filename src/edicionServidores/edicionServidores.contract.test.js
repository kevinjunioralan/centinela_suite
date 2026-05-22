const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const router = require('./edicionServidores.routes');
const Expediente = require('../expediente/models/Expediente');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/centinela-banco-pruebas/edicion-servidores', router);
  return app;
}

async function withServer(run) {
  const app = buildApp();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });

  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}/api/centinela-banco-pruebas/edicion-servidores`;

  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

test('GET /servidores devuelve solo expedientes de mantenimiento con pack', async () => {
  const originalFind = Expediente.find;

  Expediente.find = () => ({
    select() {
      return this;
    },
    async lean() {
      return [
        {
          _id: 'exp-1',
          nombre: 'Srv Correo',
          origen: 'mantenimiento',
          servidor: { ip: '10.0.0.10' },
          mantenimiento: { estadoCustodia: 'conectado' },
          instalacion: { packSeleccionado: 'pack_correo' },
          configuracion: { valores: {} }
        },
        {
          _id: 'exp-2',
          nombre: 'Sin pack',
          origen: 'mantenimiento',
          servidor: { ip: '10.0.0.11' },
          mantenimiento: { estadoCustodia: 'pendiente' },
          instalacion: { packSeleccionado: null },
          configuracion: { valores: {} }
        }
      ];
    }
  });

  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/servidores`);
      assert.equal(response.status, 200);

      const body = await response.json();
      assert.equal(body.success, true);
      assert.equal(body.data.length, 1);
      assert.equal(body.data[0].packTipo, 'pack_correo');
      assert.equal(body.data[0].editable, true);
    });
  } finally {
    Expediente.find = originalFind;
  }
});

test('GET /:id/formulario devuelve schema para pack de dominio', async () => {
  const originalFindById = Expediente.findById;

  Expediente.findById = () => ({
    select() {
      return this;
    },
    async lean() {
      return {
        _id: 'exp-3',
        origen: 'mantenimiento',
        nombre: 'Srv Dominio',
        servidor: { ip: '10.0.0.20' },
        mantenimiento: { estadoCustodia: 'conectado' },
        instalacion: { packSeleccionado: 'pack_dominio' },
        configuracion: { packTipo: 'pack_dominio', valores: { dominio: 'empresa.local' } }
      };
    }
  });

  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/exp-3/formulario`);
      assert.equal(response.status, 200);

      const body = await response.json();
      assert.equal(body.success, true);
      assert.equal(body.data.packTipo, 'pack_dominio');
      assert.ok(Array.isArray(body.data.schema.fields));
      assert.ok(Array.isArray(body.data.schema.collections));
    });
  } finally {
    Expediente.findById = originalFindById;
  }
});

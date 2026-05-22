const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const router = require('./instalacion.routes');
const Expediente = require('../expediente/models/Expediente');
const InstalacionService = require('./InstalacionService');

const TEST_ID = '507f191e810c19729de860ea';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/centinela-banco-pruebas/instalacion', router);
  return app;
}

async function withServer(run) {
  const app = buildApp();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });

  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}/api/centinela-banco-pruebas/instalacion`;

  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

test('PUT /:id/software permite limpiar pack y software', async () => {
  const originalFindById = Expediente.findById;

  const expediente = {
    _id: TEST_ID,
    instalacion: {
      software: [{ nombre: 'nginx', estado: 'pendiente' }],
      packSeleccionado: 'pack_web',
      packNombre: 'Pack Web',
      logs: []
    },
    async save() {
      return this;
    }
  };

  Expediente.findById = async () => expediente;

  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/${TEST_ID}/software`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ software: [] })
      });

      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.success, true);
      assert.deepEqual(body.data.software, []);
      assert.equal(body.data.packSeleccionado, null);
      assert.equal(body.data.packNombre, null);
    });
  } finally {
    Expediente.findById = originalFindById;
  }
});

test('PUT /:id/software rechaza software ajeno al pack seleccionado', async () => {
  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/${TEST_ID}/software`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packKey: 'pack_web',
          software: [{ nombre: 'postfix', version: '3.7', estado: 'pendiente' }]
        })
      });

      assert.equal(response.status, 400);
      const body = await response.json();
      assert.equal(body.success, false);
      assert.match(body.error, /Software no permitido/);
    });
  } finally {
    // no-op
  }
});

test('POST /:id/reintentar permite reintentar cuando el expediente esta en fallo', async () => {
  const originalFindById = Expediente.findById;
  const originalFindOneAndUpdate = Expediente.findOneAndUpdate;
  const originalEjecutar = InstalacionService.prototype._ejecutarInstalacionReal;

  let cicloLanzado = null;

  Expediente.findById = async () => ({
    _id: TEST_ID,
    origen: 'instalacion',
    servidor: { ip: '192.168.1.10', password: 'secret' },
    instalacion: {
      estado: 'fallo',
      packSeleccionado: 'pack_web',
      software: [{ nombre: 'nginx', estado: 'error' }]
    },
    configuracion: {
      packTipo: 'pack_web',
      completada: true,
      valores: {
        dominio: 'empresa.local',
        nginx: { puertoHttp: 80 },
        postgresql: { baseDatosInicial: 'centinela' }
      }
    }
  });

  Expediente.findOneAndUpdate = async () => ({
    _id: TEST_ID,
    origen: 'instalacion',
    instalacion: {
      estado: 'planificando',
      software: [{ nombre: 'nginx', estado: 'error' }],
      logs: []
    },
    async save() {
      return this;
    }
  });

  InstalacionService.prototype._ejecutarInstalacionReal = function reintentoSpy(expedienteId, contexto = {}) {
    cicloLanzado = { expedienteId, cycleId: contexto.cycleId };
  };

  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/${TEST_ID}/reintentar`, {
        method: 'POST'
      });

      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.success, true);
      assert.equal(cicloLanzado.expedienteId, TEST_ID);
      assert.ok(cicloLanzado.cycleId);
    });
  } finally {
    Expediente.findById = originalFindById;
    Expediente.findOneAndUpdate = originalFindOneAndUpdate;
    InstalacionService.prototype._ejecutarInstalacionReal = originalEjecutar;
  }
});

test('POST /:id/iniciar rechaza cuando falta configuracion minima del pack', async () => {
  const originalFindById = Expediente.findById;

  Expediente.findById = async () => ({
    _id: TEST_ID,
    origen: 'instalacion',
    servidor: { ip: '192.168.1.10', password: 'secret' },
    instalacion: {
      estado: 'pendiente',
      packSeleccionado: 'pack_web',
      software: [{ nombre: 'nginx', estado: 'pendiente' }]
    },
    configuracion: {
      packTipo: 'pack_web',
      completada: true,
      valores: {
        nginx: { puertoHttp: 80 },
        postgresql: { baseDatosInicial: 'centinela' }
      }
    }
  });

  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/${TEST_ID}/iniciar`, {
        method: 'POST'
      });

      assert.equal(response.status, 400);
      const body = await response.json();
      assert.equal(body.success, false);
      assert.match(body.error, /Configuración incompleta/i);
    });
  } finally {
    Expediente.findById = originalFindById;
  }
});

test('GET /:id/configuracion/historial devuelve snapshots paginados', async () => {
  const originalFindById = Expediente.findById;

  Expediente.findById = () => ({
    select: () => ({
      lean: async () => ({
        _id: TEST_ID,
        instalacion: {
          packSeleccionado: 'pack_web',
          ultimaConfiguracionEjecutada: {
            cycleId: 'cy-003',
            packTipo: 'pack_web',
            fecha: '2026-05-22T10:00:00.000Z',
            configuracion: { dominio: 'acme.local' }
          },
          historialConfiguracion: [
            { cycleId: 'cy-001', packTipo: 'pack_web', fecha: '2026-05-20T10:00:00.000Z', configuracion: { dominio: 'old.local' } },
            { cycleId: 'cy-002', packTipo: 'pack_web', fecha: '2026-05-21T10:00:00.000Z', configuracion: { dominio: 'mid.local' } },
            { cycleId: 'cy-003', packTipo: 'pack_web', fecha: '2026-05-22T10:00:00.000Z', configuracion: { dominio: 'acme.local' } }
          ]
        }
      })
    })
  });

  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/${TEST_ID}/configuracion/historial?offset=1&limit=1`);

      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.success, true);
      assert.equal(body.data.total, 3);
      assert.equal(body.data.offset, 1);
      assert.equal(body.data.limit, 1);
      assert.equal(body.data.hasMore, true);
      assert.equal(body.data.items.length, 1);
      assert.equal(body.data.items[0].cycleId, 'cy-002');
      assert.equal(body.data.ultimaConfiguracionEjecutada.cycleId, 'cy-003');
    });
  } finally {
    Expediente.findById = originalFindById;
  }
});

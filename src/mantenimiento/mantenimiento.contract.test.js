const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const router = require('./mantenimiento.routes');
const Expediente = require('../expediente/models/Expediente');
const Metrica = require('../expediente/models/Metrica');
const Alerta = require('../expediente/models/Alerta');

const TEST_ID = '507f191e810c19729de860ea';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/centinela-banco-pruebas/mantenimiento', router);
  return app;
}

async function withServer(run) {
  const app = buildApp();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });

  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}/api/centinela-banco-pruebas/mantenimiento`;

  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

test('GET /expediente/:id/metricas devuelve shape cpu/memoria/disco', async () => {
  const originalAggregate = Metrica.aggregate;
  Metrica.aggregate = async () => ([
    { timestamp: new Date('2026-05-22T10:00:00.000Z'), cpu: 41, memoria: 58, disco: 70 },
    { timestamp: new Date('2026-05-22T10:01:00.000Z'), cpu: 44, memoria: 61, disco: 72 }
  ]);

  try {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/expediente/${TEST_ID}/metricas`);
      assert.equal(res.status, 200);
      const body = await res.json();

      assert.equal(body.success, true);
      assert.ok(Array.isArray(body.data));
      assert.equal(body.data.length, 2);
      assert.equal(typeof body.data[0].cpu, 'number');
      assert.equal(typeof body.data[0].memoria, 'number');
      assert.equal(typeof body.data[0].disco, 'number');
    });
  } finally {
    Metrica.aggregate = originalAggregate;
  }
});

test('GET /expediente/:id/alertas devuelve campo fecha normalizado', async () => {
  const originalFind = Alerta.find;

  Alerta.find = () => ({
    sort() {
      return this;
    },
    limit() {
      return this;
    },
    async lean() {
      return [
        {
          _id: 'a1',
          tipo: 'error',
          mensaje: 'CPU alta',
          timestamp: new Date('2026-05-22T10:00:00.000Z')
        }
      ];
    }
  });

  try {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/expediente/${TEST_ID}/alertas?limite=5`);
      assert.equal(res.status, 200);
      const body = await res.json();

      assert.equal(body.success, true);
      assert.ok(Array.isArray(body.data));
      assert.equal(body.data.length, 1);
      assert.ok(body.data[0].fecha);
    });
  } finally {
    Alerta.find = originalFind;
  }
});

test('POST /expediente/:id/validacion/iniciar inicia simulacion', async () => {
  const originalFindById = Expediente.findById;

  Expediente.findById = async () => ({
    _id: TEST_ID,
    validacion: {},
    async save() {
      return this;
    }
  });

  try {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/expediente/${TEST_ID}/validacion/iniciar`, {
        method: 'POST'
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.equal(body.data.estado, 'en_progreso');
      assert.equal(body.data.enProgreso, true);
    });
  } finally {
    Expediente.findById = originalFindById;
  }
});

test('GET /expediente/:id/validacion/estado retorna progreso cuando esta en curso', async () => {
  const originalFindById = Expediente.findById;

  const startDate = new Date(Date.now() - 120000);
  const validacion = {
    estado: 'en_progreso',
    enProgreso: true,
    fechaInicio: startDate,
    pruebasEjecutadas: 0,
    pruebasExitosas: 0,
    pruebasFallidas: 0,
    logs: [],
    toObject() {
      return {
        estado: this.estado,
        enProgreso: this.enProgreso,
        fechaInicio: this.fechaInicio,
        pruebasEjecutadas: this.pruebasEjecutadas,
        pruebasExitosas: this.pruebasExitosas,
        pruebasFallidas: this.pruebasFallidas,
        logs: this.logs
      };
    }
  };

  Expediente.findById = async () => ({
    _id: TEST_ID,
    validacion,
    async save() {
      return this;
    }
  });

  try {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/expediente/${TEST_ID}/validacion/estado`);

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.equal(body.data.estado, 'en_progreso');
      assert.ok(typeof body.data.progreso === 'number');
      assert.ok(body.data.progreso >= 0);
    });
  } finally {
    Expediente.findById = originalFindById;
  }
});

const test = require('node:test');
const assert = require('node:assert/strict');

const ExpedienteService = require('./ExpedienteService/ExpedienteService');

function buildService(initialState = 'pendiente') {
  const service = new ExpedienteService();

  const repository = {
    async getExpedienteById(id) {
      return {
        _id: id,
        estado: initialState,
        habitacionId: 'HAB-01',
        historialEstados: []
      };
    },
    async updateExpediente(id, updateData) {
      return {
        _id: id,
        ...updateData
      };
    }
  };

  service.setRepository(repository);
  return service;
}

test('permite transicion pendiente -> en_cuarentena', async () => {
  const service = buildService('pendiente');

  const result = await service.cambiarEstado('exp-1', 'en_cuarentena', {
    observacion: 'Ingreso a cuarentena'
  });

  assert.equal(result.estado, 'en_cuarentena');
  assert.ok(Array.isArray(result.historialEstados));
  assert.equal(result.historialEstados.length, 1);
});

test('permite transicion en_cuarentena -> en_pruebas', async () => {
  const service = buildService('en_cuarentena');

  const result = await service.cambiarEstado('exp-2', 'en_pruebas');

  assert.equal(result.estado, 'en_pruebas');
});

test('permite transicion en_pruebas -> diagnosticado', async () => {
  const service = buildService('en_pruebas');

  const result = await service.cambiarEstado('exp-3', 'diagnosticado');

  assert.equal(result.estado, 'diagnosticado');
  assert.equal(result.habitacionId, null);
  assert.ok(result.fechaLiberacion);
});

test('permite transicion diagnosticado -> en_mantenimiento', async () => {
  const service = buildService('diagnosticado');

  const result = await service.cambiarEstado('exp-4', 'en_mantenimiento');

  assert.equal(result.estado, 'en_mantenimiento');
  assert.equal(result.habitacionId, null);
  assert.ok(result.fechaLiberacion);
});

test('rechaza transicion invalida pendiente -> diagnosticado', async () => {
  const service = buildService('pendiente');

  await assert.rejects(
    () => service.cambiarEstado('exp-5', 'diagnosticado'),
    /Transición de estado no permitida/
  );
});

test('rechaza estado inexistente', async () => {
  const service = buildService('pendiente');

  await assert.rejects(
    () => service.cambiarEstado('exp-6', 'estado_fantasma'),
    /Estado inválido/
  );
});

test('permite idempotencia cuando nuevoEstado coincide con estado actual', async () => {
  const service = buildService('en_pruebas');

  const result = await service.cambiarEstado('exp-7', 'en_pruebas', {
    observacion: 'Sin cambio'
  });

  assert.equal(result.estado, 'en_pruebas');
  assert.equal(result.historialEstados.length, 1);
});

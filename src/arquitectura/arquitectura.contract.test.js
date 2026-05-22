const test = require('node:test');
const assert = require('node:assert/strict');

const arquitecturaService = require('./arquitecturaService');

test('generarPropuesta devuelve un unico pack por servidor en escenarios mixtos', () => {
  const propuesta = arquitecturaService.generarPropuesta({
    empleados: '11-50',
    presupuesto: 'medio',
    servicios: {
      web: true,
      correo: true,
      dominio: true,
      baseDatos: true,
      cortafuegos: false,
      monitoreo: false
    }
  });

  assert.ok(Array.isArray(propuesta.servidores));
  assert.ok(propuesta.servidores.length >= 2);
  assert.ok(propuesta.servidores.every((servidor) => Array.isArray(servidor.packs) && servidor.packs.length === 1));
  assert.equal(
    propuesta.resumen.totalPacks,
    propuesta.servidores.length,
    'totalPacks debe reflejar una asignacion de un pack por servidor'
  );
});

test('generarPropuesta mantiene un solo servidor cuando solo hay pack web', () => {
  const propuesta = arquitecturaService.generarPropuesta({
    empleados: '1-10',
    presupuesto: 'bajo',
    servicios: {
      web: true,
      correo: false,
      dominio: false,
      baseDatos: false,
      cortafuegos: false,
      monitoreo: false
    }
  });

  assert.equal(propuesta.servidores.length, 1);
  assert.deepEqual(propuesta.servidores[0].packs, ['pack_web']);
  assert.equal(propuesta.resumen.totalPacks, 1);
});

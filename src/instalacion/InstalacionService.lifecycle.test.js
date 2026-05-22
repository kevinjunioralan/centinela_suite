const test = require('node:test');
const assert = require('node:assert/strict');

const InstalacionService = require('./InstalacionService');
const Expediente = require('../expediente/models/Expediente');
const InstaladorSSH = require('./InstaladorSSH');

const TEST_ID = '507f191e810c19729de860ea';

function createExpedienteBase() {
  return {
    _id: TEST_ID,
    clienteId: '507f191e810c19729de860eb',
    origen: 'instalacion',
    estado: 'instalando',
    servidor: {
      ip: '192.168.1.10',
      password: 'secret',
      usuario: 'root',
      puerto: 22
    },
    mantenimiento: {},
    instalacion: {
      packSeleccionado: 'pack_web',
      estado: 'planificando',
      software: [
        { nombre: 'nginx', estado: 'pendiente' }
      ],
      logs: [],
      progreso: 0,
      fechaInicio: new Date(Date.now() - 60000)
    },
    configuracion: {
      packTipo: 'pack_web',
      completada: true,
      valores: {
        dominio: 'empresa.local',
        nginx: { puertoHttp: 80 },
        postgresql: { baseDatosInicial: 'centinela' }
      }
    },
    async save() {
      return this;
    }
  };
}

function patchInstaladorExitoso() {
  const originals = {
    conectar: InstaladorSSH.prototype.conectar,
    verificarSudoNoInteractivo: InstaladorSSH.prototype.verificarSudoNoInteractivo,
    registrarEventoRobot: InstaladorSSH.prototype.registrarEventoRobot,
    verificarInternet: InstaladorSSH.prototype.verificarInternet,
    verificarEspacio: InstaladorSSH.prototype.verificarEspacio,
    actualizarRepositorios: InstaladorSSH.prototype.actualizarRepositorios,
    instalarPaquete: InstaladorSSH.prototype.instalarPaquete,
    verificarInstalacion: InstaladorSSH.prototype.verificarInstalacion,
    obtenerVersion: InstaladorSSH.prototype.obtenerVersion,
    cerrar: InstaladorSSH.prototype.cerrar,
    desinstalarPaquete: InstaladorSSH.prototype.desinstalarPaquete
  };

  InstaladorSSH.prototype.conectar = async function conectar() {};
  InstaladorSSH.prototype.verificarSudoNoInteractivo = async function verificarSudoNoInteractivo() {};
  InstaladorSSH.prototype.registrarEventoRobot = async function registrarEventoRobot() {};
  InstaladorSSH.prototype.verificarInternet = async function verificarInternet() {};
  InstaladorSSH.prototype.verificarEspacio = async function verificarEspacio() { return 42; };
  InstaladorSSH.prototype.actualizarRepositorios = async function actualizarRepositorios() {};
  InstaladorSSH.prototype.instalarPaquete = async function instalarPaquete() {};
  InstaladorSSH.prototype.verificarInstalacion = async function verificarInstalacion() { return true; };
  InstaladorSSH.prototype.obtenerVersion = async function obtenerVersion() { return '1.24'; };
  InstaladorSSH.prototype.cerrar = async function cerrar() {};
  InstaladorSSH.prototype.desinstalarPaquete = async function desinstalarPaquete() {};

  return originals;
}

function restoreInstalador(originals) {
  Object.assign(InstaladorSSH.prototype, originals);
}

test('_ejecutarInstalacionReal mueve expediente a mantenimiento al completar con exito', async () => {
  const originalFindById = Expediente.findById;
  const instaladorOriginal = patchInstaladorExitoso();
  const expediente = createExpedienteBase();
  const service = new InstalacionService();

  Expediente.findById = async () => expediente;
  service.verificarServicios = async () => ({ tests: [{ nombre: 'nginx', resultado: true, mensaje: 'ok' }], score: 100, completado: true });
  service.capturarMetricasReales = async () => [];
  service.guardarMetricas = async () => {};
  service.guardarAlertas = async () => {};

  try {
    await service._ejecutarInstalacionReal(TEST_ID, { cycleId: 'cy-test' });

    assert.equal(expediente.instalacion.estado, 'completado');
    assert.equal(expediente.origen, 'mantenimiento');
    assert.equal(expediente.estado, 'en_mantenimiento');
    assert.equal(expediente.mantenimiento.estadoCustodia, 'pendiente');
    assert.ok(expediente.instalacion.resumen);
    assert.equal(expediente.instalacion.resumen.exitoso, true);
    assert.equal(expediente.instalacion.ultimaConfiguracionEjecutada?.packTipo, 'pack_web');
    assert.ok(Array.isArray(expediente.instalacion.historialConfiguracion));
    assert.equal(expediente.instalacion.historialConfiguracion.length, 1);
  } finally {
    Expediente.findById = originalFindById;
    restoreInstalador(instaladorOriginal);
  }
});

test('_ejecutarInstalacionReal deja expediente pendiente cuando la instalacion falla', async () => {
  const originalFindById = Expediente.findById;
  const instaladorOriginal = patchInstaladorExitoso();
  const expediente = createExpedienteBase();
  const service = new InstalacionService();

  Expediente.findById = async () => expediente;
  InstaladorSSH.prototype.instalarPaquete = async function instalarPaquete() {
    throw new Error('fallo de instalacion');
  };

  try {
    await service._ejecutarInstalacionReal(TEST_ID, { cycleId: 'cy-test-fail' });

    assert.equal(expediente.instalacion.estado, 'fallo');
    assert.equal(expediente.estado, 'pendiente');
    assert.equal(expediente.origen, 'instalacion');
  } finally {
    Expediente.findById = originalFindById;
    restoreInstalador(instaladorOriginal);
  }
});

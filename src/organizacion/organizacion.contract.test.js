const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const router = require('./organizacion.routes');
const Cliente = require('../expediente/models/Cliente');
const UnidadOrganizativa = require('../expediente/models/Organizacion');
const Expediente = require('../expediente/models/Expediente');
const Red = require('../expediente/models/Red');
const OrganizacionDiseno = require('./models/OrganizacionDiseno');
const RedDisenoOrganizacion = require('../red/models/RedDisenoOrganizacion');
const redRoutes = require('../red/red.routes');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/centinela-banco-pruebas/organizacion', router);
  return app;
}

async function withServer(run) {
  const app = buildApp();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });

  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}/api/centinela-banco-pruebas/organizacion`;

  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

test('GET /cliente/:clienteId/contexto devuelve cliente, unidades y resumen', async () => {
  const originalClienteFindById = Cliente.findById;
  const originalUnidadFind = UnidadOrganizativa.find;
  const originalDisenoFindOne = OrganizacionDiseno.findOne;

  Cliente.findById = () => ({
    select() {
      return this;
    },
    async lean() {
      return { _id: 'c1', nombre: 'Empresa Demo' };
    }
  });

  UnidadOrganizativa.find = () => ({
    async lean() {
      return [{ _id: 'ou1', nombre: 'Direccion' }];
    }
  });

  OrganizacionDiseno.findOne = () => ({
    async lean() {
      return { _id: 'd1', serviciosObjetivo: ['directorio', 'dns'] };
    }
  });

  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/cliente/c1/contexto`);
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.success, true);
      assert.equal(body.data.cliente.nombre, 'Empresa Demo');
      assert.equal(body.data.unidades.length, 1);
      assert.equal(body.data.resumen.totalOUs, 1);
      assert.equal(body.data.resumen.totalServiciosObjetivo, 2);
      assert.equal(body.data.resumen.tieneDiseno, true);
    });
  } finally {
    Cliente.findById = originalClienteFindById;
    UnidadOrganizativa.find = originalUnidadFind;
    OrganizacionDiseno.findOne = originalDisenoFindOne;
  }
});

test('PUT /cliente/:clienteId/diseno devuelve 400 si dominio es invalido', async () => {
  const originalClienteFindById = Cliente.findById;

  Cliente.findById = () => ({
    select() {
      return this;
    },
    async lean() {
      return { _id: 'c1', nombre: 'Empresa Demo' };
    }
  });

  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/cliente/c1/diseno`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizacion: { empresa: 'Empresa Demo', dominio: 'invalido', sedePrincipal: 'Madrid' },
          serviciosObjetivo: ['directorio'],
          ous: [{ id: 'ou-1', nombre: 'Direccion', criticidad: 'alta' }]
        })
      });

      assert.equal(response.status, 400);
      const body = await response.json();
      assert.equal(body.success, false);
    });
  } finally {
    Cliente.findById = originalClienteFindById;
  }
});

test('PUT /cliente/:clienteId/diseno guarda modelo organizacional normalizado', async () => {
  const originalClienteFindById = Cliente.findById;
  const originalDisenoFindOne = OrganizacionDiseno.findOne;
  const originalDisenoFindOneAndUpdate = OrganizacionDiseno.findOneAndUpdate;

  Cliente.findById = () => ({
    select() {
      return this;
    },
    async lean() {
      return { _id: 'c1', nombre: 'Empresa Demo' };
    }
  });

  OrganizacionDiseno.findOne = () => ({
    async lean() {
      return null;
    }
  });

  OrganizacionDiseno.findOneAndUpdate = async (_query, payload) => ({
    _id: 'd1',
    clienteId: 'c1',
    ...payload.$set
  });

  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/cliente/c1/diseno`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizacion: { empresa: 'Empresa Demo', dominio: 'empresa.local', sedePrincipal: 'Madrid' },
          serviciosObjetivo: ['directorio', 'dns', 'dns', 'servicio_invalido'],
          ous: [
            {
              id: 'ou-direccion',
              nombre: 'Direccion',
              padreId: null,
              criticidad: 'alta',
              seguridad: { sensibilidad: 'alta', segmentacionEstricta: true },
              capacidad: { usuarios: 8, ordenadores: 8, impresoras: 1, perifericos: 1 }
            }
          ],
          actualizadoPor: 'qa'
        })
      });

      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.success, true);
      assert.equal(body.data.organizacion.dominio, 'empresa.local');
      assert.equal(body.data.serviciosObjetivo.length, 2);
      assert.equal(body.data.ous.length, 1);
      assert.equal(body.data.actualizadoPor, 'qa');
      assert.equal(body.data.versionActual, 1);
    });
  } finally {
    Cliente.findById = originalClienteFindById;
    OrganizacionDiseno.findOne = originalDisenoFindOne;
    OrganizacionDiseno.findOneAndUpdate = originalDisenoFindOneAndUpdate;
  }
});

test('GET /cliente/:clienteId/diseno/versiones devuelve historial de versiones', async () => {
  const originalClienteFindById = Cliente.findById;
  const originalDisenoFindOne = OrganizacionDiseno.findOne;

  Cliente.findById = () => ({
    select() {
      return this;
    },
    async lean() {
      return { _id: 'c1', nombre: 'Empresa Demo' };
    }
  });

  OrganizacionDiseno.findOne = () => ({
    async lean() {
      return {
        _id: 'd1',
        versionActual: 2,
        historialVersiones: [
          { version: 1, guardadoEn: '2026-07-19T00:00:00.000Z', diseno: { ous: [] } },
          { version: 2, guardadoEn: '2026-07-19T01:00:00.000Z', diseno: { ous: [{ id: 'ou1' }] } }
        ]
      };
    }
  });

  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/cliente/c1/diseno/versiones`);
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.success, true);
      assert.equal(body.data.versionActual, 2);
      assert.equal(body.data.historialVersiones.length, 2);
    });
  } finally {
    Cliente.findById = originalClienteFindById;
    OrganizacionDiseno.findOne = originalDisenoFindOne;
  }
});

test('POST /cliente/:clienteId/diseno/comparar-versiones devuelve diferencias', async () => {
  const originalDisenoFindOne = OrganizacionDiseno.findOne;

  OrganizacionDiseno.findOne = () => ({
    async lean() {
      return {
        _id: 'd1',
        historialVersiones: [
          {
            version: 1,
            diseno: {
              serviciosObjetivo: ['directorio'],
              ous: [
                { id: 'ou-direccion', criticidad: 'media' }
              ]
            }
          },
          {
            version: 2,
            diseno: {
              serviciosObjetivo: ['directorio', 'web'],
              ous: [
                { id: 'ou-direccion', criticidad: 'alta' },
                { id: 'ou-operaciones', criticidad: 'media' }
              ]
            }
          }
        ]
      };
    }
  });

  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/cliente/c1/diseno/comparar-versiones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromVersion: 1, toVersion: 2 })
      });

      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.success, true);
      assert.equal(body.data.resumen.deltaOUs, 1);
      assert.equal(body.data.ousAgregadas.includes('ou-operaciones'), true);
      assert.equal(body.data.cambiosCriticidad.length, 1);
    });
  } finally {
    OrganizacionDiseno.findOne = originalDisenoFindOne;
  }
});

test('GET /cliente/:clienteId/autochequeo-analytics devuelve resumen y top reglas', async () => {
  const originalClienteFindById = Cliente.findById;
  const originalDisenoFindOne = OrganizacionDiseno.findOne;

  Cliente.findById = () => ({
    select() {
      return this;
    },
    async lean() {
      return { _id: 'c1', nombre: 'Empresa Demo' };
    }
  });

  OrganizacionDiseno.findOne = () => ({
    async lean() {
      return {
        _id: 'd1',
        historialAutochequeo: [
          {
            generadoEn: '2026-07-19T00:00:00.000Z',
            score: 72,
            estado: 'revisar',
            reglasDisparadas: [
              { codigo: 'ORG-010', severidad: 'aviso', titulo: 'Sin activos criticos clasificados' }
            ]
          },
          {
            generadoEn: '2026-07-19T01:00:00.000Z',
            score: 88,
            estado: 'aprobado',
            reglasDisparadas: [
              { codigo: 'ORG-010', severidad: 'aviso', titulo: 'Sin activos criticos clasificados' },
              { codigo: 'SEC-050', severidad: 'aviso', titulo: 'Servicios expuestos sin capa de seguridad' }
            ]
          }
        ]
      };
    }
  });

  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/cliente/c1/autochequeo-analytics`);
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.success, true);
      assert.equal(body.data.resumen.totalSnapshots, 2);
      assert.equal(body.data.resumen.scorePromedio, 80);
      assert.equal(body.data.resumen.scoreActual, 88);
      assert.equal(body.data.resumen.tendenciaDelta, 16);
      assert.equal(body.data.topReglas[0].codigo, 'ORG-010');
      assert.equal(body.data.topReglas[0].apariciones, 2);
    });
  } finally {
    Cliente.findById = originalClienteFindById;
    OrganizacionDiseno.findOne = originalDisenoFindOne;
  }
});

test('POST /cliente/:clienteId/publicar-diseno bloquea si autochequeo no aprobado', async () => {
  const originalClienteFindById = Cliente.findById;
  const originalDisenoFindOne = OrganizacionDiseno.findOne;

  Cliente.findById = () => ({
    select() {
      return this;
    },
    async lean() {
      return { _id: 'c1', nombre: 'Empresa Demo' };
    }
  });

  OrganizacionDiseno.findOne = () => ({
    async lean() {
      return {
        _id: 'd1',
        ultimoAutochequeo: { estado: 'bloqueado' }
      };
    }
  });

  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/cliente/c1/publicar-diseno`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: true })
      });
      assert.equal(response.status, 400);
      const body = await response.json();
      assert.equal(body.success, false);
    });
  } finally {
    Cliente.findById = originalClienteFindById;
    OrganizacionDiseno.findOne = originalDisenoFindOne;
  }
});

test('POST /cliente/:clienteId/publicar-diseno dry-run devuelve propuesta previa', async () => {
  const originalClienteFindById = Cliente.findById;
  const originalDisenoFindOne = OrganizacionDiseno.findOne;
  const originalExpedienteFind = Expediente.find;
  const originalRedFind = Red.find;

  Cliente.findById = () => ({
    select() {
      return this;
    },
    async lean() {
      return { _id: 'c1', nombre: 'Empresa Demo' };
    }
  });

  OrganizacionDiseno.findOne = () => ({
    async lean() {
      return {
        _id: 'd1',
        actualizadoPor: 'qa',
        ultimoAutochequeo: { estado: 'aprobado' },
        ultimaDerivacion: {
          red: {
            necesidades: { usuarios: 30, pcs: 20, impresoras: 2, vms: 3 },
            areas: [
              { nombre: 'Direccion', usuarios: 8, pcs: 8, impresoras: 1, vms: 1, criticidad: 'alta' },
              { nombre: 'Operaciones', usuarios: 20, pcs: 12, impresoras: 1, vms: 2, criticidad: 'media' }
            ]
          }
        }
      };
    }
  });

  Expediente.find = () => ({
    select() {
      return this;
    },
    async lean() {
      return [
        {
          _id: 'e1',
          nombre: 'Srv Dominio',
          instalacion: { packSeleccionado: 'pack_dominio' },
          configuracion: { valores: {} },
          servidor: { ip: null }
        },
        {
          _id: 'e2',
          nombre: 'Srv Web',
          instalacion: { packSeleccionado: 'pack_web' },
          configuracion: { valores: {} },
          servidor: { ip: null }
        }
      ];
    }
  });

  Red.find = () => ({
    async lean() {
      return [];
    }
  });

  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/cliente/c1/publicar-diseno`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: true })
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.success, true);
      assert.equal(body.data.dryRun, true);
      assert.equal(body.data.resumen.totalSubredes, 2);
      assert.equal(typeof body.data.propuesta.generadoEn, 'string');
      assert.equal(body.data.incluirAsignacionServidores, true);
      assert.equal(body.data.incluirAplicacionRedes, true);
      assert.equal(body.data.incluirAsignacionIps, true);
      assert.equal(body.data.aplicacionRedes.resumen.totalCreadas, 2);
      assert.equal(body.data.asignacionServidores.resumen.totalAsignados, 2);
      assert.equal(body.data.asignacionIps.resumen.totalAsignadas, 2);
    });
  } finally {
    Cliente.findById = originalClienteFindById;
    OrganizacionDiseno.findOne = originalDisenoFindOne;
    Expediente.find = originalExpedienteFind;
    Red.find = originalRedFind;
  }
});

test('POST /cliente/:clienteId/publicar-diseno dry-run con flags desactivados omite orquestacion extra', async () => {
  const originalClienteFindById = Cliente.findById;
  const originalDisenoFindOne = OrganizacionDiseno.findOne;
  const originalExpedienteFind = Expediente.find;
  const originalRedFind = Red.find;

  Cliente.findById = () => ({
    select() {
      return this;
    },
    async lean() {
      return { _id: 'c1', nombre: 'Empresa Demo' };
    }
  });

  OrganizacionDiseno.findOne = () => ({
    async lean() {
      return {
        _id: 'd1',
        actualizadoPor: 'qa',
        ultimoAutochequeo: { estado: 'aprobado' },
        ultimaDerivacion: {
          red: {
            necesidades: { usuarios: 30, pcs: 20, impresoras: 2, vms: 3 },
            areas: [
              { nombre: 'Direccion', usuarios: 8, pcs: 8, impresoras: 1, vms: 1, criticidad: 'alta' },
              { nombre: 'Operaciones', usuarios: 20, pcs: 12, impresoras: 1, vms: 2, criticidad: 'media' }
            ]
          }
        }
      };
    }
  });

  Expediente.find = () => ({
    select() {
      return this;
    },
    async lean() {
      return [];
    }
  });

  Red.find = () => ({
    async lean() {
      return [];
    }
  });

  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/cliente/c1/publicar-diseno`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dryRun: true,
          incluirAplicacionRedes: false,
          incluirAsignacionServidores: false,
          incluirAsignacionIps: false
        })
      });

      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.success, true);
      assert.equal(body.data.incluirAplicacionRedes, false);
      assert.equal(body.data.incluirAsignacionServidores, false);
      assert.equal(body.data.incluirAsignacionIps, false);
      assert.equal(body.data.aplicacionRedes, null);
      assert.equal(body.data.asignacionServidores, null);
      assert.equal(body.data.asignacionIps, null);
      assert.equal(body.data.resumen.totalRedesAplicadas, 0);
      assert.equal(body.data.resumen.totalServidoresAsignados, 0);
      assert.equal(body.data.resumen.totalIpsAsignadas, 0);
    });
  } finally {
    Cliente.findById = originalClienteFindById;
    OrganizacionDiseno.findOne = originalDisenoFindOne;
    Expediente.find = originalExpedienteFind;
    Red.find = originalRedFind;
  }
});

test('POST /cliente/:clienteId/publicar-diseno apply persiste red y asignaciones sugeridas', async () => {
  const originalClienteFindById = Cliente.findById;
  const originalDisenoFindOne = OrganizacionDiseno.findOne;
  const originalExpedienteFind = Expediente.find;
  const originalExpedienteFindByIdAndUpdate = Expediente.findByIdAndUpdate;
  const originalRedFind = Red.find;
  const originalRedSave = Red.prototype.save;
  const originalRedFindOneAndUpdate = RedDisenoOrganizacion.findOneAndUpdate;

  Cliente.findById = () => ({
    select() {
      return this;
    },
    async lean() {
      return { _id: 'c1', nombre: 'Empresa Demo' };
    }
  });

  OrganizacionDiseno.findOne = () => ({
    async lean() {
      return {
        _id: 'd1',
        actualizadoPor: 'qa',
        ultimoAutochequeo: { estado: 'aprobado' },
        ultimaDerivacion: {
          red: {
            necesidades: { usuarios: 30, pcs: 20, impresoras: 2, vms: 3 },
            areas: [
              { nombre: 'Direccion', usuarios: 8, pcs: 8, impresoras: 1, vms: 1, criticidad: 'alta' },
              { nombre: 'Operaciones', usuarios: 20, pcs: 12, impresoras: 1, vms: 2, criticidad: 'media' }
            ]
          }
        }
      };
    }
  });

  Expediente.find = () => ({
    select() {
      return this;
    },
    async lean() {
      return [
        {
          _id: 'e1',
          nombre: 'Srv Dominio',
          instalacion: { packSeleccionado: 'pack_dominio' },
          configuracion: { valores: {} },
          servidor: { ip: null }
        },
        {
          _id: 'e2',
          nombre: 'Srv Web',
          instalacion: { packSeleccionado: 'pack_web' },
          configuracion: { valores: {} },
          servidor: { ip: null }
        }
      ];
    }
  });

  Red.find = () => ({
    async lean() {
      return [];
    }
  });

  Red.prototype.save = async function save() {
    return this;
  };

  const expedienteUpdates = [];
  Expediente.findByIdAndUpdate = async (expedienteId, payload) => {
    expedienteUpdates.push({ expedienteId, payload });
    return { _id: expedienteId };
  };

  const redUpdates = [];
  RedDisenoOrganizacion.findOneAndUpdate = async (query, payload) => {
    redUpdates.push({ query, payload });
    return { _id: 'r1' };
  };

  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/cliente/c1/publicar-diseno`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dryRun: false,
          incluirAsignacionServidores: true
        })
      });

      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.success, true);
      assert.equal(body.data.dryRun, false);
      assert.equal(body.data.incluirAsignacionServidores, true);
      assert.equal(body.data.incluirAplicacionRedes, true);
      assert.equal(body.data.incluirAsignacionIps, true);
      assert.equal(body.data.aplicacionRedes.resumen.totalCreadas, 2);
      assert.equal(body.data.asignacionServidores.resumen.totalAsignados, 2);
      assert.equal(body.data.asignacionIps.resumen.totalAsignadas, 2);
      assert.equal(expedienteUpdates.length, 4);
      assert.equal(redUpdates.length >= 3, true);
    });
  } finally {
    Cliente.findById = originalClienteFindById;
    OrganizacionDiseno.findOne = originalDisenoFindOne;
    Expediente.find = originalExpedienteFind;
    Expediente.findByIdAndUpdate = originalExpedienteFindByIdAndUpdate;
    Red.find = originalRedFind;
    Red.prototype.save = originalRedSave;
    RedDisenoOrganizacion.findOneAndUpdate = originalRedFindOneAndUpdate;
  }
});

test('POST /cliente/:clienteId/derivar devuelve resumen y persiste snapshot', async () => {
  const originalClienteFindById = Cliente.findById;
  const originalDisenoFindOne = OrganizacionDiseno.findOne;
  const originalDisenoFindOneAndUpdate = OrganizacionDiseno.findOneAndUpdate;

  Cliente.findById = () => ({
    select() {
      return this;
    },
    async lean() {
      return { _id: 'c1', nombre: 'Empresa Demo' };
    }
  });

  let derivacionUpdate = null;
  OrganizacionDiseno.findOne = () => ({
    async lean() {
      return {
        _id: 'd1',
        clienteId: 'c1',
        serviciosObjetivo: ['directorio', 'dns', 'web'],
        ous: [
          {
            id: 'ou-direccion',
            nombre: 'Direccion',
            criticidad: 'alta',
            capacidad: { usuarios: 8, ordenadores: 8, impresoras: 1, perifericos: 1 }
          },
          {
            id: 'ou-operaciones',
            nombre: 'Operaciones',
            criticidad: 'media',
            capacidad: { usuarios: 20, ordenadores: 18, impresoras: 2, perifericos: 4 }
          }
        ]
      };
    }
  });

  OrganizacionDiseno.findOneAndUpdate = async (_query, payload) => {
    derivacionUpdate = payload;
    return { _id: 'd1' };
  };

  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/cliente/c1/derivar`, { method: 'POST' });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.success, true);
      assert.equal(body.data.resumen.totalOUs, 2);
      assert.equal(body.data.derivacion.red.necesidades.usuarios, 28);
      assert.equal(body.data.derivacion.instalacion.packsRecomendados.includes('pack_dominio'), true);
      assert.equal(body.data.derivacion.instalacion.packsRecomendados.includes('pack_web'), true);
      assert.equal(typeof body.data.derivacion.generadoEn, 'string');

      assert.equal(Boolean(derivacionUpdate.$set.ultimaDerivacion), true);
      assert.equal(derivacionUpdate.$push.historialDerivaciones.$slice, -10);
    });
  } finally {
    Cliente.findById = originalClienteFindById;
    OrganizacionDiseno.findOne = originalDisenoFindOne;
    OrganizacionDiseno.findOneAndUpdate = originalDisenoFindOneAndUpdate;
  }
});

test('POST /cliente/:clienteId/publicar-diseno incluye sugerencia de hardware red cuando se solicita', async () => {
  const originalClienteFindById = Cliente.findById;
  const originalDisenoFindOne = OrganizacionDiseno.findOne;
  const originalExpedienteFind = Expediente.find;
  const originalRedFind = Red.find;
  const originalHardwareSuggestion = redRoutes.__internals.suggestHardwareForRedFromPropuesta;

  Cliente.findById = () => ({
    select() {
      return this;
    },
    async lean() {
      return { _id: 'c1', nombre: 'Empresa Demo' };
    }
  });

  OrganizacionDiseno.findOne = () => ({
    async lean() {
      return {
        _id: 'd1',
        actualizadoPor: 'qa',
        ultimoAutochequeo: { estado: 'aprobado' },
        ultimaDerivacion: {
          red: {
            necesidades: { usuarios: 20, pcs: 15, impresoras: 2, vms: 2 },
            areas: [
              { nombre: 'Direccion', usuarios: 6, pcs: 6, impresoras: 1, vms: 1, criticidad: 'alta' },
              { nombre: 'Operaciones', usuarios: 12, pcs: 8, impresoras: 1, vms: 1, criticidad: 'media' }
            ]
          }
        }
      };
    }
  });

  Expediente.find = () => ({
    select() {
      return this;
    },
    async lean() {
      return [];
    }
  });

  Red.find = () => ({
    async lean() {
      return [];
    }
  });

  redRoutes.__internals.suggestHardwareForRedFromPropuesta = async () => ({
    generadoEn: '2026-07-21T00:00:00.000Z',
    resumen: {
      totalSubredes: 2,
      demandaTotal: { switch: 2, ap_wifi: 2, router: 1 },
      faltantes: { switch: 0, ap_wifi: 0, router: 0 },
      coberturaCompleta: true
    },
    sugerenciasPorSubred: []
  });

  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/cliente/c1/publicar-diseno`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dryRun: true,
          incluirSugerenciaHardwareRed: true,
          incluirAplicacionRedes: false,
          incluirAsignacionServidores: false,
          incluirAsignacionIps: false
        })
      });

      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.success, true);
      assert.equal(body.data.incluirSugerenciaHardwareRed, true);
      assert.equal(Boolean(body.data.sugerenciaHardwareRed), true);
      assert.equal(body.data.resumen.coberturaHardwareCompleta, true);
    });
  } finally {
    Cliente.findById = originalClienteFindById;
    OrganizacionDiseno.findOne = originalDisenoFindOne;
    Expediente.find = originalExpedienteFind;
    Red.find = originalRedFind;
    redRoutes.__internals.suggestHardwareForRedFromPropuesta = originalHardwareSuggestion;
  }
});

test('POST /cliente/:clienteId/publicar-diseno apply incluye sugerencia de hardware red cuando se solicita', async () => {
  const originalClienteFindById = Cliente.findById;
  const originalDisenoFindOne = OrganizacionDiseno.findOne;
  const originalExpedienteFind = Expediente.find;
  const originalRedFind = Red.find;
  const originalRedFindOneAndUpdate = RedDisenoOrganizacion.findOneAndUpdate;
  const originalHardwareSuggestion = redRoutes.__internals.suggestHardwareForRedFromPropuesta;

  let capturedHardwareCall = null;

  Cliente.findById = () => ({
    select() {
      return this;
    },
    async lean() {
      return { _id: 'c1', nombre: 'Empresa Demo' };
    }
  });

  OrganizacionDiseno.findOne = () => ({
    async lean() {
      return {
        _id: 'd1',
        actualizadoPor: 'qa',
        ultimoAutochequeo: { estado: 'aprobado' },
        ultimaDerivacion: {
          red: {
            necesidades: { usuarios: 20, pcs: 15, impresoras: 2, vms: 2 },
            areas: [
              { nombre: 'Direccion', usuarios: 6, pcs: 6, impresoras: 1, vms: 1, criticidad: 'alta' },
              { nombre: 'Operaciones', usuarios: 12, pcs: 8, impresoras: 1, vms: 1, criticidad: 'media' }
            ]
          }
        }
      };
    }
  });

  Expediente.find = () => ({
    select() {
      return this;
    },
    async lean() {
      return [];
    }
  });

  Red.find = () => ({
    async lean() {
      return [];
    }
  });

  RedDisenoOrganizacion.findOneAndUpdate = async () => ({ _id: 'r1' });

  redRoutes.__internals.suggestHardwareForRedFromPropuesta = async (payload) => {
    capturedHardwareCall = payload;
    return {
      generadoEn: '2026-07-21T00:00:00.000Z',
      resumen: {
        totalSubredes: 2,
        demandaTotal: { switch: 2, ap_wifi: 2, router: 1 },
        faltantes: { switch: 1, ap_wifi: 0, router: 0 },
        coberturaCompleta: false
      },
      sugerenciasPorSubred: []
    };
  };

  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/cliente/c1/publicar-diseno`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dryRun: false,
          incluirSugerenciaHardwareRed: true,
          incluirAplicacionRedes: false,
          incluirAsignacionServidores: false,
          incluirAsignacionIps: false
        })
      });

      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.success, true);
      assert.equal(body.data.dryRun, false);
      assert.equal(body.data.incluirSugerenciaHardwareRed, true);
      assert.equal(Boolean(body.data.sugerenciaHardwareRed), true);
      assert.equal(body.data.resumen.coberturaHardwareCompleta, false);
      assert.equal(capturedHardwareCall?.apply, true);
      assert.equal(capturedHardwareCall?.clienteId, 'c1');
    });
  } finally {
    Cliente.findById = originalClienteFindById;
    OrganizacionDiseno.findOne = originalDisenoFindOne;
    Expediente.find = originalExpedienteFind;
    Red.find = originalRedFind;
    RedDisenoOrganizacion.findOneAndUpdate = originalRedFindOneAndUpdate;
    redRoutes.__internals.suggestHardwareForRedFromPropuesta = originalHardwareSuggestion;
  }
});

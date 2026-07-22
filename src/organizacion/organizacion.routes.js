const express = require('express');
const router = express.Router();
const UnidadOrganizativa = require('../expediente/models/Organizacion');
const Expediente = require('../expediente/models/Expediente');
const Cliente = require('../expediente/models/Cliente');
const OrganizacionDiseno = require('./models/OrganizacionDiseno');
const RedDisenoOrganizacion = require('../red/models/RedDisenoOrganizacion');
const redRoutes = require('../red/red.routes');

const SERVICIOS_VALIDOS = [
  'directorio',
  'dns',
  'web',
  'correo',
  'base_datos',
  'monitorizacion',
  'seguridad'
];

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function findUserDuplicate(unidades, { usuario, email, excludeUserId = null }) {
  const loginKey = normalizeKey(usuario);
  const emailKey = normalizeKey(email);

  for (const unidad of unidades) {
    for (const item of unidad.usuarios || []) {
      if (excludeUserId && String(item._id) === String(excludeUserId)) {
        continue;
      }

      if (loginKey && normalizeKey(item.usuario) === loginKey) {
        return { field: 'usuario', value: item.usuario, ouId: unidad._id };
      }

      if (emailKey && normalizeKey(item.email) === emailKey) {
        return { field: 'email', value: item.email, ouId: unidad._id };
      }
    }
  }

  return null;
}

function toNonNegativeNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}

function isValidDomain(value) {
  const domain = normalizeText(value).toLowerCase();
  if (!domain) {
    return false;
  }

  // FQDN basico sin espacios y con al menos un punto.
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(domain);
}

function normalizeDisenoInput(body = {}) {
  const organizacion = body.organizacion || {};
  const serviciosObjetivo = Array.isArray(body.serviciosObjetivo)
    ? [...new Set(body.serviciosObjetivo.map((item) => normalizeKey(item)).filter((item) => SERVICIOS_VALIDOS.includes(item)))]
    : [];

  const ous = Array.isArray(body.ous)
    ? body.ous
      .map((item, index) => {
        const rawId = normalizeText(item?.id || `ou-${index + 1}`);
        const rawPadreId = normalizeText(item?.padreId || '');
        return {
          id: rawId,
          nombre: normalizeText(item?.nombre),
          padreId: rawPadreId || null,
          criticidad: ['alta', 'media', 'baja'].includes(normalizeKey(item?.criticidad))
            ? normalizeKey(item.criticidad)
            : 'media',
          seguridad: {
            sensibilidad: ['alta', 'media', 'baja'].includes(normalizeKey(item?.seguridad?.sensibilidad))
              ? normalizeKey(item.seguridad.sensibilidad)
              : 'media',
            segmentacionEstricta: Boolean(item?.seguridad?.segmentacionEstricta)
          },
          capacidad: {
            usuarios: toNonNegativeNumber(item?.capacidad?.usuarios),
            ordenadores: toNonNegativeNumber(item?.capacidad?.ordenadores),
            impresoras: toNonNegativeNumber(item?.capacidad?.impresoras),
            perifericos: toNonNegativeNumber(item?.capacidad?.perifericos),
            crecimientoPct: toNonNegativeNumber(item?.capacidad?.crecimientoPct)
          }
        };
      })
      .filter((item) => item.id && item.nombre)
    : [];

  const rawAutochequeo = body.autochequeo && typeof body.autochequeo === 'object'
    ? body.autochequeo
    : null;

  const autochequeo = rawAutochequeo
    ? {
      generadoEn: normalizeText(rawAutochequeo.generadoEn || new Date().toISOString()),
      score: toNonNegativeNumber(rawAutochequeo.score),
      estado: normalizeKey(rawAutochequeo.estado || 'revisar'),
      bloqueos: Array.isArray(rawAutochequeo.bloqueos) ? rawAutochequeo.bloqueos.map((item) => normalizeText(item)).filter(Boolean).slice(0, 30) : [],
      avisos: Array.isArray(rawAutochequeo.avisos) ? rawAutochequeo.avisos.map((item) => normalizeText(item)).filter(Boolean).slice(0, 30) : [],
      sugerencias: Array.isArray(rawAutochequeo.sugerencias) ? rawAutochequeo.sugerencias.map((item) => normalizeText(item)).filter(Boolean).slice(0, 30) : [],
      reglasDisparadas: Array.isArray(rawAutochequeo.reglasDisparadas)
        ? rawAutochequeo.reglasDisparadas
          .map((item) => ({
            codigo: normalizeText(item?.codigo).slice(0, 60),
            severidad: normalizeKey(item?.severidad).slice(0, 30),
            titulo: normalizeText(item?.titulo).slice(0, 180)
          }))
          .filter((item) => item.codigo)
          .slice(0, 50)
        : []
    }
    : null;

  return {
    organizacion: {
      empresa: normalizeText(organizacion.empresa),
      dominio: normalizeText(organizacion.dominio).toLowerCase(),
      sedePrincipal: normalizeText(organizacion.sedePrincipal)
    },
    serviciosObjetivo,
    ous,
    actualizadoPor: normalizeText(body.actualizadoPor) || 'sistema',
    autochequeo
  };
}

function detectCycle(ous) {
  const byId = new Map();
  ous.forEach((ou) => byId.set(ou.id, ou));

  const visiting = new Set();
  const visited = new Set();

  function dfs(id) {
    if (visited.has(id)) {
      return false;
    }
    if (visiting.has(id)) {
      return true;
    }

    visiting.add(id);
    const node = byId.get(id);
    const parentId = node?.padreId || null;
    if (parentId && byId.has(parentId) && dfs(parentId)) {
      return true;
    }

    visiting.delete(id);
    visited.add(id);
    return false;
  }

  for (const ou of ous) {
    if (dfs(ou.id)) {
      return true;
    }
  }

  return false;
}

function validateDisenoInput(diseno) {
  if (!isValidDomain(diseno.organizacion?.dominio)) {
    return 'El dominio organizacional es obligatorio y debe tener formato valido (ejemplo: empresa.local)';
  }

  if (!Array.isArray(diseno.ous) || !diseno.ous.length) {
    return 'Debe existir al menos una OU para continuar';
  }

  const ids = new Set();
  for (const ou of diseno.ous) {
    if (ids.has(ou.id)) {
      return `ID de OU duplicado: ${ou.id}`;
    }
    ids.add(ou.id);
  }

  let roots = 0;
  const siblingNames = new Set();
  for (const ou of diseno.ous) {
    if (!ou.padreId) {
      roots += 1;
    }

    if (ou.padreId && !ids.has(ou.padreId)) {
      return `La OU '${ou.nombre}' referencia un padre inexistente (${ou.padreId})`;
    }

    if (ou.padreId && ou.padreId === ou.id) {
      return `La OU '${ou.nombre}' no puede ser su propio padre`;
    }

    const siblingKey = `${ou.padreId || 'root'}::${normalizeKey(ou.nombre)}`;
    if (siblingNames.has(siblingKey)) {
      return `Nombre OU duplicado al mismo nivel: ${ou.nombre}`;
    }
    siblingNames.add(siblingKey);
  }

  if (roots === 0) {
    return 'Debe existir al menos una OU raiz';
  }

  if (detectCycle(diseno.ous)) {
    return 'La jerarquia de OUs contiene ciclos';
  }

  return null;
}

function buildDerivacionFromDiseno(diseno) {
  const ous = Array.isArray(diseno.ous) ? diseno.ous : [];
  const serviciosObjetivo = Array.isArray(diseno.serviciosObjetivo) ? diseno.serviciosObjetivo : [];

  const totalUsuarios = ous.reduce((sum, item) => sum + toNonNegativeNumber(item?.capacidad?.usuarios), 0);
  const totalOrdenadores = ous.reduce((sum, item) => sum + toNonNegativeNumber(item?.capacidad?.ordenadores), 0);
  const totalImpresoras = ous.reduce((sum, item) => sum + toNonNegativeNumber(item?.capacidad?.impresoras), 0);

  const areas = ous.map((ou) => ({
    nombre: ou.nombre,
    usuarios: toNonNegativeNumber(ou?.capacidad?.usuarios),
    pcs: toNonNegativeNumber(ou?.capacidad?.ordenadores),
    impresoras: toNonNegativeNumber(ou?.capacidad?.impresoras),
    perifericos: toNonNegativeNumber(ou?.capacidad?.perifericos),
    criticidad: ou.criticidad || 'media'
  }));

  const necesidades = {
    usuarios: totalUsuarios,
    pcs: totalOrdenadores,
    impresoras: totalImpresoras
  };

  const serviciosPackMap = {
    directorio: ['pack_dominio'],
    dns: ['pack_dominio'],
    web: ['pack_web'],
    correo: ['pack_correo'],
    base_datos: ['pack_bases_datos'],
    monitorizacion: ['pack_monitoreo'],
    seguridad: ['pack_seguridad', 'pack_cortafuegos']
  };

  const packsRecomendados = [...new Set(
    serviciosObjetivo.flatMap((servicio) => serviciosPackMap[servicio] || [])
  )];

  return {
    generadoEn: new Date().toISOString(),
    resumen: {
      totalOUs: ous.length,
      totalServicios: serviciosObjetivo.length,
      totalUsuarios,
      totalOrdenadores
    },
    red: {
      necesidades,
      areas
    },
    instalacion: {
      serviciosObjetivo,
      packsRecomendados
    }
  };
}

function buildVersionSnapshot(version, payload) {
  const ous = Array.isArray(payload?.ous) ? payload.ous : [];
  const totalUsuarios = ous.reduce((sum, item) => sum + toNonNegativeNumber(item?.capacidad?.usuarios), 0);
  const totalOrdenadores = ous.reduce((sum, item) => sum + toNonNegativeNumber(item?.capacidad?.ordenadores), 0);

  return {
    version,
    guardadoEn: new Date().toISOString(),
    actualizadoPor: payload?.actualizadoPor || 'sistema',
    resumen: {
      totalOUs: ous.length,
      totalServicios: Array.isArray(payload?.serviciosObjetivo) ? payload.serviciosObjetivo.length : 0,
      totalUsuarios,
      totalOrdenadores
    },
    diseno: {
      organizacion: payload?.organizacion || {},
      serviciosObjetivo: Array.isArray(payload?.serviciosObjetivo) ? payload.serviciosObjetivo : [],
      ous
    }
  };
}

function buildVersionDiff(baseVersion, targetVersion) {
  const base = baseVersion?.diseno || {};
  const target = targetVersion?.diseno || {};

  const baseOus = Array.isArray(base.ous) ? base.ous : [];
  const targetOus = Array.isArray(target.ous) ? target.ous : [];

  const baseIds = new Set(baseOus.map((item) => item.id));
  const targetIds = new Set(targetOus.map((item) => item.id));

  const ousAgregadas = targetOus.filter((item) => !baseIds.has(item.id)).map((item) => item.id);
  const ousEliminadas = baseOus.filter((item) => !targetIds.has(item.id)).map((item) => item.id);

  const cambiosCriticidad = targetOus
    .map((targetOu) => {
      const baseOu = baseOus.find((item) => item.id === targetOu.id);
      if (!baseOu || baseOu.criticidad === targetOu.criticidad) {
        return null;
      }
      return {
        id: targetOu.id,
        from: baseOu.criticidad,
        to: targetOu.criticidad
      };
    })
    .filter(Boolean);

  return {
    fromVersion: baseVersion?.version || null,
    toVersion: targetVersion?.version || null,
    resumen: {
      totalOUsFrom: baseOus.length,
      totalOUsTo: targetOus.length,
      deltaOUs: targetOus.length - baseOus.length,
      totalServiciosFrom: Array.isArray(base.serviciosObjetivo) ? base.serviciosObjetivo.length : 0,
      totalServiciosTo: Array.isArray(target.serviciosObjetivo) ? target.serviciosObjetivo.length : 0
    },
    ousAgregadas,
    ousEliminadas,
    cambiosCriticidad
  };
}

function proyectarExpedientesConAsignaciones(expedientes = [], asignaciones = []) {
  const porId = new Map();

  expedientes.forEach((expediente) => {
    porId.set(String(expediente._id), {
      ...expediente,
      configuracion: {
        ...(expediente.configuracion || {}),
        valores: {
          ...(expediente.configuracion?.valores || {})
        }
      }
    });
  });

  asignaciones.forEach((asignacion) => {
    const expediente = porId.get(String(asignacion.expedienteId));
    if (!expediente) {
      return;
    }

    expediente.configuracion = expediente.configuracion || {};
    expediente.configuracion.valores = expediente.configuracion.valores || {};
    expediente.configuracion.valores.redSugerida = {
      ...(asignacion.subred || {}),
      packTipo: asignacion.packTipo || null,
      origen: 'propuesta_red_v1',
      asignadoEn: new Date().toISOString()
    };
  });

  return [...porId.values()];
}

router.get('/cliente/:clienteId/contexto', async (req, res) => {
  try {
    const { clienteId } = req.params;
    const cliente = await Cliente.findById(clienteId).select('_id nombre').lean();

    if (!cliente) {
      return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
    }

    const [unidades, diseno] = await Promise.all([
      UnidadOrganizativa.find({ clienteId }).lean(),
      OrganizacionDiseno.findOne({ clienteId }).lean()
    ]);

    return res.json({
      success: true,
      data: {
        cliente,
        unidades,
        diseno: diseno || null,
        resumen: {
          totalOUs: unidades.length,
          totalServiciosObjetivo: Array.isArray(diseno?.serviciosObjetivo) ? diseno.serviciosObjetivo.length : 0,
          tieneDiseno: Boolean(diseno)
        }
      }
    });
  } catch (error) {
    console.error('Error obteniendo contexto organizacional:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/cliente/:clienteId/diseno', async (req, res) => {
  try {
    const { clienteId } = req.params;
    const cliente = await Cliente.findById(clienteId).select('_id nombre').lean();

    if (!cliente) {
      return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
    }

    const payload = normalizeDisenoInput(req.body || {});
    const validationError = validateDisenoInput(payload);
    if (validationError) {
      return res.status(400).json({ success: false, error: validationError });
    }

    const current = await OrganizacionDiseno.findOne({ clienteId }).lean();
    const nextVersion = toNonNegativeNumber(current?.versionActual || 0) + 1;
    const versionSnapshot = buildVersionSnapshot(nextVersion, payload);

    const updatePayload = {
      ...payload,
      versionActual: nextVersion,
      ultimaVersion: versionSnapshot
    };

    const pushPayload = {
      historialVersiones: { $each: [versionSnapshot], $slice: -20 }
    };

    if (payload.autochequeo) {
      updatePayload.ultimoAutochequeo = payload.autochequeo;
      pushPayload.historialAutochequeo = { $each: [payload.autochequeo], $slice: -50 };
    }

    delete updatePayload.autochequeo;

    const saved = await OrganizacionDiseno.findOneAndUpdate(
      { clienteId },
      {
        $set: updatePayload,
        $push: pushPayload
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return res.json({ success: true, data: saved });
  } catch (error) {
    console.error('Error guardando diseno organizacional:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/cliente/:clienteId/diseno/versiones', async (req, res) => {
  try {
    const { clienteId } = req.params;
    const cliente = await Cliente.findById(clienteId).select('_id nombre').lean();

    if (!cliente) {
      return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
    }

    const diseno = await OrganizacionDiseno.findOne({ clienteId }).lean();
    if (!diseno) {
      return res.status(400).json({ success: false, error: 'No existe diseno organizacional para consultar versiones' });
    }

    return res.json({
      success: true,
      data: {
        cliente,
        versionActual: diseno.versionActual || 0,
        ultimaVersion: diseno.ultimaVersion || null,
        historialVersiones: Array.isArray(diseno.historialVersiones) ? diseno.historialVersiones : []
      }
    });
  } catch (error) {
    console.error('Error obteniendo versiones de diseno organizacional:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/cliente/:clienteId/diseno/comparar-versiones', async (req, res) => {
  try {
    const { clienteId } = req.params;
    const fromVersion = toNonNegativeNumber(req.body?.fromVersion);
    const toVersion = toNonNegativeNumber(req.body?.toVersion);

    if (!fromVersion || !toVersion) {
      return res.status(400).json({ success: false, error: 'fromVersion y toVersion son requeridos' });
    }

    const diseno = await OrganizacionDiseno.findOne({ clienteId }).lean();
    if (!diseno) {
      return res.status(400).json({ success: false, error: 'No existe diseno organizacional para comparar versiones' });
    }

    const history = Array.isArray(diseno.historialVersiones) ? diseno.historialVersiones : [];
    const baseVersion = history.find((item) => item.version === fromVersion);
    const targetVersion = history.find((item) => item.version === toVersion);

    if (!baseVersion || !targetVersion) {
      return res.status(404).json({ success: false, error: 'Una o ambas versiones no existen en el historial' });
    }

    return res.json({
      success: true,
      data: buildVersionDiff(baseVersion, targetVersion)
    });
  } catch (error) {
    console.error('Error comparando versiones de diseno organizacional:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/cliente/:clienteId/autochequeo-analytics', async (req, res) => {
  try {
    const { clienteId } = req.params;
    const cliente = await Cliente.findById(clienteId).select('_id nombre').lean();

    if (!cliente) {
      return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
    }

    const diseno = await OrganizacionDiseno.findOne({ clienteId }).lean();
    if (!diseno) {
      return res.status(400).json({ success: false, error: 'No existe diseno organizacional para analytics' });
    }

    const historial = Array.isArray(diseno.historialAutochequeo)
      ? diseno.historialAutochequeo
      : [];

    const totalSnapshots = historial.length;
    const scorePromedio = totalSnapshots
      ? Number((historial.reduce((acc, item) => acc + Number(item?.score || 0), 0) / totalSnapshots).toFixed(2))
      : 0;

    const ultimo = totalSnapshots ? historial[totalSnapshots - 1] : null;
    const primero = totalSnapshots ? historial[0] : null;
    const tendenciaDelta = totalSnapshots > 1
      ? Number((Number(ultimo?.score || 0) - Number(primero?.score || 0)).toFixed(2))
      : 0;

    const distribucionEstado = historial.reduce((acc, item) => {
      const estado = normalizeKey(item?.estado || 'desconocido') || 'desconocido';
      acc[estado] = (acc[estado] || 0) + 1;
      return acc;
    }, {});

    const ruleMap = new Map();
    historial.forEach((snapshot) => {
      const rules = Array.isArray(snapshot?.reglasDisparadas) ? snapshot.reglasDisparadas : [];
      rules.forEach((rule) => {
        const codigo = normalizeText(rule?.codigo);
        if (!codigo) {
          return;
        }

        const current = ruleMap.get(codigo) || {
          codigo,
          severidad: normalizeKey(rule?.severidad || ''),
          titulo: normalizeText(rule?.titulo || ''),
          apariciones: 0
        };
        current.apariciones += 1;
        ruleMap.set(codigo, current);
      });
    });

    const topReglas = [...ruleMap.values()]
      .sort((a, b) => b.apariciones - a.apariciones)
      .slice(0, 8);

    const ultimosScores = historial
      .slice(-10)
      .map((item) => ({
        generadoEn: item?.generadoEn || null,
        score: Number(item?.score || 0),
        estado: normalizeKey(item?.estado || 'desconocido')
      }));

    return res.json({
      success: true,
      data: {
        cliente,
        resumen: {
          totalSnapshots,
          scorePromedio,
          scoreActual: Number(ultimo?.score || 0),
          estadoActual: normalizeKey(ultimo?.estado || 'desconocido'),
          tendenciaDelta
        },
        distribucionEstado,
        topReglas,
        ultimosScores
      }
    });
  } catch (error) {
    console.error('Error obteniendo analytics de autochequeo:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/cliente/:clienteId/publicar-diseno', async (req, res) => {
  try {
    const { clienteId } = req.params;
    const dryRun = Boolean(req.body?.dryRun);
    const incluirAsignacionServidores = req.body?.incluirAsignacionServidores !== false;
    const incluirAplicacionRedes = req.body?.incluirAplicacionRedes !== false;
    const incluirAsignacionIps = req.body?.incluirAsignacionIps !== false;
    const incluirSugerenciaHardwareRed = req.body?.incluirSugerenciaHardwareRed === true;

    const cliente = await Cliente.findById(clienteId).select('_id nombre').lean();
    if (!cliente) {
      return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
    }

    const diseno = await OrganizacionDiseno.findOne({ clienteId }).lean();
    if (!diseno) {
      return res.status(400).json({ success: false, error: 'No existe diseno organizacional para publicar' });
    }

    if (normalizeKey(diseno?.ultimoAutochequeo?.estado) !== 'aprobado') {
      return res.status(400).json({
        success: false,
        error: 'El autochequeo no esta aprobado. Corrige bloqueos antes de publicar.'
      });
    }

    const derivacion = diseno.ultimaDerivacion || buildDerivacionFromDiseno(diseno);
    const redDesignPayload = {
      necesidades: derivacion?.red?.necesidades || {},
      areas: derivacion?.red?.areas || [],
      observaciones: `Publicado desde wizard organizacional (${new Date().toISOString()})`,
      actualizadoPor: diseno.actualizadoPor || 'sistema',
      version: 1,
      fechaCalculoSolicitado: new Date()
    };

    const redInternals = redRoutes.__internals || {};
    if (typeof redInternals.buildPropuestaFromDiseno !== 'function') {
      return res.status(500).json({ success: false, error: 'Motor de propuesta de red no disponible' });
    }

    const propuesta = redInternals.buildPropuestaFromDiseno(redDesignPayload);
    const propuestaSnapshot = typeof redInternals.buildProposalSnapshot === 'function'
      ? redInternals.buildProposalSnapshot(propuesta, 'publicacion_wizard')
      : propuesta;

    let aplicacionRedes = null;
    if ((incluirAplicacionRedes || incluirAsignacionIps) && typeof redInternals.applyProposalToCliente === 'function') {
      aplicacionRedes = await redInternals.applyProposalToCliente({
        clienteId,
        propuesta: propuestaSnapshot,
        apply: !dryRun && incluirAplicacionRedes
      });
    }

    let asignacionServidores = null;
    if (incluirAsignacionServidores && typeof redInternals.suggestServerAssignmentsFromProposal === 'function') {
      const assignmentPreview = await redInternals.suggestServerAssignmentsFromProposal({
        clienteId,
        propuesta: propuestaSnapshot,
        apply: !dryRun
      });

      asignacionServidores = {
        asignaciones: assignmentPreview.asignaciones.slice(0, 100),
        expedientes: assignmentPreview.expedientes,
        resumen: assignmentPreview.resumen
      };
    }

    let asignacionIps = null;
    if (incluirAsignacionIps && typeof redInternals.suggestIpAssignmentsFromCliente === 'function') {
      const expedientesProyectados = asignacionServidores
        ? proyectarExpedientesConAsignaciones(
          asignacionServidores.expedientes,
          asignacionServidores.asignaciones.map((item) => ({
            expedienteId: item.expedienteId,
            packTipo: item.packTipo,
            subred: item.subred
          }))
        )
        : null;

      const ipPreview = await redInternals.suggestIpAssignmentsFromCliente({
        clienteId,
        apply: !dryRun,
        redesOverride: aplicacionRedes?.redes || undefined,
        expedientesOverride: expedientesProyectados || undefined
      });

      asignacionIps = {
        asignadas: ipPreview.asignadas.slice(0, 100),
        omitidas: ipPreview.omitidas.slice(0, 100),
        resumen: ipPreview.resumen
      };
    }

    let sugerenciaHardwareRed = null;
    if (incluirSugerenciaHardwareRed && typeof redInternals.suggestHardwareForRedFromPropuesta === 'function') {
      sugerenciaHardwareRed = await redInternals.suggestHardwareForRedFromPropuesta({
        clienteId,
        propuesta: propuestaSnapshot,
        apply: !dryRun,
        actor: diseno.actualizadoPor || 'publicacion_wizard'
      });
    }

    if (dryRun) {
      return res.json({
        success: true,
        data: {
          cliente,
          dryRun: true,
          incluirAsignacionServidores,
          incluirAplicacionRedes,
          incluirAsignacionIps,
          incluirSugerenciaHardwareRed,
          redDesignPayload,
          propuesta: propuestaSnapshot,
          aplicacionRedes,
          asignacionServidores,
          asignacionIps,
          sugerenciaHardwareRed,
          resumen: {
            totalSubredes: propuesta?.resumen?.totalSubredes || 0,
            totalHostsEstimados: propuesta?.resumen?.totalHostsEstimados || 0,
            totalRedesAplicadas: aplicacionRedes?.resumen?.totalCreadas || 0,
            totalServidoresAsignados: asignacionServidores?.resumen?.totalAsignados || 0,
            totalIpsAsignadas: asignacionIps?.resumen?.totalAsignadas || 0,
            coberturaHardwareCompleta: Boolean(sugerenciaHardwareRed?.resumen?.coberturaCompleta)
          }
        }
      });
    }

    await RedDisenoOrganizacion.findOneAndUpdate(
      { clienteId },
      { $set: redDesignPayload },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    if (typeof redInternals.persistProposalSnapshot === 'function') {
      await redInternals.persistProposalSnapshot(clienteId, propuesta, 'publicacion_wizard');
    }

    return res.json({
      success: true,
      data: {
        cliente,
        dryRun: false,
        incluirAsignacionServidores,
        incluirAplicacionRedes,
        incluirAsignacionIps,
        incluirSugerenciaHardwareRed,
        propuesta: propuestaSnapshot,
        aplicacionRedes,
        asignacionServidores,
        asignacionIps,
        sugerenciaHardwareRed,
        resumen: {
          totalSubredes: propuesta?.resumen?.totalSubredes || 0,
          totalHostsEstimados: propuesta?.resumen?.totalHostsEstimados || 0,
          totalRedesAplicadas: aplicacionRedes?.resumen?.totalCreadas || 0,
          totalServidoresAsignados: asignacionServidores?.resumen?.totalAsignados || 0,
          totalIpsAsignadas: asignacionIps?.resumen?.totalAsignadas || 0,
          coberturaHardwareCompleta: Boolean(sugerenciaHardwareRed?.resumen?.coberturaCompleta)
        }
      }
    });
  } catch (error) {
    console.error('Error publicando diseno organizacional:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/cliente/:clienteId/derivar', async (req, res) => {
  try {
    const { clienteId } = req.params;
    const cliente = await Cliente.findById(clienteId).select('_id nombre').lean();

    if (!cliente) {
      return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
    }

    const diseno = await OrganizacionDiseno.findOne({ clienteId }).lean();
    if (!diseno) {
      return res.status(400).json({ success: false, error: 'No existe diseno organizacional para derivar' });
    }

    const derivacion = buildDerivacionFromDiseno(diseno);

    await OrganizacionDiseno.findOneAndUpdate(
      { clienteId },
      {
        $set: { ultimaDerivacion: derivacion },
        $push: { historialDerivaciones: { $each: [derivacion], $slice: -10 } }
      },
      { new: false }
    );

    return res.json({
      success: true,
      data: {
        cliente,
        derivacion,
        resumen: derivacion.resumen
      }
    });
  } catch (error) {
    console.error('Error derivando diseno organizacional:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener todas las OU de un cliente
router.get('/cliente/:clienteId', async (req, res) => {
  try {
    const unidades = await UnidadOrganizativa.find({ clienteId: req.params.clienteId });
    res.json({ success: true, data: unidades });
  } catch (error) {
    console.error('Error obteniendo OU:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener una OU por ID con sus usuarios
router.get('/:id', async (req, res) => {
  try {
    const unidad = await UnidadOrganizativa.findById(req.params.id);
    if (!unidad) {
      return res.status(404).json({ success: false, error: 'OU no encontrada' });
    }
    res.json({ success: true, data: unidad });
  } catch (error) {
    console.error('Error obteniendo OU:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Crear nueva OU
router.post('/', async (req, res) => {
  try {
    const unidad = new UnidadOrganizativa(req.body);
    await unidad.save();
    res.json({ success: true, data: unidad });
  } catch (error) {
    console.error('Error creando OU:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Actualizar OU
router.put('/:id', async (req, res) => {
  try {
    const unidad = await UnidadOrganizativa.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, data: unidad });
  } catch (error) {
    console.error('Error actualizando OU:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Eliminar OU
router.delete('/:id', async (req, res) => {
  try {
    await UnidadOrganizativa.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'OU eliminada' });
  } catch (error) {
    console.error('Error eliminando OU:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Añadir usuario a OU
router.post('/:id/usuarios', async (req, res) => {
  try {
    const nombre = normalizeText(req.body?.nombre);
    const email = normalizeText(req.body?.email);
    const usuario = normalizeText(req.body?.usuario);

    if (!nombre || !email || !usuario) {
      return res.status(400).json({ success: false, error: 'nombre, email y usuario son requeridos' });
    }

    const unidad = await UnidadOrganizativa.findById(req.params.id);
    if (!unidad) {
      return res.status(404).json({ success: false, error: 'OU no encontrada' });
    }

    const unidadesCliente = await UnidadOrganizativa.find({ clienteId: unidad.clienteId }).lean();
    const duplicate = findUserDuplicate(unidadesCliente, { usuario, email });
    if (duplicate) {
      return res.status(400).json({
        success: false,
        error: `Ya existe un usuario con el mismo ${duplicate.field}`
      });
    }

    unidad.usuarios.push({
      ...req.body,
      nombre,
      email,
      usuario
    });
    await unidad.save();
    res.json({ success: true, data: unidad });
  } catch (error) {
    console.error('Error añadiendo usuario:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Actualizar usuario de OU
router.put('/:id/usuarios/:usuarioId', async (req, res) => {
  try {
    const unidad = await UnidadOrganizativa.findById(req.params.id);
    if (!unidad) {
      return res.status(404).json({ success: false, error: 'OU no encontrada' });
    }

    const userIndex = unidad.usuarios.findIndex((u) => String(u._id) === String(req.params.usuarioId));
    if (userIndex < 0) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }

    const usuarioActual = unidad.usuarios[userIndex];
    const nombre = normalizeText(req.body?.nombre || usuarioActual.nombre);
    const email = normalizeText(req.body?.email || usuarioActual.email);
    const usuario = normalizeText(req.body?.usuario || usuarioActual.usuario);

    if (!nombre || !email || !usuario) {
      return res.status(400).json({ success: false, error: 'nombre, email y usuario son requeridos' });
    }

    const unidadesCliente = await UnidadOrganizativa.find({ clienteId: unidad.clienteId }).lean();
    const duplicate = findUserDuplicate(unidadesCliente, {
      usuario,
      email,
      excludeUserId: req.params.usuarioId
    });

    if (duplicate) {
      return res.status(400).json({
        success: false,
        error: `Ya existe un usuario con el mismo ${duplicate.field}`
      });
    }

    unidad.usuarios[userIndex] = {
      ...usuarioActual.toObject(),
      ...req.body,
      nombre,
      email,
      usuario
    };

    await unidad.save();
    res.json({ success: true, data: { usuario: unidad.usuarios[userIndex], unidad } });
  } catch (error) {
    console.error('Error actualizando usuario:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Eliminar usuario de OU
router.delete('/:id/usuarios/:usuarioId', async (req, res) => {
  try {
    const unidad = await UnidadOrganizativa.findById(req.params.id);
    if (!unidad) {
      return res.status(404).json({ success: false, error: 'OU no encontrada' });
    }
    unidad.usuarios = unidad.usuarios.filter(u => u._id.toString() !== req.params.usuarioId);
    await unidad.save();
    res.json({ success: true, data: unidad });
  } catch (error) {
    console.error('Error eliminando usuario:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Mover usuario entre OUs del mismo cliente
router.post('/mover-usuario', async (req, res) => {
  try {
    const { clienteId, usuarioId, fromOuId, toOuId } = req.body || {};

    if (!clienteId || !usuarioId || !fromOuId || !toOuId) {
      return res.status(400).json({
        success: false,
        error: 'clienteId, usuarioId, fromOuId y toOuId son requeridos'
      });
    }

    if (String(fromOuId) === String(toOuId)) {
      return res.status(400).json({ success: false, error: 'La OU destino debe ser diferente a la OU origen' });
    }

    const [fromOu, toOu] = await Promise.all([
      UnidadOrganizativa.findById(fromOuId),
      UnidadOrganizativa.findById(toOuId)
    ]);

    if (!fromOu) {
      return res.status(404).json({ success: false, error: 'OU origen no encontrada' });
    }
    if (!toOu) {
      return res.status(404).json({ success: false, error: 'OU destino no encontrada' });
    }

    if (String(fromOu.clienteId) !== String(clienteId) || String(toOu.clienteId) !== String(clienteId)) {
      return res.status(400).json({ success: false, error: 'Las OUs no pertenecen al cliente indicado' });
    }

    const userIndex = fromOu.usuarios.findIndex((u) => String(u._id) === String(usuarioId));
    if (userIndex < 0) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado en la OU origen' });
    }

    const usuario = fromOu.usuarios[userIndex];
    const usuarioLogin = String(usuario.usuario || '').toLowerCase();

    if (toOu.usuarios.some((u) => String(u.usuario || '').toLowerCase() === usuarioLogin)) {
      return res.status(400).json({ success: false, error: 'Ya existe un usuario con ese login en la OU destino' });
    }

    fromOu.usuarios.splice(userIndex, 1);
    toOu.usuarios.push(usuario);

    await Promise.all([fromOu.save(), toOu.save()]);

    res.json({
      success: true,
      data: {
        usuarioId: String(usuario._id),
        fromOuId: String(fromOu._id),
        toOuId: String(toOu._id)
      }
    });
  } catch (error) {
    console.error('Error moviendo usuario entre OUs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Estadísticas de OU por cliente
router.get('/cliente/:clienteId/estadisticas', async (req, res) => {
  try {
    const unidades = await UnidadOrganizativa.find({ clienteId: req.params.clienteId });
    const totalUsuarios = unidades.reduce((sum, u) => sum + u.usuarios.length, 0);
    res.json({ 
      success: true, 
      data: { 
        totalUnidades: unidades.length, 
        totalUsuarios,
        unidades 
      } 
    });
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
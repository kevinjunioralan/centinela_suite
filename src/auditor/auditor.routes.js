const express = require('express');
const router = express.Router();
const AuditoriaService = require('../auditoria/AuditoriaService');
const EventoAuditoria = require('../auditoria/models/EventoAuditoria');

const auditoriaService = new AuditoriaService();
const AUDITOR_SUNSET_ISO = process.env.AUDITOR_LEGACY_SUNSET || '2026-12-31T23:59:59Z';
const AUDITOR_SUCCESSOR_PATH = '/api/centinela-banco-pruebas/auditoria';

function buildDeprecationMeta() {
  return {
    deprecated: true,
    sunset: AUDITOR_SUNSET_ISO,
    successor: AUDITOR_SUCCESSOR_PATH,
    message: 'La ruta /auditor esta deprecada. Migrar a /auditoria.'
  };
}

router.use((req, res, next) => {
  // Ruta legacy mantenida por compatibilidad; usar /auditoria para nuevas integraciones.
  res.set('X-Centinela-Legacy', 'auditor-route-backed-by-auditoria');
  res.set('Deprecation', 'true');
  res.set('Sunset', new Date(AUDITOR_SUNSET_ISO).toUTCString());
  res.set('Link', `<${AUDITOR_SUCCESSOR_PATH}>; rel="successor-version"`);
  res.set('Warning', '299 centinela "La ruta /auditor esta deprecada; migrar a /auditoria"');
  next();
});

// Obtener eventos auditados
router.get('/eventos', async (req, res) => {
  try {
    const {
      limit = 50,
      offset = 0,
      tipo,
      modulo,
      usuario,
      expedienteId,
      fechaInicio,
      fechaFin
    } = req.query;

    const resultado = await auditoriaService.obtenerEventos({
      tipo,
      modulo,
      usuario,
      expedienteId,
      fechaInicio,
      fechaFin,
      limit: Number.parseInt(limit, 10),
      offset: Number.parseInt(offset, 10)
    });

    res.json({
      success: true,
      data: resultado.items,
      pagination: {
        total: resultado.total,
        limit: resultado.limit,
        offset: resultado.offset,
        hasMore: resultado.hasMore
      },
      deprecation: buildDeprecationMeta()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      deprecation: buildDeprecationMeta()
    });
  }
});

// Registrar nuevo evento de auditoría
router.post('/eventos/registrar', async (req, res) => {
  try {
    const { expedienteId, tipo, datos, usuario, modulo } = req.body;

    if (!tipo || !datos || typeof datos !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'tipo y datos(object) son requeridos',
        deprecation: buildDeprecationMeta()
      });
    }

    const evento = await auditoriaService.registrarEvento(tipo, usuario || 'sistema', {
      modulo: modulo || 'auditoria',
      expedienteId: expedienteId || null,
      detalles: datos,
      ip: req.ip
    });

    if (!evento) {
      return res.status(500).json({
        success: false,
        error: 'No se pudo registrar el evento',
        deprecation: buildDeprecationMeta()
      });
    }

    res.json({
      success: true,
      data: {
        success: true,
        expedienteId: expedienteId || null,
        evento,
        mensaje: 'Evento registrado exitosamente'
      },
      deprecation: buildDeprecationMeta()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      deprecation: buildDeprecationMeta()
    });
  }
});

// Obtener estadísticas de eventos
router.get('/eventos/estadisticas', async (req, res) => {
  try {
    const estadisticas = await auditoriaService.obtenerEstadisticas();
    res.json({
      success: true,
      data: estadisticas,
      deprecation: buildDeprecationMeta()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      deprecation: buildDeprecationMeta()
    });
  }
});

// Entrenar motor de aprendizaje con eventos recientes
router.post('/aprendizaje/entrenar', async (req, res) => {
  try {
    const { limite = 100 } = req.body;
    const safeLimit = Math.min(Math.max(Number.parseInt(limite, 10) || 100, 1), 1000);
    const eventosRecientes = await EventoAuditoria.find()
      .sort({ fecha: -1 })
      .limit(safeLimit)
      .lean();

    const porTipo = {};
    const porModulo = {};

    for (const evt of eventosRecientes) {
      porTipo[evt.tipo] = (porTipo[evt.tipo] || 0) + 1;
      porModulo[evt.modulo] = (porModulo[evt.modulo] || 0) + 1;
    }

    const resultado = {
      procesados: eventosRecientes.length,
      ventana: safeLimit,
      topTipos: Object.entries(porTipo).sort((a, b) => b[1] - a[1]).slice(0, 10),
      topModulos: Object.entries(porModulo).sort((a, b) => b[1] - a[1]).slice(0, 10),
      generadoEn: new Date().toISOString()
    };

    res.json({
      success: true,
      data: resultado,
      deprecation: buildDeprecationMeta()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      deprecation: buildDeprecationMeta()
    });
  }
});

// Obtener patrones detectados por el motor de aprendizaje
router.get('/aprendizaje/patrones', async (req, res) => {
  try {
    const { limite = 300 } = req.query;
    const safeLimit = Math.min(Math.max(Number.parseInt(limite, 10) || 300, 50), 2000);

    const agregados = await EventoAuditoria.aggregate([
      { $sort: { fecha: -1 } },
      { $limit: safeLimit },
      {
        $group: {
          _id: { tipo: '$tipo', modulo: '$modulo' },
          total: { $sum: 1 },
          ultimaFecha: { $max: '$fecha' }
        }
      },
      { $sort: { total: -1 } },
      { $limit: 30 }
    ]);

    const patrones = {
      totalAnalizados: safeLimit,
      frecuentes: agregados.map((item) => ({
        tipo: item._id.tipo,
        modulo: item._id.modulo,
        total: item.total,
        ultimaFecha: item.ultimaFecha
      })),
      generadoEn: new Date().toISOString()
    };

    res.json({
      success: true,
      data: patrones,
      deprecation: buildDeprecationMeta()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      deprecation: buildDeprecationMeta()
    });
  }
});

module.exports = router;
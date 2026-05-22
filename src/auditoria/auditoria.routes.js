const express = require('express');
const router = express.Router();
const AuditoriaService = require('../auditoria/AuditoriaService');
const EventoAuditoria = require('../auditoria/models/EventoAuditoria');

const auditoriaService = new AuditoriaService();

function esPeticionLocal(req) {
  const ip = req.ip || req.connection?.remoteAddress || '';
  return ip.includes('127.0.0.1') || ip.includes('::1') || ip === 'localhost';
}

function purgaHabilitada(req, res) {
  if (process.env.NODE_ENV === 'production') {
    res.status(403).json({ success: false, error: 'No permitido en producción' });
    return false;
  }

  if (process.env.ALLOW_AUDITORIA_PURGE !== 'true') {
    res.status(403).json({ success: false, error: 'Purga deshabilitada por configuración' });
    return false;
  }

  if (!esPeticionLocal(req)) {
    res.status(403).json({ success: false, error: 'Purga permitida solo desde localhost' });
    return false;
  }

  return true;
}

// Obtener eventos con filtros (MODIFICADO: añadir filtro modulo)
router.get('/eventos', async (req, res) => {
  try {
    const { tipo, usuario, expedienteId, modulo, fechaInicio, fechaFin, limit, offset } = req.query;
    const limite = Number.parseInt(limit, 10);
    const desde = Number.parseInt(offset, 10);

    const eventos = await auditoriaService.obtenerEventos({
      tipo,
      usuario,
      expedienteId,
      modulo,        // ← NUEVO
      fechaInicio,
      fechaFin,
      limit: Number.isInteger(limite) ? limite : 100,
      offset: Number.isInteger(desde) ? desde : 0
    });
    res.json({ success: true, data: eventos });
  } catch (error) {
    console.error('Error obteniendo eventos:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener estadísticas
router.get('/estadisticas', async (req, res) => {
  try {
    const estadisticas = await auditoriaService.obtenerEstadisticas();
    res.json({ success: true, data: estadisticas });
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 🔥 NUEVO: Resumen rápido para dashboard
router.get('/resumen', async (req, res) => {
  try {
    const resumen = await auditoriaService.obtenerResumen();
    res.json({ success: true, data: resumen });
  } catch (error) {
    console.error('Error obteniendo resumen:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Registrar evento manual (MODIFICADO: añadir campo modulo)
router.post('/eventos/registrar', async (req, res) => {
  try {
    const { tipo, modulo, usuario, expedienteId, habitacionId, detalles, ip } = req.body;

    if (!tipo || !usuario) {
      return res.status(400).json({ success: false, error: 'tipo y usuario son requeridos' });
    }

    const evento = await auditoriaService.registrarEvento(tipo, usuario, {
      modulo,        // ← NUEVO
      expedienteId,
      habitacionId,
      detalles,
      ip
    });

    if (!evento) {
      return res.status(500).json({ success: false, error: 'No se pudo registrar el evento' });
    }

    res.json({ success: true, data: evento });
  } catch (error) {
    console.error('Error registrando evento:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 🔥 NUEVO: Limpiar datos de prueba (solo desarrollo)
router.delete('/limpiar-pruebas', async (req, res) => {
  if (!purgaHabilitada(req, res)) return;
  
  try {
    // Eliminar eventos de prueba (con usuario 'test' o detalles específicos)
    const resultado = await EventoAuditoria.deleteMany({
      $or: [
        { usuario: 'test' },
        { usuario: 'TEST' },
        { 'detalles.esPrueba': true }
      ]
    });
    
    res.json({ 
      success: true, 
      message: `Se eliminaron ${resultado.deletedCount} eventos de prueba`,
      data: { eliminados: resultado.deletedCount } 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 🔥 NUEVO: Limpiar todos los eventos de auditoría (solo desarrollo)
router.delete('/limpiar-todo', async (req, res) => {
  if (!purgaHabilitada(req, res)) return;
  
  // Verificar contraseña de confirmación
  const { clave } = req.body;
  if (clave !== 'borrar_todo_confirma') {
    return res.status(401).json({ success: false, error: 'Clave de confirmación incorrecta' });
  }
  
  try {
    const resultado = await EventoAuditoria.deleteMany({});
    
    res.json({ 
      success: true, 
      message: `Se eliminaron ${resultado.deletedCount} eventos de auditoría`,
      data: { eliminados: resultado.deletedCount } 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
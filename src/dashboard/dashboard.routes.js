const express = require('express');
const router = express.Router();

const Expediente = require('../expediente/models/Expediente');
const Cliente = require('../expediente/models/Cliente');
const EventoAuditoria = require('../auditoria/models/EventoAuditoria');
const RobotConfig = require('../robot/models/RobotConfig');

// ============ 1. RESUMEN GLOBAL ============
router.get('/resumen', async (req, res) => {
  try {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const accesosHoy = await EventoAuditoria.countDocuments({
      modulo: 'auth',
      tipo: 'login',
      fecha: { $gte: hoy }
    });

    const [
      totalClientes,
      clientesActivos,
      totalServidores,
      servidoresEnCustodia,
      servidoresInstalando,
      servidoresEnPruebas,
      alertasCriticas,
      alertasAdvertencia,
      alertasUltimaHora,
      eventosUltimas24h,
      usuariosUnicos,
      robotsActivos
    ] = await Promise.all([
      Cliente.countDocuments({ eliminado: { $ne: true } }),
      Cliente.countDocuments({ estado: 'activo', eliminado: { $ne: true } }),
      Expediente.countDocuments({ eliminado: { $ne: true } }),
      Expediente.countDocuments({ origen: 'mantenimiento', eliminado: { $ne: true } }),
      Expediente.countDocuments({ origen: 'instalacion', 'instalacion.estado': { $in: ['planificando', 'conectando', 'instalando'] }, eliminado: { $ne: true } }),
      Expediente.countDocuments({ origen: 'pruebas', estado: { $in: ['en_pruebas', 'pruebas'] }, eliminado: { $ne: true } }),
      EventoAuditoria.countDocuments({ 'detalles.tipo': 'error', fecha: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
      EventoAuditoria.countDocuments({ 'detalles.tipo': 'advertencia', fecha: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
      EventoAuditoria.countDocuments({ fecha: { $gte: new Date(Date.now() - 60 * 60 * 1000) } }),
      EventoAuditoria.countDocuments({ fecha: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
      EventoAuditoria.distinct('usuario', { fecha: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
      RobotConfig.countDocuments({ activo: true })
    ]);

    res.json({
      success: true,
      data: {
        clientes: { total: totalClientes, activos: clientesActivos },
        servidores: { total: totalServidores, enCustodia: servidoresEnCustodia, instalando: servidoresInstalando, enPruebas: servidoresEnPruebas },
        alertas: { criticas: alertasCriticas, advertencias: alertasAdvertencia, ultimaHora: alertasUltimaHora },
        actividad: { eventosUltimas24h: eventosUltimas24h, usuariosActivos: usuariosUnicos.length, robotsActivos: robotsActivos, accesosHoy: accesosHoy },
        aprendizaje: { patronesDetectados: 0, totalEventosAuditables: await EventoAuditoria.countDocuments() }
      }
    });
  } catch (error) {
    console.error('Error en GET /resumen:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ 2. ACTIVIDAD RECIENTE ============
router.get('/actividad', async (req, res) => {
  try {
    const limite = parseInt(req.query.limite) || 20;
    const eventos = await EventoAuditoria.find().sort({ fecha: -1 }).limit(limite).lean();
    res.json({ success: true, data: eventos });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ 3. SERVICIOS ============
router.get('/servicios', async (req, res) => {
  try {
    const totalExpedientes = await Expediente.countDocuments({ eliminado: { $ne: true } });
    const enCustodia = await Expediente.countDocuments({ origen: 'mantenimiento', eliminado: { $ne: true } });
    const robots = await RobotConfig.find({}).lean();
    
    res.json({
      success: true,
      data: { totalExpedientes, enCustodia, robots: robots.length }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
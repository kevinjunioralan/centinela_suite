const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Expediente = require('../expediente/models/Expediente');
const Metrica = require('../expediente/models/Metrica');
const Alerta = require('../expediente/models/Alerta');

// ============ RUTAS DE MANTENIMIENTO ============

// Obtener todos los expedientes en mantenimiento
router.get('/expedientes', async (req, res) => {
  try {
    const expedientes = await Expediente.find({ origen: 'mantenimiento' })
      .select('nombre servidor mantenimiento.estadoCustodia mantenimiento.ultimaConexion diagnostico.score');
    res.json({ success: true, data: expedientes });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener estado de un expediente
router.get('/expediente/:id/estado', async (req, res) => {
  try {
    const expediente = await Expediente.findById(req.params.id);
    if (!expediente) {
      return res.status(404).json({ success: false, error: 'Expediente no encontrado' });
    }
    res.json({ 
      success: true, 
      data: {
        estadoCustodia: expediente.mantenimiento?.estadoCustodia || 'pendiente',
        ultimaConexion: expediente.mantenimiento?.ultimaConexion
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener métricas de un expediente
router.get('/expediente/:id/metricas', async (req, res) => {
  try {
    const { id } = req.params;
    const limite = parseInt(req.query.limite, 10) || 20;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, error: 'ID de expediente invalido' });
    }

    const expedienteId = new mongoose.Types.ObjectId(id);

    const metricas = await Metrica.aggregate([
      {
        $match: {
          expedienteId,
          tipo: { $in: ['cpu', 'ram', 'disco'] }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%dT%H:%M:%S.000Z',
              date: '$timestamp'
            }
          },
          timestamp: { $max: '$timestamp' },
          cpu: {
            $max: {
              $cond: [{ $eq: ['$tipo', 'cpu'] }, '$valor', null]
            }
          },
          memoria: {
            $max: {
              $cond: [{ $eq: ['$tipo', 'ram'] }, '$valor', null]
            }
          },
          disco: {
            $max: {
              $cond: [{ $eq: ['$tipo', 'disco'] }, '$valor', null]
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          timestamp: 1,
          cpu: { $ifNull: ['$cpu', 0] },
          memoria: { $ifNull: ['$memoria', 0] },
          disco: { $ifNull: ['$disco', 0] }
        }
      },
      { $sort: { timestamp: -1 } },
      { $limit: limite },
      { $sort: { timestamp: 1 } }
    ]);

    res.json({ success: true, data: metricas });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener alertas de un expediente
router.get('/expediente/:id/alertas', async (req, res) => {
  try {
    const { id } = req.params;
    const limite = parseInt(req.query.limite, 10) || 20;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, error: 'ID de expediente invalido' });
    }

    const alertas = await Alerta.find({ expedienteId: id })
      .sort({ timestamp: -1 })
      .limit(limite)
      .lean();

    const normalizadas = alertas.map(alerta => ({
      ...alerta,
      fecha: alerta.timestamp
    }));

    res.json({ success: true, data: normalizadas });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener alertas recientes
router.get('/alertas/recientes', async (req, res) => {
  try {
    const limite = parseInt(req.query.limite) || 10;

    const expedientesMantenimiento = await Expediente.find({ origen: 'mantenimiento' })
      .select('_id nombre')
      .lean();

    const expedienteIds = expedientesMantenimiento.map(e => e._id);
    const nombresPorExpediente = new Map(expedientesMantenimiento.map(e => [String(e._id), e.nombre]));

    const alertas = await Alerta.find({ expedienteId: { $in: expedienteIds } })
      .sort({ timestamp: -1 })
      .limit(limite)
      .lean();

    const normalizadas = alertas.map(alerta => ({
      id: alerta._id,
      tipo: alerta.tipo || 'info',
      mensaje: alerta.mensaje,
      fecha: alerta.timestamp,
      expedienteId: alerta.expedienteId,
      expedienteNombre: nombresPorExpediente.get(String(alerta.expedienteId)) || 'Sin nombre'
    }));

    res.json({ success: true, data: normalizadas });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Estadísticas globales
router.get('/estadisticas', async (req, res) => {
  try {
    const expedientes = await Expediente.find({ origen: 'mantenimiento' }).select('_id nombre mantenimiento');

    const totalEnCustodia = expedientes.length;
    const conectados = expedientes.filter(e => e.mantenimiento?.estadoCustodia === 'conectado').length;

    const expedienteIds = expedientes.map(e => e._id);

    const promediosMetricas = await Metrica.aggregate([
      {
        $match: {
          expedienteId: { $in: expedienteIds },
          tipo: { $in: ['cpu', 'ram', 'disco'] }
        }
      },
      {
        $group: {
          _id: '$tipo',
          promedio: { $avg: '$valor' }
        }
      }
    ]);

    const promedioPorTipo = promediosMetricas.reduce((acc, item) => {
      acc[item._id] = item.promedio;
      return acc;
    }, {});

    const topAlertasAgg = await Alerta.aggregate([
      {
        $match: {
          expedienteId: { $in: expedienteIds }
        }
      },
      {
        $group: {
          _id: '$expedienteId',
          totalAlertas: { $sum: 1 }
        }
      },
      { $sort: { totalAlertas: -1 } },
      { $limit: 5 }
    ]);

    const nombresPorExpediente = new Map(expedientes.map(e => [String(e._id), e.nombre]));
    const topAlertas = topAlertasAgg.map(item => ({
      id: item._id,
      nombre: nombresPorExpediente.get(String(item._id)) || 'Sin nombre',
      totalAlertas: item.totalAlertas
    }));

    const conAlertasCriticas = await Alerta.distinct('expedienteId', {
      expedienteId: { $in: expedienteIds },
      tipo: 'error',
      resuelta: false
    });
    
    res.json({
      success: true,
      data: {
        totalEnCustodia,
        conectados,
        conAlertasCriticas: conAlertasCriticas.length,
        promedioCPU: Number((promedioPorTipo.cpu || 0).toFixed(1)),
        promedioRAM: Number((promedioPorTipo.ram || 0).toFixed(1)),
        promedioDISCO: Number((promedioPorTipo.disco || 0).toFixed(1)),
        topAlertas
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Detener custodia de un expediente
router.post('/expediente/:id/detener', async (req, res) => {
  try {
    const { id } = req.params;

    const expediente = await Expediente.findById(id);
    if (!expediente) {
      return res.status(404).json({ success: false, error: 'Expediente no encontrado' });
    }

    if (expediente.origen !== 'mantenimiento') {
      return res.status(400).json({ success: false, error: 'Este expediente no está en mantenimiento' });
    }

    if (!expediente.mantenimiento) {
      expediente.mantenimiento = {};
    }

    expediente.mantenimiento.estadoCustodia = 'pendiente';
    expediente.mantenimiento.ultimaConexion = new Date();
    await expediente.save();

    res.json({
      success: true,
      message: 'Custodia detenida correctamente',
      data: {
        expedienteId: expediente._id,
        estadoCustodia: expediente.mantenimiento.estadoCustodia
      }
    });
  } catch (error) {
    console.error('Error deteniendo custodia:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Iniciar validacion/simulacion de carga
router.post('/expediente/:id/validacion/iniciar', async (req, res) => {
  try {
    const { id } = req.params;

    const expediente = await Expediente.findById(id);
    if (!expediente) {
      return res.status(404).json({ success: false, error: 'Expediente no encontrado' });
    }

    if (!expediente.validacion) {
      expediente.validacion = {};
    }

    expediente.validacion.estado = 'en_progreso';
    expediente.validacion.enProgreso = true;
    expediente.validacion.fechaInicio = new Date();
    expediente.validacion.fechaFin = null;
    expediente.validacion.duracionHoras = 0;
    expediente.validacion.pruebasEjecutadas = 0;
    expediente.validacion.pruebasExitosas = 0;
    expediente.validacion.pruebasFallidas = 0;
    expediente.validacion.score = 0;
    expediente.validacion.recomendacion = 'Simulacion en ejecucion';
    expediente.validacion.logs = [{
      timestamp: new Date(),
      mensaje: 'Simulacion de carga iniciada',
      tipo: 'info'
    }];

    await expediente.save();

    res.json({ success: true, data: expediente.validacion });
  } catch (error) {
    console.error('Error iniciando validacion:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener estado de validacion/simulacion
router.get('/expediente/:id/validacion/estado', async (req, res) => {
  try {
    const { id } = req.params;

    const expediente = await Expediente.findById(id);
    if (!expediente) {
      return res.status(404).json({ success: false, error: 'Expediente no encontrado' });
    }

    const validacion = expediente.validacion || { estado: 'pendiente', enProgreso: false };

    if (validacion.enProgreso && validacion.fechaInicio) {
      const ahora = new Date();
      const transcurridoMs = ahora.getTime() - new Date(validacion.fechaInicio).getTime();
      const transcurridoMin = transcurridoMs / 60000;
      const progreso = Math.min(100, Math.floor((transcurridoMs / 300000) * 100));

      expediente.validacion.pruebasEjecutadas = Math.max(expediente.validacion.pruebasEjecutadas || 0, Math.floor(progreso / 4));
      expediente.validacion.pruebasExitosas = Math.floor((expediente.validacion.pruebasEjecutadas || 0) * 0.9);
      expediente.validacion.pruebasFallidas = Math.max(0, (expediente.validacion.pruebasEjecutadas || 0) - (expediente.validacion.pruebasExitosas || 0));
      expediente.validacion.duracionHoras = Number((transcurridoMin / 60).toFixed(2));

      if (progreso >= 100) {
        expediente.validacion.estado = 'completado';
        expediente.validacion.enProgreso = false;
        expediente.validacion.fechaFin = ahora;
        expediente.validacion.score = Math.max(70, 100 - (expediente.validacion.pruebasFallidas || 0));
        expediente.validacion.recomendacion = expediente.validacion.score >= 85 ? 'Apto para mantenimiento continuo' : 'Requiere ajuste de configuracion';
        expediente.validacion.metricas = {
          cpuPromedio: 58,
          cpuMax: 82,
          ramPromedio: 64,
          ramMax: 88,
          tiempoRespuestaPromedio: 210,
          tiempoRespuestaMax: 640
        };
        expediente.validacion.logs = [
          ...(expediente.validacion.logs || []),
          {
            timestamp: ahora,
            mensaje: `Simulacion completada con score ${expediente.validacion.score}%`,
            tipo: 'exito'
          }
        ];
        await expediente.save();
      }

      const data = {
        ...expediente.validacion.toObject(),
        progreso
      };

      return res.json({ success: true, data });
    }

    res.json({ success: true, data: validacion });
  } catch (error) {
    console.error('Error obteniendo estado de validacion:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Reintentar operación de mantenimiento
router.post('/:id/reintentar', async (req, res) => {
  try {
    const { id } = req.params;
    
    const expediente = await Expediente.findById(id);
    if (!expediente) {
      return res.status(404).json({ success: false, error: 'Expediente no encontrado' });
    }
    
    if (expediente.origen !== 'mantenimiento') {
      return res.status(400).json({ success: false, error: 'Este expediente no está en mantenimiento' });
    }
    
    // Registrar acción en auditoría
    const EventoAuditoria = require('../auditoria/models/EventoAuditoria');
    await EventoAuditoria.create({
      tipo: 'reintentar_mantenimiento',
      modulo: 'oraculo',
      expedienteId: id,
      usuario: 'oraculo',
      detalles: { accion: 'reintentar', timestamp: new Date() },
      fecha: new Date()
    });
    
    // Cambiar estado para reintentar
    expediente.mantenimiento.estadoCustodia = 'pendiente';
    expediente.mantenimiento.ultimoReintento = new Date();
    expediente.mantenimiento.intentos = (expediente.mantenimiento.intentos || 0) + 1;
    await expediente.save();
    
    // Aquí iría la lógica real de reintento (reconectar SSH, etc.)
    
    res.json({ 
      success: true, 
      message: 'Reintento programado', 
      data: { intentos: expediente.mantenimiento.intentos }
    });
  } catch (error) {
    console.error('Error en reintentar mantenimiento:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
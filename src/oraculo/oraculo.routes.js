const express = require('express');
const router = express.Router();
const EventoAuditoria = require('../auditoria/models/EventoAuditoria');
const Expediente = require('../expediente/models/Expediente');
const ObservacionOraculo = require('./models/ObservacionOraculo');
const OráculoService = require('./OráculoService');

const oraculoService = new OráculoService();

const AlertasService = require('../alertas/AlertasService');
const alertasService = new AlertasService();


// ============ ENDPOINTS DEL SISTEMA ESPEJO ============

const espejoService = new (require('./EspejoService'))();

// Configurar SSE para eventos en tiempo real
router.get('/alertas/stream', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  
  const callback = (alerta) => {
    res.write(`data: ${JSON.stringify(alerta)}\n\n`);
  };
  
  alertasService.onAlertaCreada(callback);
  
  req.on('close', () => {
    // Remover callback (simplificado)
  });
});

// Obtener alertas
router.get('/alertas', async (req, res) => {
  try {
    const { tipo, origen, modulo, noLeidas, limit, skip, desde, hasta } = req.query;
    const resultado = await alertasService.obtenerAlertas({
      tipo, origen, modulo, noLeidas, limit, skip, desde, hasta
    });
    res.json({ success: true, ...resultado });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obtener resumen
router.get('/alertas/resumen', async (req, res) => {
  try {
    const resumen = await alertasService.obtenerResumen();
    res.json({ success: true, ...resumen });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obtener estadísticas
router.get('/alertas/estadisticas', async (req, res) => {
  try {
    const { dias } = req.query;
    const estadisticas = await alertasService.obtenerEstadisticas(dias || 7);
    res.json({ success: true, ...estadisticas });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Marcar como leída
router.put('/alertas/:id/leer', async (req, res) => {
  try {
    const alerta = await alertasService.marcarLeida(req.params.id);
    res.json({ success: true, alerta });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Marcar todas como leídas
router.put('/alertas/marcar-todas-leidas', async (req, res) => {
  try {
    const resultado = await alertasService.marcarTodasLeidas();
    res.json({ success: true, ...resultado });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Archivar alerta
router.delete('/alertas/:id/archivar', async (req, res) => {
  try {
    const alerta = await alertasService.archivar(req.params.id);
    res.json({ success: true, alerta });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Archivar todas
router.post('/alertas/archivar-todas', async (req, res) => {
  try {
    const resultado = await alertasService.archivarTodas();
    res.json({ success: true, ...resultado });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Limpiar alertas antiguas
router.post('/alertas/limpiar', async (req, res) => {
  try {
    const { dias } = req.body;
    const resultado = await alertasService.limpiarAlertasAntiguas(dias || 30);
    res.json({ success: true, ...resultado });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Eliminar alerta
router.delete('/alertas/:id', async (req, res) => {
  try {
    const resultado = await alertasService.eliminarAlerta(req.params.id);
    res.json({ success: true, ...resultado });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Inicializar espejo
router.post('/espejo/inicializar', async (req, res) => {
  try {
    const resultado = await espejoService.inicializar();
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generar checkpoint
router.post('/espejo/checkpoint', async (req, res) => {
  try {
    const { origen, descripcion } = req.body;
    const checkpoint = await espejoService.generarCheckpoint(origen, { descripcion });
    res.json(checkpoint);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Restaurar checkpoint
router.post('/espejo/restaurar/:checkpointId', async (req, res) => {
  try {
    const { destino } = req.body;
    const resultado = await espejoService.restaurarCheckpoint(req.params.checkpointId, destino);
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Ejecutar switchover
router.post('/espejo/switchover', async (req, res) => {
  try {
    const { motivo, desde } = req.body;
    const resultado = await espejoService.switchover(motivo, desde);
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Hot update - preparar
router.post('/espejo/hotupdate/preparar', async (req, res) => {
  try {
    const { version, codigo } = req.body;
    const resultado = await espejoService.prepararHotUpdate(version, codigo);
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Hot update - probar en espejo
router.post('/espejo/hotupdate/probar', async (req, res) => {
  try {
    const resultado = await espejoService.probarHotUpdate();
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Hot update - desplegar en real
router.post('/espejo/hotupdate/desplegar', async (req, res) => {
  try {
    const resultado = await espejoService.desplegarHotUpdateReal();
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Estado del espejo
router.get('/espejo/estado', async (req, res) => {
  try {
    const estado = await espejoService.obtenerEstadoCompleto();
    res.json(estado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ ENDPOINTS DEL NUEVO ORÁCULO (V2) ============

// Estado completo del Oráculo (salud, anomalías, riesgos, recomendaciones)
router.get('/estado', async (req, res) => {
  try {
    const estado = await oraculoService.obtenerEstadoCompleto();
    res.json({ success: true, data: estado });
  } catch (error) {
    console.error('Error en GET /oraculo/estado:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Salud global del sistema
router.get('/salud', async (req, res) => {
  try {
    const salud = await oraculoService.analizarSaludGlobal();
    res.json({ success: true, data: salud });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Anomalías detectadas
router.get('/anomalias', async (req, res) => {
  try {
    const anomalias = await oraculoService.detectarAnomalias();
    res.json({ success: true, data: anomalias });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Predicciones de riesgo
router.get('/riesgos', async (req, res) => {
  try {
    const riesgos = await oraculoService.predecirRiesgos();
    res.json({ success: true, data: riesgos });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Recomendaciones
router.get('/recomendaciones', async (req, res) => {
  try {
    const recomendaciones = await oraculoService.generarRecomendaciones();
    res.json({ success: true, data: recomendaciones });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Simular fallo (para entrenamiento)
router.post('/simular-fallo', async (req, res) => {
  try {
    const { tipo, entidadId, detalles } = req.body;
    const resultado = await oraculoService.simularFallo(tipo, entidadId, detalles);
    res.json({ success: true, data: resultado });
  } catch (error) {
    console.error('Error simulando fallo:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ ENDPOINTS LEGACY (MANTENIDOS POR COMPATIBILIDAD) ============

// Alertas del sistema (versión legacy)
router.get('/alertas-sistema', async (req, res) => {
  try {
    const alertas = [];
    
    const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000);
    const modulos = ['instalacion', 'mantenimiento', 'robot', 'aprendizaje'];
    
    for (const modulo of modulos) {
      const actividadReciente = await EventoAuditoria.countDocuments({
        modulo,
        fecha: { $gte: haceUnaHora }
      });
      
      if (actividadReciente === 0) {
        alertas.push({
          nivel: 'ADVERTENCIA',
          modulo,
          mensaje: `Módulo ${modulo} sin actividad en la última hora`,
          timestamp: new Date().toISOString()
        });
      }
    }
    
    const expedientes = await Expediente.find({ origen: 'mantenimiento' });
    const servidoresProblema = [];
    
    for (const exp of expedientes) {
      const alertasRecientes = (exp.mantenimiento?.alertas || []).filter(a => {
        return new Date(a.fecha) >= haceUnaHora;
      });
      
      if (alertasRecientes.length > 5) {
        servidoresProblema.push({
          expedienteId: exp._id,
          nombre: exp.nombre,
          alertas: alertasRecientes.length
        });
      }
    }
    
    if (servidoresProblema.length > 0) {
      alertas.push({
        nivel: 'CRÍTICA',
        modulo: 'mantenimiento',
        mensaje: `${servidoresProblema.length} servidores con múltiples alertas`,
        detalles: servidoresProblema,
        timestamp: new Date().toISOString()
      });
    }
    
    const AprendizajeService = require('../aprendizaje/aprendizajeService');
    const aprendizaje = new AprendizajeService();
    const estadisticas = await aprendizaje.obtenerEstadisticasGlobales();
    
    if (estadisticas.criticos > 3) {
      alertas.push({
        nivel: 'ADVERTENCIA',
        modulo: 'aprendizaje',
        mensaje: `${estadisticas.criticos} servidores en estado crítico`,
        timestamp: new Date().toISOString()
      });
    }
    
    const instalacionesFallidas = await EventoAuditoria.countDocuments({
      tipo: 'fin_instalacion_fallo',
      fecha: { $gte: haceUnaHora }
    });
    
    if (instalacionesFallidas > 0) {
      alertas.push({
        nivel: 'ADVERTENCIA',
        modulo: 'instalacion',
        mensaje: `${instalacionesFallidas} instalaciones fallidas en la última hora`,
        timestamp: new Date().toISOString()
      });
    }
    
    res.json({
      success: true,
      data: {
        totalAlertas: alertas.length,
        criticas: alertas.filter(a => a.nivel === 'CRÍTICA').length,
        advertencias: alertas.filter(a => a.nivel === 'ADVERTENCIA').length,
        alertas,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error en GET /alertas-sistema:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Estado de módulos (legacy)
router.get('/estado-modulos', async (req, res) => {
  try {
    const modulos = ['instalacion', 'mantenimiento', 'robot', 'aprendizaje', 'auditoria', 'informes'];
    const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000);
    
    const estados = {};
    
    for (const modulo of modulos) {
      const eventos = await EventoAuditoria.countDocuments({
        modulo,
        fecha: { $gte: haceUnaHora }
      });
      
      const errores = await EventoAuditoria.countDocuments({
        modulo,
        tipo: { $regex: /error|fallo/i },
        fecha: { $gte: haceUnaHora }
      });
      
      estados[modulo] = {
        activo: eventos > 0,
        eventosUltimaHora: eventos,
        erroresUltimaHora: errores,
        salud: errores === 0 ? 'OK' : (errores < 3 ? 'ATENCIÓN' : 'CRÍTICO')
      };
    }
    
    res.json({
      success: true,
      data: {
        modulos: estados,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error en GET /estado-modulos:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Resumen ejecutivo (legacy)
router.get('/resumen-ejecutivo', async (req, res) => {
  try {
    const [totalExpedientes, enMantenimiento, enInstalacion, totalAlertas, eventosHoy] = await Promise.all([
      Expediente.countDocuments({ eliminado: { $ne: true } }),
      Expediente.countDocuments({ origen: 'mantenimiento', eliminado: { $ne: true } }),
      Expediente.countDocuments({ origen: 'instalacion', eliminado: { $ne: true } }),
      EventoAuditoria.countDocuments({
        tipo: { $regex: /error|fallo/i },
        fecha: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }),
      EventoAuditoria.countDocuments({
        fecha: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      })
    ]);
    
    const AprendizajeService = require('../aprendizaje/aprendizajeService');
    const aprendizaje = new AprendizajeService();
    const estadisticas = await aprendizaje.obtenerEstadisticasGlobales();
    
    res.json({
      success: true,
      data: {
        servidores: {
          total: totalExpedientes,
          enMantenimiento,
          enInstalacion
        },
        estadoSalud: {
          saludables: estadisticas.saludables || 0,
          atencion: estadisticas.atencion || 0,
          criticos: estadisticas.criticos || 0
        },
        actividad: {
          alertasHoy: totalAlertas,
          eventosHoy
        },
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error en GET /resumen-ejecutivo:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ OBSERVACIONES DEL ORÁCULO ============

router.post('/observar', async (req, res) => {
  try {
    const { tipo, nivel, modulo, expedienteId, observacion, detalles } = req.body;
    
    if (!tipo || !modulo || !observacion) {
      return res.status(400).json({ 
        success: false, 
        error: 'tipo, modulo y observacion son requeridos' 
      });
    }
    
    const nueva = new ObservacionOraculo({
      tipo,
      nivel: nivel || 'INFO',
      modulo,
      expedienteId,
      observacion,
      detalles: detalles || {}
    });
    
    await nueva.save();
    
    res.json({ success: true, data: nueva });
  } catch (error) {
    console.error('Error en POST /observar:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/observaciones', async (req, res) => {
  try {
    const { modulo, resuelta, limit, tipo } = req.query;
    const query = {};
    if (modulo) query.modulo = modulo;
    if (resuelta !== undefined) query.resuelta = resuelta === 'true';
    if (tipo) query.tipo = tipo;
    
    const observaciones = await ObservacionOraculo.find(query)
      .sort({ fecha: -1 })
      .limit(parseInt(limit) || 50)
      .populate('expedienteId', 'nombre');
    
    res.json({ success: true, data: observaciones });
  } catch (error) {
    console.error('Error en GET /observaciones:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/observaciones/:id/resolver', async (req, res) => {
  try {
    const { id } = req.params;
    const { resuelta } = req.body;
    
    const observacion = await ObservacionOraculo.findByIdAndUpdate(
      id,
      { resuelta: resuelta !== undefined ? resuelta : true },
      { new: true }
    );
    
    if (!observacion) {
      return res.status(404).json({ success: false, error: 'Observación no encontrada' });
    }
    
    res.json({ success: true, data: observacion });
  } catch (error) {
    console.error('Error en PUT /observaciones/:id/resolver:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ ACCIONES DEL ORÁCULO ============

// Obtener modo de observación
router.get('/modo-observacion', async (req, res) => {
  try {
    const modo = await oraculoService.getModoObservacion();
    res.json({ success: true, data: modo });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Cambiar modo de observación
router.post('/modo-observacion', async (req, res) => {
  try {
    const { activo } = req.body;
    const modo = await oraculoService.setModoObservacion(activo);
    res.json({ success: true, data: modo });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Ejecutar una acción
router.post('/ejecutar', async (req, res) => {
  try {
    const { tipo, entidadId, detalles } = req.body;
    const resultado = await oraculoService.ejecutarAccion(tipo, entidadId, detalles);
    res.json({ success: true, data: resultado });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Historial de acciones
router.get('/historial', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const historial = await oraculoService.obtenerHistorialAcciones(limit);
    res.json({ success: true, data: historial });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint para que el Oráculo evalúe y fuerce solución
router.post('/evaluar-y-forzar', async (req, res) => {
  try {
    const { modulo, entidadId, tipoProblema, gravedad } = req.body;
    
    const resultado = await oraculoService.evaluarYForzarSiNecesario({
      modulo,
      entidadId,
      tipoProblema,
      gravedad
    });
    
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para obtener métricas de cuántas veces se ha forzado
router.get('/metricas-forzado', async (req, res) => {
  try {
    const AccionOráculo = require('./models/AccionOráculo');
    
    // Agrupar por tipo de acción
    const metricas = await AccionOráculo.aggregate([
      { 
        $match: { 
          tipo: { $in: ['reintentar_mantenimiento', 'reanudar_instalacion', 'ejecutar_prueba_robot'] }
        } 
      },
      {
        $group: {
          _id: { tipo: '$tipo', resultado: '$resultado' },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: '$_id.tipo',
          exitos: { $sum: { $cond: [{ $eq: ['$_id.resultado', 'exito'] }, '$count', 0] } },
          fallos: { $sum: { $cond: [{ $eq: ['$_id.resultado', 'fallo'] }, '$count', 0] } }
        }
      }
    ]);
    
    res.json({
      timestamp: new Date(),
      metricas,
      totalForzados: metricas.reduce((acc, m) => acc + m.exitos + m.fallos, 0)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para ejecutar evaluación automática de todas las anomalías
router.post('/evaluar-todas-anomalias', async (req, res) => {
  try {
    const resultado = await oraculoService.evaluarTodasLasAnomalias();
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ ENDPOINTS DE APRENDIZAJE ============

// Registrar resultado de una predicción
router.post('/aprendizaje/registrar', async (req, res) => {
  try {
    const { prediccionId, resultadoReal, datosReales } = req.body;
    const resultado = await oraculoService.registrarResultadoPrediccion(
      prediccionId, 
      resultadoReal, 
      datosReales
    );
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obtener estadísticas de aprendizaje
router.get('/aprendizaje/estadisticas', async (req, res) => {
  try {
    const estadisticas = await oraculoService.obtenerEstadisticasAprendizaje();
    res.json(estadisticas);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mejorar una predicción existente
router.post('/aprendizaje/mejorar/:prediccionId', async (req, res) => {
  try {
    const resultado = await oraculoService.mejorarPrediccion(req.params.prediccionId);
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obtener riesgos mejorados por IA
router.get('/riesgos-mejorados', async (req, res) => {
  try {
    const riesgos = await oraculoService.predecirRiesgosMejorado();
    res.json({ success: true, riesgos });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
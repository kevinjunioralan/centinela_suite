const express = require('express');
const router = express.Router();
const AprendizajeService = require('./aprendizajeService');
const EventoAuditoria = require('../auditoria/models/EventoAuditoria');
const Expediente = require('../expediente/models/Expediente');

const aprendizajeService = new AprendizajeService();

// ============ ENDPOINTS EXISTENTES ============

// Obtener patrones detectados (global)
router.get('/patrones', async (req, res) => {
  try {
    const patrones = await aprendizajeService.analizarPatrones();
    res.json({ success: true, data: patrones });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener evolución de un expediente
router.get('/evolucion/:expedienteId', async (req, res) => {
  try {
    const evolucion = await aprendizajeService.obtenerEvolucion(req.params.expedienteId);
    res.json({ success: true, data: evolucion });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Predecir riesgo de un expediente (genérico)
router.get('/riesgo/:expedienteId', async (req, res) => {
  try {
    const riesgo = await aprendizajeService.predecirRiesgo(req.params.expedienteId);
    res.json({ success: true, data: riesgo });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener estadísticas globales
router.get('/estadisticas', async (req, res) => {
  try {
    const estadisticas = await aprendizajeService.obtenerEstadisticasGlobales();
    res.json({ success: true, data: estadisticas });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ ENDPOINTS PARA MANTENIMIENTO ============

// Obtener patrones específicos de un servidor en custodia
router.get('/patrones/mantenimiento/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const patrones = await aprendizajeService.analizarPatronesMantenimiento(id);
    res.json({ success: true, data: patrones });
  } catch (error) {
    console.error('Error en GET /patrones/mantenimiento/:id:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener predicciones IA para servidor en custodia
router.get('/predicciones/mantenimiento/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const predicciones = await aprendizajeService.predecirFalloMantenimiento(id);
    res.json({ success: true, data: predicciones });
  } catch (error) {
    console.error('Error en GET /predicciones/mantenimiento/:id:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ NUEVOS ENDPOINTS ============

// Evaluación de predicciones por expediente
router.get('/evaluacion/:expedienteId', async (req, res) => {
  try {
    const { expedienteId } = req.params;
    
    const expediente = await Expediente.findById(expedienteId);
    if (!expediente) {
      return res.status(404).json({ success: false, error: 'Expediente no encontrado' });
    }
    
    const prediccionesAnteriores = expediente.mantenimiento?.predicciones || [];
    const alertasReales = expediente.mantenimiento?.alertas || [];
    
    const evaluaciones = prediccionesAnteriores.map(pred => {
      const fechaPred = new Date(pred.fechaPrediccion);
      const fechaEstimada = new Date(pred.fechaEstimadaFallo);
      
      const alertasRelevantes = alertasReales.filter(a => {
        const fechaAlerta = new Date(a.fecha);
        return fechaAlerta >= fechaPred && fechaAlerta <= new Date(fechaEstimada.getTime() + 7*24*60*60*1000);
      });
      
      const acerto = alertasRelevantes.length > 0;
      
      return {
        fechaPrediccion: pred.fechaPrediccion,
        fechaEstimadaFallo: pred.fechaEstimadaFallo,
        tipoFallo: pred.tipoFallo,
        probabilidad: pred.probabilidad,
        acerto,
        alertasRelacionadas: alertasRelevantes.length,
        precision: acerto ? 'acertada' : 'fallida'
      };
    });
    
    const total = evaluaciones.length;
    const aciertos = evaluaciones.filter(e => e.acerto).length;
    const precision = total > 0 ? Math.round((aciertos / total) * 100) : 0;
    
    res.json({
      success: true,
      data: {
        expedienteId,
        expedienteNombre: expediente.nombre,
        totalPredicciones: total,
        aciertos,
        precision: precision + '%',
        evaluaciones: evaluaciones.slice(-10)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Precisión global
router.get('/precision-global', async (req, res) => {
  try {
    const expedientes = await Expediente.find({ origen: 'mantenimiento' });
    
    let totalPredicciones = 0;
    let totalAciertos = 0;
    
    for (const exp of expedientes) {
      const predicciones = exp.mantenimiento?.predicciones || [];
      const alertas = exp.mantenimiento?.alertas || [];
      
      predicciones.forEach(pred => {
        totalPredicciones++;
        const fechaPred = new Date(pred.fechaPrediccion);
        const fechaEstimada = new Date(pred.fechaEstimadaFallo);
        
        const alertasRelevantes = alertas.filter(a => {
          const fechaAlerta = new Date(a.fecha);
          return fechaAlerta >= fechaPred && fechaAlerta <= new Date(fechaEstimada.getTime() + 7*24*60*60*1000);
        });
        
        if (alertasRelevantes.length > 0) totalAciertos++;
      });
    }
    
    const precision = totalPredicciones > 0 ? Math.round((totalAciertos / totalPredicciones) * 100) : 0;
    
    res.json({
      success: true,
      data: {
        totalPredicciones,
        totalAciertos,
        precisionGlobal: precision + '%',
        evaluacion: precision > 70 ? 'Excelente' : (precision > 50 ? 'Aceptable' : 'Mejorable')
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Analizar patrones por módulo
router.get('/patrones/modulo/:modulo', async (req, res) => {
  try {
    const { modulo } = req.params;
    const patrones = await aprendizajeService.analizarPatronesPorModulo(modulo);
    res.json({ success: true, data: patrones });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Forzar análisis de aprendizaje
router.post('/analizar', async (req, res) => {
  try {
    const { expedienteId, modulo } = req.body;
    
    let resultado;
    
    if (expedienteId && modulo === 'mantenimiento') {
      resultado = await aprendizajeService.analizarPatronesMantenimiento(expedienteId);
    } else if (expedienteId) {
      resultado = await aprendizajeService.obtenerEvolucion(expedienteId);
    } else {
      resultado = await aprendizajeService.analizarPatrones();
    }
    
    res.json({ success: true, data: resultado });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
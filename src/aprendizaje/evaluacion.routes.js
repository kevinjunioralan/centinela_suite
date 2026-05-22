const express = require('express');
const router = express.Router();
const Expediente = require('../expediente/models/Expediente');
const EventoAuditoria = require('../auditoria/models/EventoAuditoria');

// GET /api/centinela-banco-pruebas/aprendizaje/evaluacion/:expedienteId
router.get('/evaluacion/:expedienteId', async (req, res) => {
  try {
    const { expedienteId } = req.params;
    
    // Obtener predicciones anteriores del expediente
    const expediente = await Expediente.findById(expedienteId);
    if (!expediente) {
      return res.status(404).json({ success: false, error: 'Expediente no encontrado' });
    }
    
    const prediccionesAnteriores = expediente.mantenimiento?.predicciones || [];
    
    // Obtener alertas reales después de las predicciones
    const alertasReales = expediente.mantenimiento?.alertas || [];
    
    // Evaluar cada predicción
    const evaluaciones = prediccionesAnteriores.map(pred => {
      const fechaPred = new Date(pred.fechaPrediccion);
      const fechaEstimada = new Date(pred.fechaEstimadaFallo);
      
      // Buscar alertas después de la predicción y antes de la fecha estimada+7días
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
    
    // Calcular estadísticas de precisión
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

// GET /api/centinela-banco-pruebas/aprendizaje/precision-global
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

module.exports = router;
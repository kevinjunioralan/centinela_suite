// aprendizajeController.js - Controlador para el módulo de aprendizaje
const aprendizajeService = require('./aprendizajeService');

class AprendizajeController {
  /**
   * Obtiene los patrones detectados (global o por expediente)
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async obtenerPatrones(req, res) {
    try {
      const { expedienteId } = req.params;
      const { modulo } = req.query;  // ← NUEVO: filtrar por módulo (mantenimiento, pruebas, etc.)
      
      let patrones;
      
      // Si hay expedienteId y modulo es mantenimiento, usar método específico
      if (expedienteId && modulo === 'mantenimiento') {
        patrones = await aprendizajeService.analizarPatronesMantenimiento(expedienteId);
      } 
      // Si hay expedienteId pero no es mantenimiento
      else if (expedienteId) {
        patrones = await aprendizajeService.obtenerPatronesExpediente(expedienteId);
      } 
      // Sin expedienteId: patrones globales
      else {
        patrones = await aprendizajeService.analizarPatrones();
      }
      
      res.json({ success: true, data: patrones });
    } catch (error) {
      console.error('Error al obtener patrones:', error);
      res.status(500).json({ 
        success: false,
        error: error.message || 'Error interno del servidor al obtener patrones' 
      });
    }
  }

  /**
   * Obtiene la evolución temporal de un expediente
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async obtenerEvolucion(req, res) {
    try {
      const { expedienteId } = req.params;
      
      if (!expedienteId) {
        return res.status(400).json({ 
          success: false,
          error: 'ID de expediente requerido' 
        });
      }
      
      const evolucion = await aprendizajeService.obtenerEvolucion(expedienteId);
      res.json({ success: true, data: evolucion });
    } catch (error) {
      console.error('Error al obtener evolución:', error);
      res.status(500).json({ 
        success: false,
        error: error.message || 'Error interno del servidor al obtener evolución' 
      });
    }
  }

  /**
   * Obtiene los insights generados para un expediente
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async obtenerInsights(req, res) {
    try {
      const { expedienteId } = req.params;
      
      if (!expedienteId) {
        return res.status(400).json({ 
          success: false,
          error: 'ID de expediente requerido' 
        });
      }
      
      // Verificar si es mantenimiento por query param
      const { modulo } = req.query;
      
      let insights;
      if (modulo === 'mantenimiento') {
        // Para mantenimiento, usar predicciones
        const prediccion = await aprendizajeService.predecirFalloMantenimiento(expedienteId);
        insights = {
          tipo: 'mantenimiento',
          prediccion,
          recomendaciones: prediccion.recomendacion
        };
      } else {
        insights = await aprendizajeService.obtenerInsights(expedienteId);
      }
      
      res.json({ success: true, data: insights });
    } catch (error) {
      console.error('Error al obtener insights:', error);
      res.status(500).json({ 
        success: false,
        error: error.message || 'Error interno del servidor al obtener insights' 
      });
    }
  }

  /**
   * Obtiene las recomendaciones para un expediente
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async obtenerRecomendaciones(req, res) {
    try {
      const { expedienteId } = req.params;
      
      if (!expedienteId) {
        return res.status(400).json({ 
          success: false,
          error: 'ID de expediente requerido' 
        });
      }
      
      const { modulo } = req.query;
      
      let recomendaciones;
      if (modulo === 'mantenimiento') {
        // Para mantenimiento, obtener recomendaciones del método específico
        const metricas = []; // Se pueden obtener del expediente
        const alertas = [];
        recomendaciones = await aprendizajeService._generarRecomendacionesMantenimiento(metricas, alertas);
      } else {
        recomendaciones = await aprendizajeService.obtenerRecomendaciones(expedienteId);
      }
      
      res.json({ success: true, data: recomendaciones });
    } catch (error) {
      console.error('Error al obtener recomendaciones:', error);
      res.status(500).json({ 
        success: false,
        error: error.message || 'Error interno del servidor al obtener recomendaciones' 
      });
    }
  }

  // ============ NUEVO: Predicciones para mantenimiento ============
  
  /**
   * Obtiene predicciones de fallo para un servidor en custodia
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async obtenerPrediccionesMantenimiento(req, res) {
    try {
      const { id } = req.params;
      
      if (!id) {
        return res.status(400).json({ 
          success: false,
          error: 'ID de expediente requerido' 
        });
      }
      
      const predicciones = await aprendizajeService.predecirFalloMantenimiento(id);
      res.json({ success: true, data: predicciones });
    } catch (error) {
      console.error('Error al obtener predicciones de mantenimiento:', error);
      res.status(500).json({ 
        success: false,
        error: error.message || 'Error interno del servidor' 
      });
    }
  }

  /**
   * Obtiene patrones específicos de mantenimiento
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async obtenerPatronesMantenimiento(req, res) {
    try {
      const { id } = req.params;
      
      if (!id) {
        return res.status(400).json({ 
          success: false,
          error: 'ID de expediente requerido' 
        });
      }
      
      const patrones = await aprendizajeService.analizarPatronesMantenimiento(id);
      res.json({ success: true, data: patrones });
    } catch (error) {
      console.error('Error al obtener patrones de mantenimiento:', error);
      res.status(500).json({ 
        success: false,
        error: error.message || 'Error interno del servidor' 
      });
    }
  }
}

module.exports = new AprendizajeController();
// PatronesController.js - Controlador de patrones de aprendizaje
const MotorAprendizaje = require('../auditor/MotorAprendizaje/MotorAprendizaje.js');

class PatronesController {
  constructor() {
    this.motorAprendizaje = new MotorAprendizaje();
  }

  /**
   * Obtiene patrones detectados por el motor de aprendizaje
   * @param {Object} req - Objeto de solicitud
   * @param {Object} res - Objeto de respuesta
   * @returns {Promise<void>}
   */
  async obtenerPatrones(req, res) {
    try {
      const { id } = req.params; // expedienteId
      
      // Validaciones
      if (!id || isNaN(id)) {
        return res.status(400).json({ 
          success: false, 
          error: 'ID es requerido y debe ser numérico' 
        });
      }

      const resultado = await this.motorAprendizaje.obtenerPatrones(id);
      
      if (resultado.success) {
        res.json({ 
          success: true, 
          data: resultado.data 
        });
      } else {
        res.status(404).json({ 
          success: false, 
          error: resultado.error || 'Patrones no encontrados' 
        });
      }
    } catch (error) {
      console.error('Error en obtenerPatrones:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Error interno del servidor' 
      });
    }
  }
}

module.exports = PatronesController;
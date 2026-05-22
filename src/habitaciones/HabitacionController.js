// HabitacionController.js - Controlador de habitaciones de aislamiento
const HabitacionService = require('../aislamiento/HabitacionBuilder/HabitacionBuilder.service');
const HabitacionDestroyerService = require('../aislamiento/HabitacionDestroyer/HabitacionDestroyer.js');

class HabitacionController {
  constructor() {
    this.habitacionService = new HabitacionService();
    this.habitacionDestroyerService = new HabitacionDestroyerService();
  }

  /**
   * Crea una nueva habitación de aislamiento
   * @param {Object} req - Objeto de solicitud
   * @param {Object} res - Objeto de respuesta
   * @returns {Promise<void>}
   */
  async crearHabitacion(req, res) {
    try {
      const { expedienteId } = req.body;
      
      // Validaciones
      if (!expedienteId || isNaN(expedienteId)) {
        return res.status(400).json({ 
          success: false, 
          error: 'expedienteId es requerido y debe ser numérico' 
        });
      }

      const resultado = await this.habitacionService.construirHabitacion({ expedienteId });
      
      if (resultado.success) {
        res.status(201).json({ 
          success: true, 
          data: resultado.data,
          message: 'Habitación creada correctamente' 
        });
      } else {
        res.status(400).json({ 
          success: false, 
          error: resultado.error 
        });
      }
    } catch (error) {
      console.error('Error en crearHabitacion:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Error interno del servidor' 
      });
    }
  }

  /**
   * Obtiene una habitación por ID
   * @param {Object} req - Objeto de solicitud
   * @param {Object} res - Objeto de respuesta
   * @returns {Promise<void>}
   */
  async obtenerHabitacion(req, res) {
    try {
      const { id } = req.params;
      
      // Validaciones
      if (!id || isNaN(id)) {
        return res.status(400).json({ 
          success: false, 
          error: 'ID es requerido y debe ser numérico' 
        });
      }

      const resultado = await this.habitacionService.obtenerHabitacion(id);
      
      // Handle the case where resultado is null or undefined (habitación not found)
      if (resultado != null) {
        res.json({ 
          success: true, 
          data: resultado 
        });
      } else {
        res.status(404).json({ 
          success: false, 
          error: 'Habitación no encontrada' 
        });
      }
    } catch (error) {
      console.error('Error en obtenerHabitacion:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Error interno del servidor' 
      });
    }
  }

  /**
   * Destruye una habitación de aislamiento
   * @param {Object} req - Objeto de solicitud
   * @param {Object} res - Objeto de respuesta
   * @returns {Promise<void>}
   */
  async destruirHabitacion(req, res) {
    try {
      const { id } = req.params;
      
      // Validaciones
      if (!id || isNaN(id)) {
        return res.status(400).json({ 
          success: false, 
          error: 'ID es requerido y debe ser numérico' 
        });
      }

      // Para la destrucción, necesitamos tanto el expedienteId como el namespaceId
      // En una implementación real, obtendríamos el namespaceId desde la base de datos
      // Por ahora, usamos un formato estándar basado en el expedienteId
      const expedienteId = id;
      const namespaceId = `ns-expediente-${expedienteId}`;
      
      const resultado = await this.habitacionDestroyerService.destruir(expedienteId, namespaceId);
      
      if (resultado.success) {
        res.json({ 
          success: true, 
          message: 'Habitación destruida correctamente' 
        });
      } else {
        res.status(400).json({ 
          success: false, 
          error: resultado.error 
        });
      }
    } catch (error) {
      console.error('Error en destruirHabitacion:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Error interno del servidor' 
      });
    }
  }
}

module.exports = HabitacionController;
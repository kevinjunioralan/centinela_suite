// EventosController.js - Controlador de eventos
const EventosService = require('../auditor/Eventos/Eventos.js');

class EventosController {
  constructor() {
    this.eventosService = new EventosService();
  }

  /**
   * Obtiene eventos por ID de expediente
   * @param {Object} req - Objeto de solicitud
   * @param {Object} res - Objeto de respuesta
   * @returns {Promise<void>}
   */
  async obtenerEventos(req, res) {
    try {
      const { id } = req.params;
      
      // Validaciones
      if (!id || isNaN(id)) {
        return res.status(400).json({ 
          success: false, 
          error: 'ID es requerido y debe ser numérico' 
        });
      }

      const resultado = await this.eventosService.obtenerHistorial(id);
      
      if (resultado.success) {
        res.json({ 
          success: true, 
          data: resultado.data 
        });
      } else {
        res.status(404).json({ 
          success: false, 
          error: resultado.error || 'Eventos no encontrados' 
        });
      }
    } catch (error) {
      console.error('Error en obtenerEventos:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Error interno del servidor' 
      });
    }
  }
}

module.exports = EventosController;
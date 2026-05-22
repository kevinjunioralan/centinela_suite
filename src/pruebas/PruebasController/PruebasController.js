// PruebasController.js - Controlador de pruebas
const PruebasOrquestador = require('../PruebasOrquestador/PruebasOrquestador.js');

class PruebasController {
  constructor() {
    this.pruebasService = new PruebasOrquestador();
  }

  /**
   * Ejecuta pruebas en una habitación
   * @param {Object} req - Objeto de solicitud
   * @param {Object} res - Objeto de respuesta
   * @returns {Promise<void>}
   */
  async ejecutarPruebas(req, res) {
    try {
      const { habitacionId, tipoPrueba, parametros } = req.body;
      
      // Validaciones
      if (!habitacionId || isNaN(habitacionId)) {
        return res.status(400).json({ 
          success: false, 
          error: 'habitacionId es requerido y debe ser numérico' 
        });
      }

      if (!tipoPrueba) {
        return res.status(400).json({ 
          success: false, 
          error: 'tipoPrueba es requerido' 
        });
      }

      const resultado = await this.pruebasService.ejecutarPrueba(habitacionId, tipoPrueba, parametros);
      
      if (resultado.estado === 'exitoso') {
        res.json({ 
          success: true, 
          data: resultado.resultado || resultado.data,
          message: resultado.mensaje || 'Prueba ejecutada correctamente' 
        });
      } else {
        res.status(400).json({ 
          success: false, 
          error: resultado.mensaje || resultado.error 
        });
      }
    } catch (error) {
      console.error('Error en ejecutarPruebas:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Error interno del servidor' 
      });
    }
  }

  /**
   * Obtiene una prueba por ID
   * @param {Object} req - Objeto de solicitud
   * @param {Object} res - Objeto de respuesta
   * @returns {Promise<void>}
   */
  async obtenerPrueba(req, res) {
    try {
      const { id } = req.params;
      
      // Validaciones
      if (!id || isNaN(id)) {
        return res.status(400).json({ 
          success: false, 
          error: 'ID es requerido y debe ser numérico' 
        });
      }

      const resultado = await this.pruebasService.obtenerPrueba(id);
      
      if (resultado.estado === 'exitoso') {
        res.json({ 
          success: true, 
          data: resultado.data 
        });
      } else {
        res.status(404).json({ 
          success: false, 
          error: resultado.mensaje || resultado.error || 'Prueba no encontrada' 
        });
      }
    } catch (error) {
      console.error('Error en obtenerPrueba:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Error interno del servidor' 
      });
    }
  }
}

module.exports = PruebasController;
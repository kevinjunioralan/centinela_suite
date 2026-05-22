const InstalacionService = require('./InstalacionService');

class InstalacionController {
  constructor() {
    this.instalacionService = new InstalacionService();
  }

  /**
   * Crea una nueva instalación
   */
  async crearInstalacion(req, res) {
    try {
      const resultado = await this.instalacionService.crearInstalacion(req.body);
      if (resultado.success) {
        res.json({ success: true, data: resultado.data });
      } else {
        res.status(400).json({ success: false, error: resultado.error });
      }
    } catch (error) {
      console.error('Error en crearInstalacion:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Inicia una instalación
   */
  async iniciarInstalacion(req, res) {
    try {
      const { id } = req.params;
      const resultado = await this.instalacionService.iniciarInstalacion(id);
      if (resultado.success) {
        res.json({ success: true, message: resultado.message });
      } else {
        res.status(400).json({ success: false, error: resultado.error });
      }
    } catch (error) {
      console.error('Error en iniciarInstalacion:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Obtiene el estado de una instalación
   */
  async obtenerEstado(req, res) {
    try {
      const { id } = req.params;
      const resultado = await this.instalacionService.obtenerEstado(id);
      if (resultado.success) {
        res.json({ success: true, data: resultado.data });
      } else {
        res.status(404).json({ success: false, error: resultado.error });
      }
    } catch (error) {
      console.error('Error en obtenerEstado:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Obtiene todas las instalaciones
   */
  async obtenerTodas(req, res) {
    try {
      const Expediente = require('../expediente/models/Expediente');
      const instalaciones = await Expediente.find({ origen: 'instalacion' })
        .select('nombre servidor instalacion createdAt');
      
      res.json({ success: true, data: instalaciones });
    } catch (error) {
      console.error('Error en obtenerTodas:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Obtiene estadísticas del módulo de instalación
   */
  async obtenerEstadisticas(req, res) {
    try {
      const resultado = await this.instalacionService.obtenerEstadisticas();
      if (resultado.success) {
        res.json({ success: true, data: resultado.data });
      } else {
        res.status(500).json({ success: false, error: resultado.error });
      }
    } catch (error) {
      console.error('Error en obtenerEstadisticas:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

module.exports = InstalacionController;
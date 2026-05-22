// ExpedienteController.js - Controlador de expedientes
const mongoose = require('mongoose');

class ExpedienteController {
  constructor() {
    this.expedienteService = null;
  }

  setExpedienteService(service) {
    this.expedienteService = service;
  }

  // ============ CRUD BÁSICO ============

  async getAllExpedientes(req, res) {
    try {
      const { clienteId, estado, origen } = req.query;
      let query = {};
      
      if (clienteId) {
        query.clienteId = clienteId;
      }
      if (estado) {
        query.estado = estado;
      }
      if (origen) {
        query.origen = origen;
      }
      
      console.log('🔍 [CONTROLLER] getAllExpedientes - Filtros:', query);
      const expedientes = await this.expedienteService.getAllExpedientes(query);
      
      res.json({ success: true, expedientes });
    } catch (error) {
      console.error('❌ Error en getAllExpedientes:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getExpedienteById(req, res) {
    try {
      const { id } = req.params;
      const expediente = await this.expedienteService.getExpedienteById(id);
      
      if (!expediente) {
        return res.status(404).json({ success: false, error: 'Expediente no encontrado' });
      }
      
      res.json({ success: true, data: expediente });
    } catch (error) {
      console.error('❌ Error en getExpedienteById:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async createExpediente(req, res) {
    try {
      console.log('📥 [CONTROLLER] createExpediente - Request recibida');
      
      const expediente = await this.expedienteService.createExpediente(req.body);
      
      res.json({ success: true, data: expediente });
    } catch (error) {
      console.error('❌ Error en createExpediente:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async updateExpediente(req, res) {
    try {
      const { id } = req.params;
      const expediente = await this.expedienteService.updateExpediente(id, req.body);
      
      if (!expediente) {
        return res.status(404).json({ success: false, error: 'Expediente no encontrado' });
      }
      
      res.json({ success: true, data: expediente });
    } catch (error) {
      console.error('❌ Error en updateExpediente:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async deleteExpediente(req, res) {
    try {
      const { id } = req.params;
      const result = await this.expedienteService.deleteExpediente(id);
      
      if (!result) {
        return res.status(404).json({ success: false, error: 'Expediente no encontrado' });
      }
      
      res.json({ success: true, message: 'Expediente eliminado correctamente' });
    } catch (error) {
      console.error('❌ Error en deleteExpediente:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // ============ NUEVOS MÉTODOS PARA MÉTRICAS ============

  async registrarMetrica(req, res) {
    try {
      const { expedienteId, clienteId, tipo, valor, origen, detalles } = req.body;
      
      if (!expedienteId || !clienteId || !tipo || valor === undefined) {
        return res.status(400).json({ 
          success: false, 
          error: 'Faltan campos requeridos: expedienteId, clienteId, tipo, valor' 
        });
      }
      
      const metrica = await this.expedienteService.registrarMetrica(
        expedienteId, clienteId, tipo, valor, origen, detalles
      );
      
      res.json({ success: true, data: metrica });
    } catch (error) {
      console.error('❌ Error en registrarMetrica:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async obtenerMetricas(req, res) {
    try {
      const { expedienteId } = req.params;
      const { tipo, limite = 100 } = req.query;
      
      if (!expedienteId) {
        return res.status(400).json({ success: false, error: 'expedienteId es requerido' });
      }
      
      const metricas = await this.expedienteService.obtenerMetricas(expedienteId, tipo, parseInt(limite));
      
      res.json({ success: true, data: metricas });
    } catch (error) {
      console.error('❌ Error en obtenerMetricas:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async obtenerUltimaMetrica(req, res) {
    try {
      const { expedienteId, tipo } = req.params;
      
      const metrica = await this.expedienteService.obtenerUltimaMetrica(expedienteId, tipo);
      
      res.json({ success: true, data: metrica });
    } catch (error) {
      console.error('❌ Error en obtenerUltimaMetrica:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // ============ NUEVOS MÉTODOS PARA ALERTAS ============

  async registrarAlerta(req, res) {
    try {
      const { expedienteId, clienteId, tipo, mensaje, origen, valor, umbral } = req.body;
      
      if (!expedienteId || !clienteId || !tipo || !mensaje) {
        return res.status(400).json({ 
          success: false, 
          error: 'Faltan campos requeridos: expedienteId, clienteId, tipo, mensaje' 
        });
      }
      
      const alerta = await this.expedienteService.registrarAlerta(
        expedienteId, clienteId, tipo, mensaje, origen, valor, umbral
      );
      
      res.json({ success: true, data: alerta });
    } catch (error) {
      console.error('❌ Error en registrarAlerta:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async obtenerAlertas(req, res) {
    try {
      const { expedienteId } = req.params;
      const { soloNoResueltas, limite = 50 } = req.query;
      
      const alertas = await this.expedienteService.obtenerAlertas(
        expedienteId, 
        soloNoResueltas === 'true', 
        parseInt(limite)
      );
      
      res.json({ success: true, data: alertas });
    } catch (error) {
      console.error('❌ Error en obtenerAlertas:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async resolverAlerta(req, res) {
    try {
      const { alertaId } = req.params;
      const { resueltaPor = 'sistema' } = req.body;
      
      const alerta = await this.expedienteService.resolverAlerta(alertaId, resueltaPor);
      
      if (!alerta) {
        return res.status(404).json({ success: false, error: 'Alerta no encontrada' });
      }
      
      res.json({ success: true, data: alerta });
    } catch (error) {
      console.error('❌ Error en resolverAlerta:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // ============ NUEVOS MÉTODOS PARA PREDICCIONES ============

  async registrarPrediccion(req, res) {
    try {
      const { expedienteId, clienteId, tipoFallo, probabilidad, fechaEstimadaFallo, recomendacion, origen } = req.body;
      
      if (!expedienteId || !clienteId || !tipoFallo || probabilidad === undefined || !fechaEstimadaFallo) {
        return res.status(400).json({ 
          success: false, 
          error: 'Faltan campos requeridos' 
        });
      }
      
      const prediccion = await this.expedienteService.registrarPrediccion(
        expedienteId, clienteId, tipoFallo, probabilidad, new Date(fechaEstimadaFallo), recomendacion, origen
      );
      
      res.json({ success: true, data: prediccion });
    } catch (error) {
      console.error('❌ Error en registrarPrediccion:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async obtenerPrediccionesActivas(req, res) {
    try {
      const { expedienteId } = req.params;
      
      const predicciones = await this.expedienteService.obtenerPrediccionesActivas(expedienteId);
      
      res.json({ success: true, data: predicciones });
    } catch (error) {
      console.error('❌ Error en obtenerPrediccionesActivas:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async evaluarPredicciones(req, res) {
    try {
      const evaluadas = await this.expedienteService.evaluarPredicciones();
      
      res.json({ success: true, data: { evaluadas } });
    } catch (error) {
      console.error('❌ Error en evaluarPredicciones:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // ============ MÉTODOS EXISTENTES ============

  async asignarHabitacion(req, res) {
    try {
      const { id } = req.params;
      const { habitacionId } = req.body;
      
      const resultado = await this.expedienteService.asignarHabitacion(id, habitacionId);
      
      res.json({ success: true, data: resultado });
    } catch (error) {
      console.error('❌ Error en asignarHabitacion:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async cambiarEstado(req, res) {
    try {
      const { id } = req.params;
      const { estado, observacion } = req.body;
      
      const resultado = await this.expedienteService.cambiarEstado(id, estado, { observacion });
      
      res.json({ success: true, data: resultado });
    } catch (error) {
      console.error('❌ Error en cambiarEstado:', error);
      if (error.message && error.message.includes('no encontrado')) {
        return res.status(404).json({ success: false, error: error.message });
      }
      if (
        error.message && (
          error.message.includes('Estado inválido') ||
          error.message.includes('Transición de estado no permitida')
        )
      ) {
        return res.status(400).json({ success: false, error: error.message });
      }
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async liberarHabitacion(req, res) {
    try {
      const { id } = req.params;
      
      const resultado = await this.expedienteService.liberarHabitacion(id);
      
      res.json({ success: true, data: resultado });
    } catch (error) {
      console.error('❌ Error en liberarHabitacion:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

module.exports = ExpedienteController;
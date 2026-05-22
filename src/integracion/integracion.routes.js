const express = require('express');
const router = express.Router();
const AuditorGeneralClient = require('./AuditorGeneralClient/AuditorGeneralClient');
const EventosSuite = require('./EventosSuite/EventosSuite');

const auditorGeneralClient = new AuditorGeneralClient();
const eventosSuite = new EventosSuite();

// Obtener eventos recibidos desde la suite de pruebas
router.get('/eventos-suite', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const eventos = await eventosSuite.obtenerEventos(parseInt(limit));
    res.json({
      success: true,
      data: {
        eventos: eventos,
        total: eventos.length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Enviar eventos al auditor general del sistema
router.post('/enviar-auditor-general', async (req, res) => {
  try {
    const { eventos, tipoReporte } = req.body;
    
    if (!eventos || !Array.isArray(eventos)) {
      return res.status(400).json({
        success: false,
        error: 'Eventos son requeridos y deben ser un array'
      });
    }
    
    const resultado = await auditorGeneralClient.enviarEventos(eventos, tipoReporte || 'resumen');
    res.json({
      success: true,
      data: resultado
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Obtener estado de conexión con auditor general
router.get('/auditor-general/estado', async (req, res) => {
  try {
    const estado = await auditorGeneralClient.obtenerEstadoConexion();
    res.json({
      success: true,
      data: estado
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Enviar resumen de pruebas ejecutadas
router.post('/resumen-pruebas', async (req, res) => {
  try {
    const { pruebasEjecutadas, periodo } = req.body;
    
    if (!pruebasEjecutadas) {
      return res.status(400).json({
        success: false,
        error: 'Pruebas ejecutadas son requeridas'
      });
    }
    
    const resumen = await eventosSuite.generarResumen(pruebasEjecutadas, periodo);
    res.json({
      success: true,
      data: resumen
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
const express = require('express');
const router = express.Router();
const Diagnostico = require('./Diagnostico/Diagnostico');
const Estres = require('./Estres/Estres');
const Informe = require('./Informe/Informe');
const PruebasOrquestador = require('./PruebasOrquestador/PruebasOrquestador');

const diagnostico = new Diagnostico();
const estres = new Estres();
const informe = new Informe();
const pruebasOrquestador = new PruebasOrquestador();

// Obtener resultados de prueba diagnóstica
router.get('/diagnostico/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const resultado = await diagnostico.obtenerResultado(id);
    
    if (!resultado) {
      return res.status(404).json({
        success: false,
        error: 'Resultado de prueba diagnóstica no encontrado'
      });
    }
    
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

// Ejecutar prueba diagnóstica
router.post('/diagnostico/ejecutar', async (req, res) => {
  try {
    const { objetivo, tipoDiagnostico, parametros } = req.body;
    
    if (!objetivo || !tipoDiagnostico) {
      return res.status(400).json({
        success: false,
        error: 'Objetivo y tipo de diagnóstico son requeridos'
      });
    }
    
    const prueba = await diagnostico.ejecutarDiagnostico(objetivo, tipoDiagnostico, parametros);
    res.json({
      success: true,
      data: prueba
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Ejecutar prueba de estrés
router.post('/estres/ejecutar', async (req, res) => {
  try {
    const { objetivo, tipoEstres, duracion, intensidad } = req.body;
    
    if (!objetivo || !tipoEstres) {
      return res.status(400).json({
        success: false,
        error: 'Objetivo y tipo de estrés son requeridos'
      });
    }
    
    const prueba = await estres.ejecutarPrueba(objetivo, tipoEstres, duracion, intensidad);
    res.json({
      success: true,
      data: prueba
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Generar informe de prueba
router.post('/informe/generar', async (req, res) => {
  try {
    const { tipo, datos, periodo } = req.body;
    
    if (!tipo || !datos) {
      return res.status(400).json({
        success: false,
        error: 'Tipo y datos son requeridos para generar informe'
      });
    }
    
    const informeGenerado = await informe.generarInforme(tipo, datos, periodo);
    res.json({
      success: true,
      data: informeGenerado
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Ejecutar pruebas orquestadas (para validar integración con otros módulos)
router.post('/orquestador/ejecutar', async (req, res) => {
  try {
    const { modulo, tipoPrueba, parametros } = req.body;
    
    if (!modulo || !tipoPrueba) {
      return res.status(400).json({
        success: false,
        error: 'Módulo y tipo de prueba son requeridos'
      });
    }
    
    const resultado = await pruebasOrquestador.ejecutarPrueba(modulo, tipoPrueba, parametros);
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

// Obtener historial de pruebas ejecutadas
router.get('/historial', async (req, res) => {
  try {
    const { limite = 50, tipo } = req.query;
    const filtros = {};
    if (tipo) filtros.tipo = tipo;
    
    const historial = await pruebasOrquestador.obtenerHistorial(parseInt(limite), filtros);
    res.json({
      success: true,
      data: {
        pruebas: historial,
        total: historial.length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
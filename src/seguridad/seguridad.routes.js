const express = require('express');
const router = express.Router();
const TokenNivel1 = require('./TokenNivel1/TokenNivel1');
const TokenNivel2 = require('./TokenNivel2/TokenNivel2');
const TokenNivel3 = require('./TokenNivel3/TokenNivel3');

const tokenNivel1 = new TokenNivel1();
const tokenNivel2 = new TokenNivel2();
const tokenNivel3 = new TokenNivel3();

// Obtener tokens de nivel 1 activos
router.get('/tokens/nivel1', async (req, res) => {
  try {
    const tokens = await tokenNivel1.listarTokensActivos();
    res.json({
      success: true,
      data: {
        tokens: tokens,
        total: tokens.length,
        tipo: 'nivel1',
        descripcion: 'Tokens de acceso básico'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Generar nuevo token de nivel 1
router.post('/tokens/nivel1/generar', async (req, res) => {
  try {
    const { usuario, permisos, expiracionHoras } = req.body;
    
    if (!usuario || !permisos) {
      return res.status(400).json({
        success: false,
        error: 'Usuario y permisos son requeridos'
      });
    }
    
    const token = await tokenNivel1.generarToken(usuario, permisos, expiracionHoras || 24);
    res.json({
      success: true,
      data: token
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Validar token de nivel 1
router.post('/tokens/nivel1/validar', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Token es requerido'
      });
    }
    
    const validacion = await tokenNivel1.validarToken(token);
    res.json({
      success: true,
      data: validacion
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Revocar token de nivel 1
router.delete('/tokens/nivel1/:tokenId/revocar', async (req, res) => {
  try {
    const { tokenId } = req.params;
    const resultado = await tokenNivel1.revocarToken(tokenId);
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

// Obtener tokens de nivel 2 activos
router.get('/tokens/nivel2', async (req, res) => {
  try {
    const tokens = await tokenNivel2.listarTokensActivos();
    res.json({
      success: true,
      data: {
        tokens: tokens,
        total: tokens.length,
        tipo: 'nivel2',
        descripcion: 'Tokens de acceso avanzado'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Generar nuevo token de nivel 2
router.post('/tokens/nivel2/generar', async (req, res) => {
  try {
    const { usuario, permisos, expiracionHoras } = req.body;
    
    if (!usuario || !permisos) {
      return res.status(400).json({
        success: false,
        error: 'Usuario y permisos son requeridos'
      });
    }
    
    const token = await tokenNivel2.generarToken(usuario, permisos, expiracionHoras || 8);
    res.json({
      success: true,
      data: token
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Obtener tokens de nivel 3 activos
router.get('/tokens/nivel3', async (req, res) => {
  try {
    const tokens = await tokenNivel3.listarTokensActivos();
    res.json({
      success: true,
      data: {
        tokens: tokens,
        total: tokens.length,
        tipo: 'nivel3',
        descripcion: 'Tokens de acceso administrativo'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Generar nuevo token de nivel 3
router.post('/tokens/nivel3/generar', async (req, res) => {
  try {
    const { usuario, permisos, expiracionHoras } = req.body;
    
    if (!usuario || !permisos) {
      return res.status(400).json({
        success: false,
        error: 'Usuario y permisos son requeridos'
      });
    }
    
    const token = await tokenNivel3.generarToken(usuario, permisos, expiracionHoras || 1);
    res.json({
      success: true,
      data: token
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Obtener estadísticas de uso de tokens
router.get('/tokens/estadisticas', async (req, res) => {
  try {
    const stats1 = await tokenNivel1.obtenerEstadisticas();
    const stats2 = await tokenNivel2.obtenerEstadisticas();
    const stats3 = await tokenNivel3.obtenerEstadisticas();
    
    res.json({
      success: true,
      data: {
        nivel1: stats1,
        nivel2: stats2,
        nivel3: stats3
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
// backend/src/apiPublica/apiPublica.routes.js
const express = require('express');
const router = express.Router();
const ApiKey = require('../expediente/models/ApiKey');
const Expediente = require('../expediente/models/Expediente');

// Middleware para validar API Key
const validarApiKey = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) {
    return res.status(401).json({ error: 'API Key requerida' });
  }
  
  const key = await ApiKey.findOne({ key: apiKey, activa: true });
  if (!key) {
    return res.status(401).json({ error: 'API Key inválida' });
  }
  
  key.ultimoUso = new Date();
  await key.save();
  req.clienteId = key.clienteId;
  next();
};

// Obtener estado general del cliente
router.get('/estado', validarApiKey, async (req, res) => {
  try {
    const servidores = await Expediente.find({ clienteId: req.clienteId });
    
    const total = servidores.length;
    const activos = servidores.filter(s => s.origen === 'mantenimiento').length;
    const instalando = servidores.filter(s => s.origen === 'instalacion').length;
    const conAlertas = servidores.filter(s => s.mantenimiento?.alertas?.length > 0).length;
    
    const scores = servidores.filter(s => s.instalacion?.resumen?.scoreFinal).map(s => s.instalacion.resumen.scoreFinal);
    const scorePromedio = scores.length ? Math.round(scores.reduce((a,b) => a+b,0)/scores.length) : 0;
    
    res.json({
      success: true,
      data: {
        resumen: { total, activos, instalando, conAlertas, scorePromedio },
        servidores: servidores.map(s => ({
          id: s._id,
          nombre: s.nombre,
          ip: s.servidor?.ip,
          pack: s.instalacion?.packNombre,
          estado: s.origen === 'mantenimiento' ? 'activo' : (s.origen === 'instalacion' ? 'instalando' : 'pendiente'),
          score: s.instalacion?.resumen?.scoreFinal || 0,
          ultimaMetrica: s.mantenimiento?.metricasHistoricas?.slice(-1)[0] || null
        }))
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obtener métricas de un servidor específico
router.get('/servidor/:id', validarApiKey, async (req, res) => {
  try {
    const servidor = await Expediente.findOne({ _id: req.params.id, clienteId: req.clienteId });
    if (!servidor) {
      return res.status(404).json({ error: 'Servidor no encontrado' });
    }
    
    const metricas = servidor.mantenimiento?.metricasHistoricas?.slice(-30) || [];
    const alertas = servidor.mantenimiento?.alertas?.slice(-10) || [];
    
    res.json({
      success: true,
      data: {
        nombre: servidor.nombre,
        ip: servidor.servidor?.ip,
        pack: servidor.instalacion?.packNombre,
        score: servidor.instalacion?.resumen?.scoreFinal || 0,
        metricas,
        alertas,
        estado: servidor.origen === 'mantenimiento' ? 'activo' : 'instalando'
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obtener alertas activas
router.get('/alertas', validarApiKey, async (req, res) => {
  try {
    const servidores = await Expediente.find({ clienteId: req.clienteId });
    const alertas = [];
    
    servidores.forEach(s => {
      (s.mantenimiento?.alertas || []).forEach(a => {
        alertas.push({
          servidor: s.nombre,
          tipo: a.tipo,
          mensaje: a.mensaje,
          fecha: a.fecha
        });
      });
    });
    
    res.json({ success: true, data: alertas.sort((a,b) => new Date(b.fecha) - new Date(a.fecha)) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
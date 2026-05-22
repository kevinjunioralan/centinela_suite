const express = require('express');
const router = express.Router();
const InformesController = require('./InformesController');
const Expediente = require('../expediente/models/Expediente');
const Cliente = require('../expediente/models/Cliente');
const Metrica = require('../expediente/models/Metrica');
const Alerta = require('../expediente/models/Alerta');
const Prediccion = require('../expediente/models/Prediccion');
const InformeGenerado = require('./models/InformeGenerado');
const InformePdfService = require('../services/informePdfService');
const path = require('path');
const fs = require('fs');

const informesController = new InformesController();
const informePdfService = new InformePdfService();

async function registrarMetadataInforme(payload) {
  try {
    return await InformeGenerado.create({
      tipo: payload.tipo,
      formato: payload.formato,
      expedienteId: payload.expedienteId || null,
      clienteId: payload.clienteId || null,
      generadoPor: payload.generadoPor || 'sistema',
      nombreArchivo: payload.nombreArchivo || null,
      rutaTemporal: payload.rutaTemporal || null,
      estado: payload.estado || 'generado',
      detalles: payload.detalles || {}
    });
  } catch (error) {
    console.warn('No se pudo registrar metadata del informe PDF:', error.message);
    return null;
  }
}

// Historial de informes generados (metadata)
router.get('/historial', async (req, res) => {
  try {
    const {
      tipo,
      formato,
      estado,
      expedienteId,
      clienteId,
      generadoPor,
      desde,
      hasta,
      limit,
      offset
    } = req.query;

    const query = {};
    if (tipo) query.tipo = tipo;
    if (formato) query.formato = formato;
    if (estado) query.estado = estado;
    if (expedienteId) query.expedienteId = expedienteId;
    if (clienteId) query.clienteId = clienteId;
    if (generadoPor) query.generadoPor = generadoPor;

    if (desde || hasta) {
      query.createdAt = {};
      if (desde) query.createdAt.$gte = new Date(desde);
      if (hasta) query.createdAt.$lte = new Date(hasta);
    }

    const parsedLimit = Number.parseInt(limit, 10);
    const parsedOffset = Number.parseInt(offset, 10);
    const safeLimit = Number.isInteger(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 200) : 50;
    const safeOffset = Number.isInteger(parsedOffset) ? Math.max(parsedOffset, 0) : 0;

    const [items, total] = await Promise.all([
      InformeGenerado.find(query)
        .sort({ createdAt: -1 })
        .skip(safeOffset)
        .limit(safeLimit)
        .lean(),
      InformeGenerado.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: {
        total,
        limit: safeLimit,
        offset: safeOffset,
        hasMore: safeOffset + items.length < total,
        items
      }
    });
  } catch (error) {
    console.error('Error en GET /informes/historial:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ ENDPOINTS EXISTENTES (para pruebas) ============

// Obtener un informe por ID (pruebas)
router.get('/:id', async (req, res) => {
  try {
    await informesController.obtenerInforme(req, res);
  } catch (error) {
    console.error('Error en GET /informes/:id:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ ENDPOINTS PARA MANTENIMIENTO ============

// Obtener informe de mantenimiento por expedienteId
router.get('/mantenimiento/:id', async (req, res) => {
  try {
    await informesController.obtenerInformeMantenimiento(req, res);
  } catch (error) {
    console.error('Error en GET /informes/mantenimiento/:id:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Regenerar informe de mantenimiento
router.post('/mantenimiento/:id/regenerar', async (req, res) => {
  try {
    await informesController.regenerarInformeMantenimiento(req, res);
  } catch (error) {
    console.error('Error en POST /informes/mantenimiento/:id/regenerar:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ ENDPOINTS DE PDF (ACTUALIZADOS) ============

// Generar PDF de servidor (con datos normalizados)
router.get('/servidor/:id/pdf', async (req, res) => {
  try {
    const { id } = req.params;
    const expediente = await Expediente.findById(id);
    
    if (!expediente) {
      return res.status(404).json({ success: false, error: 'Expediente no encontrado' });
    }
    
    // ✅ NUEVO: Obtener métricas del expediente
    const metricas = await Metrica.find({ expedienteId: id })
      .sort({ timestamp: -1 })
      .limit(100);
    
    // ✅ NUEVO: Obtener alertas del expediente
    const alertas = await Alerta.find({ expedienteId: id })
      .sort({ timestamp: -1 })
      .limit(50);
    
    // ✅ NUEVO: Obtener predicciones del expediente
    const predicciones = await Prediccion.find({ expedienteId: id })
      .sort({ fechaPrediccion: -1 })
      .limit(10);
    
    const tempDir = path.join(__dirname, '../../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const outputPath = path.join(tempDir, `informe_servidor_${id}_${Date.now()}.pdf`);
    const metadata = await registrarMetadataInforme({
      tipo: 'servidor_pdf',
      formato: 'pdf',
      expedienteId: id,
      generadoPor: req.usuario?.username || 'sistema',
      nombreArchivo: path.basename(outputPath),
      rutaTemporal: outputPath,
      detalles: {
        metricas: metricas.length,
        alertas: alertas.length,
        predicciones: predicciones.length
      }
    });
    
    // ✅ NUEVO: Pasar datos normalizados al servicio
    await informePdfService.generarInformeServidorNormalizado(
      expediente, metricas, alertas, predicciones, outputPath
    );
    
    res.download(outputPath, `informe_${expediente.nombre}_${Date.now()}.pdf`, (err) => {
      if (metadata) {
        metadata.estado = err ? 'error' : 'descargado';
        metadata.fechaDescarga = new Date();
        metadata.save().catch(() => {});
      }
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
        if (metadata) {
          metadata.estado = 'eliminado';
          metadata.save().catch(() => {});
        }
      }
      if (err) {
        console.error('Error enviando PDF:', err);
      }
    });
    
  } catch (error) {
    console.error('Error generando PDF de servidor:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Generar PDF de cliente (con datos normalizados)
router.get('/cliente/:id/pdf', async (req, res) => {
  try {
    const { id } = req.params;
    const cliente = await Cliente.findById(id);
    
    if (!cliente) {
      return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
    }
    
    const servidores = await Expediente.find({ clienteId: id });
    
    // ✅ NUEVO: Obtener métricas de todos los servidores del cliente
    const expedienteIds = servidores.map(s => s._id);
    const metricas = await Metrica.find({ expedienteId: { $in: expedienteIds } })
      .sort({ timestamp: -1 })
      .limit(200);
    
    // ✅ NUEVO: Obtener alertas de todos los servidores del cliente
    const alertas = await Alerta.find({ expedienteId: { $in: expedienteIds }, resuelta: false })
      .sort({ timestamp: -1 });
    
    const tempDir = path.join(__dirname, '../../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const outputPath = path.join(tempDir, `informe_cliente_${id}_${Date.now()}.pdf`);
    const metadata = await registrarMetadataInforme({
      tipo: 'cliente_pdf',
      formato: 'pdf',
      clienteId: id,
      generadoPor: req.usuario?.username || 'sistema',
      nombreArchivo: path.basename(outputPath),
      rutaTemporal: outputPath,
      detalles: {
        servidores: servidores.length,
        metricas: metricas.length,
        alertas: alertas.length
      }
    });
    
    // ✅ NUEVO: Pasar datos normalizados al servicio
    await informePdfService.generarInformeClienteNormalizado(
      cliente, servidores, metricas, alertas, outputPath
    );
    
    res.download(outputPath, `informe_${cliente.nombre}_${Date.now()}.pdf`, (err) => {
      if (metadata) {
        metadata.estado = err ? 'error' : 'descargado';
        metadata.fechaDescarga = new Date();
        metadata.save().catch(() => {});
      }
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
        if (metadata) {
          metadata.estado = 'eliminado';
          metadata.save().catch(() => {});
        }
      }
      if (err) {
        console.error('Error enviando PDF:', err);
      }
    });
    
  } catch (error) {
    console.error('Error generando PDF de cliente:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ NUEVO: Endpoint para obtener métricas de un servidor (para informes) ============
router.get('/servidor/:id/metricas', async (req, res) => {
  try {
    const { id } = req.params;
    const { tipo, limite = 100 } = req.query;
    
    const query = { expedienteId: id };
    if (tipo) query.tipo = tipo;
    
    const metricas = await Metrica.find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limite));
    
    res.json({ success: true, data: metricas });
  } catch (error) {
    console.error('Error en GET /servidor/:id/metricas:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ NUEVO: Endpoint para obtener alertas de un servidor ============
router.get('/servidor/:id/alertas', async (req, res) => {
  try {
    const { id } = req.params;
    const { soloNoResueltas, limite = 50 } = req.query;
    
    const query = { expedienteId: id };
    if (soloNoResueltas === 'true') query.resuelta = false;
    
    const alertas = await Alerta.find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limite));
    
    res.json({ success: true, data: alertas });
  } catch (error) {
    console.error('Error en GET /servidor/:id/alertas:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ NUEVO: Endpoint para obtener predicciones de un servidor ============
router.get('/servidor/:id/predicciones', async (req, res) => {
  try {
    const { id } = req.params;
    const { soloActivas, limite = 20 } = req.query;
    
    const query = { expedienteId: id };
    if (soloActivas === 'true') query.acertada = null;
    
    const predicciones = await Prediccion.find(query)
      .sort({ fechaPrediccion: -1 })
      .limit(parseInt(limite));
    
    res.json({ success: true, data: predicciones });
  } catch (error) {
    console.error('Error en GET /servidor/:id/predicciones:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
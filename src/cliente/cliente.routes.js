const express = require('express');
const router = express.Router();
const Cliente = require('../expediente/models/Cliente');
const Expediente = require('../expediente/models/Expediente');
const EventoAuditoria = require('../auditoria/models/EventoAuditoria');

function calcularScorePromedio(servidores) {
  const scores = servidores
    .filter(s => s.instalacion?.resumen?.scoreFinal)
    .map(s => s.instalacion.resumen.scoreFinal);
  return scores.length > 0 
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 0;
}

// ============ TODAS LAS RUTAS SON PÚBLICAS TEMPORALMENTE ============

// ============ CLIENTES CRUD ============

// Obtener todos los clientes
router.get('/', async (req, res) => {
  try {
    const clientes = await Cliente.find().sort({ fechaAlta: -1 });
    res.json({ success: true, data: clientes });
  } catch (error) {
    console.error('Error obteniendo clientes:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener un cliente por ID con sus servidores
router.get('/:id', async (req, res) => {
  try {
    const cliente = await Cliente.findById(req.params.id);
    if (!cliente) {
      return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
    }
    
    const servidores = await Expediente.find({ clienteId: req.params.id });
    
    res.json({ 
      success: true, 
      data: {
        cliente,
        servidores,
        resumen: {
          totalServidores: servidores.length,
          servidoresActivos: servidores.filter(s => s.origen === 'mantenimiento').length,
          servidoresInstalando: servidores.filter(s => s.origen === 'instalacion').length,
          totalPacks: servidores.reduce((sum, s) => sum + (s.instalacion?.software?.length || 0), 0)
        }
      }
    });
  } catch (error) {
    console.error('Error obteniendo cliente:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Crear nuevo cliente
router.post('/', async (req, res) => {
  try {
    const cliente = new Cliente(req.body);
    await cliente.save();
    console.log(`✅ Cliente creado: ${cliente.nombre}`);
    res.json({ success: true, data: cliente });
  } catch (error) {
    console.error('Error creando cliente:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Actualizar cliente
router.put('/:id', async (req, res) => {
  try {
    const cliente = await Cliente.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!cliente) {
      return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
    }
    res.json({ success: true, data: cliente });
  } catch (error) {
    console.error('Error actualizando cliente:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Eliminar cliente (solo si no tiene servidores)
router.delete('/:id', async (req, res) => {
  try {
    const servidores = await Expediente.find({ clienteId: req.params.id });
    if (servidores.length > 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'No se puede eliminar el cliente porque tiene servidores asociados' 
      });
    }
    await Cliente.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Cliente eliminado' });
  } catch (error) {
    console.error('Error eliminando cliente:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ MÉTRICAS Y ESTADÍSTICAS ============

// Obtener estadísticas globales por cliente
router.get('/:id/estadisticas', async (req, res) => {
  try {
    const servidores = await Expediente.find({ clienteId: req.params.id });
    
    const stats = {
      total: servidores.length,
      enMantenimiento: servidores.filter(s => s.origen === 'mantenimiento').length,
      instalando: servidores.filter(s => s.origen === 'instalacion').length,
      fallidos: servidores.filter(s => s.instalacion?.estado === 'fallo').length,
      completados: servidores.filter(s => s.instalacion?.estado === 'completado').length,
      scorePromedio: 0
    };
    
    const scores = servidores.filter(s => s.instalacion?.resumen?.scoreFinal).map(s => s.instalacion.resumen.scoreFinal);
    if (scores.length) {
      stats.scorePromedio = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    }
    
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener métricas avanzadas para dashboard del cliente
router.get('/:id/metricas', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Obtener servidores del cliente
    const servidores = await Expediente.find({ clienteId: id });
    
    // Métricas generales
    const totalServidores = servidores.length;
    const servidoresActivos = servidores.filter(s => s.origen === 'mantenimiento').length;
    const servidoresInstalando = servidores.filter(s => s.origen === 'instalacion').length;
    const servidoresError = servidores.filter(s => s.instalacion?.estado === 'fallo').length;
    
    // Calcular score promedio
    let sumaScores = 0;
    let scoresCount = 0;
    servidores.forEach(s => {
      if (s.instalacion?.resumen?.scoreFinal) {
        sumaScores += s.instalacion.resumen.scoreFinal;
        scoresCount++;
      }
    });
    const scorePromedio = scoresCount > 0 ? Math.round(sumaScores / scoresCount) : 0;
    
    // Calcular uptime promedio
    const uptimePromedio = servidoresActivos > 0 ? Math.round((servidoresActivos / totalServidores) * 100) : 0;
    
    // Métricas de recursos
    let sumaCPU = 0, sumaRAM = 0, sumaDISCO = 0;
    let totalMetricas = 0;
    
    servidores.forEach(s => {
      const metricas = s.mantenimiento?.metricasHistoricas || [];
      const ultimas = metricas.slice(-10);
      ultimas.forEach(m => {
        sumaCPU += m.cpu || 0;
        sumaRAM += m.memoria || 0;
        sumaDISCO += m.disco || 0;
        totalMetricas++;
      });
    });
    
    const cpuPromedio = totalMetricas > 0 ? Math.round(sumaCPU / totalMetricas) : 0;
    const ramPromedio = totalMetricas > 0 ? Math.round(sumaRAM / totalMetricas) : 0;
    const discoPromedio = totalMetricas > 0 ? Math.round(sumaDISCO / totalMetricas) : 0;
    
    // Alertas recientes
    const todasAlertas = [];
    servidores.forEach(s => {
      const alertas = s.mantenimiento?.alertas || [];
      alertas.forEach(a => {
        todasAlertas.push({
          ...a,
          servidorId: s._id,
          servidorNombre: s.nombre
        });
      });
    });
    const alertasRecientes = todasAlertas.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, 10);
    const alertasCriticas = todasAlertas.filter(a => a.tipo === 'error').length;
    const alertasAdvertencia = todasAlertas.filter(a => a.tipo === 'advertencia').length;
    
    // Evolución de métricas (últimos 7 días)
    const evolucion = [];
    const hoy = new Date();
    for (let i = 6; i >= 0; i--) {
      const fecha = new Date(hoy);
      fecha.setDate(fecha.getDate() - i);
      const fechaStr = fecha.toISOString().split('T')[0];
      
      let cpuDia = 0, ramDia = 0, discoDia = 0;
      let countDia = 0;
      
      servidores.forEach(s => {
        const metricas = s.mantenimiento?.metricasHistoricas || [];
        metricas.forEach(m => {
          const mFecha = new Date(m.timestamp).toISOString().split('T')[0];
          if (mFecha === fechaStr) {
            cpuDia += m.cpu || 0;
            ramDia += m.memoria || 0;
            discoDia += m.disco || 0;
            countDia++;
          }
        });
      });
      
      evolucion.push({
        fecha: fechaStr,
        cpu: countDia > 0 ? Math.round(cpuDia / countDia) : 0,
        ram: countDia > 0 ? Math.round(ramDia / countDia) : 0,
        disco: countDia > 0 ? Math.round(discoDia / countDia) : 0
      });
    }
    
    // Servidores con sus métricas individuales
    const servidoresDetalle = servidores.map(s => ({
      _id: s._id,
      nombre: s.nombre,
      ip: s.servidor?.ip,
      pack: s.instalacion?.packNombre,
      estado: s.origen === 'mantenimiento' ? 'activo' : (s.origen === 'instalacion' ? 'instalando' : 'pendiente'),
      score: s.instalacion?.resumen?.scoreFinal || 0,
      ultimasMetricas: (s.mantenimiento?.metricasHistoricas || []).slice(-5).map(m => ({
        cpu: m.cpu,
        memoria: m.memoria,
        disco: m.disco,
        timestamp: m.timestamp
      }))
    }));
    
    res.json({
      success: true,
      data: {
        resumen: {
          totalServidores,
          servidoresActivos,
          servidoresInstalando,
          servidoresError,
          scorePromedio,
          uptimePromedio,
          alertasCriticas,
          alertasAdvertencia
        },
        recursos: {
          cpu: cpuPromedio,
          ram: ramPromedio,
          disco: discoPromedio
        },
        evolucion,
        alertasRecientes,
        servidores: servidoresDetalle
      }
    });
  } catch (error) {
    console.error('Error obteniendo métricas:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ DASHBOARD DEL VISOR (CLIENTE) ============

router.get('/mi-dashboard', async (req, res) => {
  try {
    // Extraer clienteId del header Authorization o query
    // En modo desarrollo, permitir clienteId por query
    const clienteId = req.query.clienteId || req.headers['x-cliente-id'];
    
    if (!clienteId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Se requiere clienteId' 
      });
    }
    
    // Obtener cliente
    const cliente = await Cliente.findById(clienteId);
    if (!cliente) {
      return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
    }
    
    // Obtener servidores de ese cliente
    const servidores = await Expediente.find({ clienteId });
    
    // Calcular métricas específicas del cliente
    const servidoresActivos = servidores.filter(s => s.origen === 'mantenimiento').length;
    const servidoresConAlertas = servidores.filter(s => 
      s.mantenimiento?.alertas && s.mantenimiento.alertas.length > 0
    ).length;
    
    // Recolectar alertas de todos los servidores
    const ultimasAlertas = [];
    servidores.forEach(s => {
      const alertas = s.mantenimiento?.alertas || [];
      alertas.slice(-5).forEach(a => {
        ultimasAlertas.push({ 
          servidorId: s._id,
          servidorNombre: s.nombre, 
          ...a 
        });
      });
    });
    
    // Obtener última actividad de auditoría del cliente
    const ultimosEventos = await EventoAuditoria.find({
      'detalles.clienteId': clienteId
    }).sort({ fecha: -1 }).limit(10).lean();
    
    res.json({
      success: true,
      data: {
        cliente: { 
          id: cliente._id, 
          nombre: cliente.nombre,
          estado: cliente.estado
        },
        resumen: {
          totalServidores: servidores.length,
          servidoresActivos,
          servidoresConAlertas,
          scorePromedio: calcularScorePromedio(servidores)
        },
        servidores: servidores.map(s => ({
          id: s._id,
          nombre: s.nombre,
          ip: s.servidor?.ip,
          estado: s.origen === 'mantenimiento' ? 'activo' : 
                  s.instalacion?.estado === 'instalando' ? 'instalando' : 'pendiente',
          score: s.instalacion?.resumen?.scoreFinal || 0,
          ultimoCheck: s.mantenimiento?.ultimaConexion || null
        })),
        ultimasAlertas: ultimasAlertas
          .sort((a,b) => new Date(b.fecha || 0) - new Date(a.fecha || 0))
          .slice(0, 10),
        ultimosEventos: ultimosEventos.map(e => ({
          tipo: e.tipo,
          fecha: e.fecha,
          detalles: e.detalles
        }))
      }
    });
  } catch (error) {
    console.error('Error en GET /mi-dashboard:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
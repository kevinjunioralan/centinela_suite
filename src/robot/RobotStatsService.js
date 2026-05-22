// backend/src/robot/RobotStatsService.js
const Metrica = require('../expediente/models/Metrica');
const Alerta = require('../expediente/models/Alerta');
const Expediente = require('../expediente/models/Expediente');

class RobotStatsService {
  
  async obtenerEstadisticasGlobales() {
    // Obtener todas las métricas de origen 'robot'
    const metricas = await Metrica.find({ origen: 'robot' })
      .sort({ timestamp: -1 })
      .limit(1000);
    
    // Obtener alertas de origen 'robot'
    const alertas = await Alerta.find({ origen: 'robot' });
    
    // Obtener expedientes que tengan packSeleccionado
    const expedientes = await Expediente.find({ 
      'instalacion.packSeleccionado': { $ne: null },
      origen: 'instalacion'
    });
    
    // Calcular estadísticas por pack
    const statsPorPack = {};
    for (const exp of expedientes) {
      const pack = exp.instalacion.packSeleccionado;
      const packNombre = exp.instalacion.packNombre || pack;
      
      if (!statsPorPack[pack]) {
        statsPorPack[pack] = {
          packId: pack,
          packNombre: packNombre,
          totalCiclos: 0,
          exitosos: 0,
          fallidos: 0,
          scores: [],
          metricas: { cpu: [], ram: [], disco: [] }
        };
      }
      
      statsPorPack[pack].totalCiclos++;
      
      if (exp.instalacion?.resumen?.exitoso) {
        statsPorPack[pack].exitosos++;
      } else {
        statsPorPack[pack].fallidos++;
      }
      
      if (exp.instalacion?.resumen?.scoreFinal) {
        statsPorPack[pack].scores.push(exp.instalacion.resumen.scoreFinal);
      }
    }
    
    // Calcular promedios
    for (const pack of Object.values(statsPorPack)) {
      if (pack.scores.length > 0) {
        pack.scorePromedio = Math.round(pack.scores.reduce((a,b) => a+b, 0) / pack.scores.length);
      } else {
        pack.scorePromedio = 0;
      }
      pack.tasaExito = pack.totalCiclos > 0 ? Math.round((pack.exitosos / pack.totalCiclos) * 100) : 0;
    }
    
    // Métricas recientes
    const metricasRecientes = metricas.slice(0, 50).map(m => ({
      timestamp: m.timestamp,
      tipo: m.tipo,
      valor: m.valor,
      expedienteId: m.expedienteId
    }));
    
    return {
      resumen: {
        totalCiclos: expedientes.length,
        totalExitosos: expedientes.filter(e => e.instalacion?.resumen?.exitoso).length,
        totalFallidos: expedientes.filter(e => !e.instalacion?.resumen?.exitoso && e.instalacion?.resumen).length,
        totalAlertas: alertas.length,
        totalMetricas: metricas.length
      },
      statsPorPack: Object.values(statsPorPack),
      metricasRecientes,
      ultimaActualizacion: new Date().toISOString()
    };
  }
  
  async obtenerCiclosRecientes(limite = 50) {
    const expedientes = await Expediente.find({ 
      'instalacion.packSeleccionado': { $ne: null },
      origen: 'instalacion'
    })
    .sort({ createdAt: -1 })
    .limit(limite)
    .lean();
    
    const ciclos = [];
    for (const exp of expedientes) {
      ciclos.push({
        id: exp._id,
        timestamp: exp.createdAt,
        packId: exp.instalacion.packSeleccionado,
        packNombre: exp.instalacion.packNombre,
        score: exp.instalacion?.resumen?.scoreFinal || 0,
        exitoso: exp.instalacion?.resumen?.exitoso || false,
        duracion: exp.instalacion?.resumen?.tiempoTotalMinutos || 0,
        metricas: {
          cpu: exp.instalacion?.verificacion?.tests?.find(t => t.nombre === 'nginx')?.resultado ? 'OK' : 'N/A',
          ram: exp.instalacion?.verificacion?.score || 0
        }
      });
    }
    
    return ciclos;
  }
}

module.exports = RobotStatsService;
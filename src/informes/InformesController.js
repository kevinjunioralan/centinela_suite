// InformesController.js - Controlador de informes
const InformeService = require('../pruebas/Informe/Informe.js');
const AuditoriaService = require('../auditoria/AuditoriaService');
const Metrica = require('../expediente/models/Metrica');
const Alerta = require('../expediente/models/Alerta');
const InformeGenerado = require('./models/InformeGenerado');

class InformesController {
  constructor() {
    this.informeService = new InformeService();
    this.auditoriaService = new AuditoriaService();
  }

  /**
   * Obtiene un informe por ID (original - para pruebas)
   * @param {Object} req - Objeto de solicitud
   * @param {Object} res - Objeto de respuesta
   * @returns {Promise<void>}
   */
  async obtenerInforme(req, res) {
    try {
      const { id } = req.params;
      
      // Validaciones
      if (!id || isNaN(id)) {
        return res.status(400).json({ 
          success: false, 
          error: 'ID es requerido y debe ser numérico' 
        });
      }

      const resultado = await this.informeService.obtener(id);
      
      if (resultado.success) {
        res.json({ 
          success: true, 
          data: resultado.data 
        });
      } else {
        res.status(404).json({ 
          success: false, 
          error: resultado.error || 'Informe no encontrado' 
        });
      }
    } catch (error) {
      console.error('Error en obtenerInforme:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Error interno del servidor' 
      });
    }
  }

  // ============ NUEVOS ENDPOINTS PARA MANTENIMIENTO ============

  /**
   * Obtiene un informe de mantenimiento por expedienteId
   * @param {Object} req - Objeto de solicitud
   * @param {Object} res - Objeto de respuesta
   */
  async obtenerInformeMantenimiento(req, res) {
    try {
      const { id } = req.params; // id del expediente
      
      if (!id) {
        return res.status(400).json({ 
          success: false, 
          error: 'ID de expediente es requerido' 
        });
      }

      let informe = null;

      // Verificar si el servicio tiene método para mantenimiento
      if (typeof this.informeService.obtenerInformeMantenimiento === 'function') {
        const resultado = await this.informeService.obtenerInformeMantenimiento(id);
        
        if (resultado.success && this._informeTieneDatos(resultado.data)) {
          informe = resultado.data;
        }
      }

      // Fallback robusto: si el servicio no devolvió datos útiles, reconstruir desde BD real.
      if (!informe) {
        informe = await this.generarInformeMantenimientoDesdeExpediente(id);
      }

      await this._registrarMetadataInforme({
        tipo: 'mantenimiento_json',
        formato: 'json',
        expedienteId: id,
        generadoPor: req.usuario?.username || 'sistema',
        detalles: {
          modulo: 'mantenimiento',
          estadoGeneral: informe.resumen?.estadoGeneral || null,
          puntuacionSalud: informe.resumen?.puntuacionSalud || null
        }
      });
      
      // 🔥 REGISTRAR EVENTO DE AUDITORÍA DE GENERACIÓN DE INFORME
      try {
        await this.auditoriaService.registrarEvento(
          'generacion_informe',
          req.usuario?.username || 'sistema',
          {
            modulo: 'informes',
            expedienteId: id,
            detalles: {
              tipoInforme: 'mantenimiento',
              puntuacionSalud: informe.resumen?.puntuacionSalud,
              recomendacionesCount: informe.resumen?.recomendaciones?.length || 0
            }
          }
        );
      } catch (auditErr) {
        console.warn('⚠️ Error registrando auditoría de informe:', auditErr.message);
      }
      
      res.json({ success: true, data: informe });
      
    } catch (error) {
      console.error('Error en obtenerInformeMantenimiento:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message || 'Error interno del servidor' 
      });
    }
  }

  /**
   * Regenera un informe de mantenimiento
   * @param {Object} req - Objeto de solicitud
   * @param {Object} res - Objeto de respuesta
   */
  async regenerarInformeMantenimiento(req, res) {
    try {
      const { id } = req.params; // id del expediente
      
      if (!id) {
        return res.status(400).json({ 
          success: false, 
          error: 'ID de expediente es requerido' 
        });
      }

      // Forzar regeneración con datos frescos
      const informe = await this.generarInformeMantenimientoDesdeExpediente(id, true);

      await this._registrarMetadataInforme({
        tipo: 'mantenimiento_json',
        formato: 'json',
        expedienteId: id,
        generadoPor: req.usuario?.username || 'sistema',
        detalles: {
          regenerado: true,
          modulo: 'mantenimiento',
          estadoGeneral: informe.resumen?.estadoGeneral || null,
          puntuacionSalud: informe.resumen?.puntuacionSalud || null
        }
      });

      res.json({ success: true, data: informe });
      
    } catch (error) {
      console.error('Error en regenerarInformeMantenimiento:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message || 'Error interno del servidor' 
      });
    }
  }

  /**
   * Genera un informe de mantenimiento desde los datos del expediente
   * @param {string} expedienteId - ID del expediente
   * @param {boolean} forzarRegeneracion - Si debe forzar regeneración
   */
  async generarInformeMantenimientoDesdeExpediente(expedienteId, forzarRegeneracion = false) {
    const Expediente = require('../expediente/models/Expediente');
    
    const expediente = await Expediente.findById(expedienteId);
    if (!expediente) {
      throw new Error('Expediente no encontrado');
    }
    
    const metricasEmbebidas = expediente.mantenimiento?.metricasHistoricas || [];
    const alertasEmbebidas = expediente.mantenimiento?.alertas || [];
    const metricas = await this._obtenerMetricasCompatibles(expediente._id, metricasEmbebidas);
    const alertas = await this._obtenerAlertasCompatibles(expediente._id, alertasEmbebidas);
    
    // Calcular métricas promedio
    let sumaCPU = 0, sumaRAM = 0, sumaDISCO = 0;
    metricas.forEach(m => {
      sumaCPU += m.cpu || 0;
      sumaRAM += m.memoria || 0;
      sumaDISCO += m.disco || 0;
    });
    
    const promedioCPU = metricas.length ? (sumaCPU / metricas.length).toFixed(1) : 0;
    const promedioRAM = metricas.length ? (sumaRAM / metricas.length).toFixed(1) : 0;
    const promedioDISCO = metricas.length ? (sumaDISCO / metricas.length).toFixed(1) : 0;
    
    // Calcular puntuación de salud
    const puntuacionSalud = this._calcularScoreSalud(metricas, alertas);
    
    // Generar recomendaciones
    const recomendaciones = this._generarRecomendacionesInforme(metricas, alertas);
    
    return {
      modulo: 'mantenimiento',
      expedienteId: expediente._id,
      expedienteNombre: expediente.nombre,
      fechaGeneracion: new Date().toISOString(),
      resumen: {
        estadoGeneral: this._determinarEstadoGeneral(metricas, alertas),
        estadoCustodia: expediente.mantenimiento?.estadoCustodia || 'pendiente',
        puntuacionSalud,
        tiempoCustodia: this._calcularTiempoCustodia(expediente.mantenimiento?.fechaIngreso),
        recomendaciones
      },
      metricas: {
        promedioCPU,
        promedioRAM,
        promedioDISCO,
        historial: metricas.slice(-100)
      },
      alertas: alertas.slice(-20),
      predicciones: await this._generarPrediccionesBasicas(metricas, alertas)
    };
  }

  // ============ MÉTODOS AUXILIARES PRIVADOS ============

  _calcularScoreSalud(metricas, alertas) {
    if (metricas.length === 0) return 50;
    
    let score = 100;
    const ultimasMetricas = metricas.slice(-10);
    
    ultimasMetricas.forEach(m => {
      if (m.cpu > 80) score -= 2;
      if (m.memoria > 85) score -= 2;
      if (m.disco > 90) score -= 3;
    });
    
    score -= alertas.filter(a => a.tipo === 'error').length * 5;
    score -= alertas.filter(a => a.tipo === 'advertencia').length * 2;
    
    return Math.max(0, Math.min(100, score));
  }

  _determinarEstadoGeneral(metricas, alertas) {
    if (alertas.filter(a => a.tipo === 'error').length > 5) return 'Crítico';
    if (alertas.filter(a => a.tipo === 'advertencia').length > 10) return 'Atención';
    if (metricas.length === 0) return 'Sin datos';
    return 'Estable';
  }

  _calcularTiempoCustodia(fechaIngreso) {
    if (!fechaIngreso) return 0;
    const ingreso = new Date(fechaIngreso);
    return Math.floor((Date.now() - ingreso) / (1000 * 60 * 60 * 24));
  }

  _generarRecomendacionesInforme(metricas, alertas) {
    const recomendaciones = [];
    const ultimasMetricas = metricas.slice(-20);
    
    if (ultimasMetricas.length === 0) {
      recomendaciones.push('Iniciar recolección de métricas para análisis completo');
      return recomendaciones;
    }
    
    const cpuPromedio = ultimasMetricas.reduce((s, m) => s + (m.cpu || 0), 0) / ultimasMetricas.length;
    const ramPromedio = ultimasMetricas.reduce((s, m) => s + (m.memoria || 0), 0) / ultimasMetricas.length;
    
    if (cpuPromedio > 75) recomendaciones.push('Alto uso de CPU - Considerar escalar recursos');
    if (ramPromedio > 80) recomendaciones.push('Memoria RAM cerca del límite - Revisar procesos');
    if (alertas.filter(a => a.tipo === 'error').length > 3) {
      recomendaciones.push('Múltiples errores detectados - Revisión inmediata recomendada');
    }
    
    if (recomendaciones.length === 0) {
      recomendaciones.push('Servidor estable - Continuar monitoreo normal');
    }
    
    return recomendaciones;
  }

  async _generarPrediccionesBasicas(metricas, alertas) {
    if (metricas.length < 10) {
      return { probabilidadFallo: 10, componenteCritico: 'Sin datos', recomendacion: 'Recolectar más métricas' };
    }
    
    const ultimasCPU = metricas.slice(-5).map(m => m.cpu || 0);
    const tendenciaCPU = ultimasCPU[ultimasCPU.length - 1] - ultimasCPU[0];
    
    let probabilidad = 15;
    let componenteCritico = 'Ninguno';
    
    if (tendenciaCPU > 10) {
      probabilidad = 65;
      componenteCritico = 'CPU';
    } else if (tendenciaCPU > 5) {
      probabilidad = 40;
      componenteCritico = 'Posible CPU';
    }
    
    probabilidad += alertas.filter(a => a.tipo === 'error').length * 3;
    
    return {
      probabilidadFallo: Math.min(95, probabilidad),
      componenteCritico,
      recomendacion: probabilidad > 50 ? 'Programar mantenimiento preventivo' : 'Monitoreo continuo'
    };
  }

  _informeTieneDatos(informe) {
    if (!informe) return false;
    const historial = Array.isArray(informe.metricas?.historial) ? informe.metricas.historial : [];
    const alertas = Array.isArray(informe.alertas) ? informe.alertas : [];
    return historial.length > 0 || alertas.length > 0;
  }

  _agruparMetricasPorTimestamp(metricasRaw = []) {
    const buckets = new Map();

    for (const item of metricasRaw) {
      const ts = new Date(item.timestamp || Date.now()).toISOString().slice(0, 16);
      if (!buckets.has(ts)) {
        buckets.set(ts, { timestamp: ts, cpu: null, memoria: null, disco: null });
      }

      const fila = buckets.get(ts);
      if (item.tipo === 'cpu') fila.cpu = item.valor;
      if (item.tipo === 'ram') fila.memoria = item.valor;
      if (item.tipo === 'disco') fila.disco = item.valor;
    }

    return Array.from(buckets.values())
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .map((row) => ({
        timestamp: row.timestamp,
        cpu: row.cpu ?? 0,
        memoria: row.memoria ?? 0,
        disco: row.disco ?? 0
      }));
  }

  async _obtenerMetricasCompatibles(expedienteId, metricasEmbebidas = []) {
    if (Array.isArray(metricasEmbebidas) && metricasEmbebidas.length > 0) {
      return metricasEmbebidas;
    }

    const metricasRaw = await Metrica.find({
      expedienteId,
      tipo: { $in: ['cpu', 'ram', 'disco'] }
    })
      .sort({ timestamp: -1 })
      .limit(180)
      .lean();

    return this._agruparMetricasPorTimestamp(metricasRaw);
  }

  async _obtenerAlertasCompatibles(expedienteId, alertasEmbebidas = []) {
    if (Array.isArray(alertasEmbebidas) && alertasEmbebidas.length > 0) {
      return alertasEmbebidas;
    }

    return Alerta.find({ expedienteId })
      .sort({ timestamp: -1 })
      .limit(100)
      .lean();
  }

  async _registrarMetadataInforme(payload) {
    try {
      await InformeGenerado.create({
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
      console.warn('No se pudo registrar metadata del informe:', error.message);
    }
  }
}

module.exports = InformesController;
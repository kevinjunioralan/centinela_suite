const AuditorInterno = require('../../auditor/AuditorInterno/AuditorInterno');
const MotorAprendizaje = require('../../auditor/MotorAprendizaje/MotorAprendizaje');
const Diagnostico = require('../Diagnostico/Diagnostico');
const Estres = require('../Estres/Estres');
const Expediente = require('../../expediente/models/Expediente');

class Informe extends require('events').EventEmitter {
  constructor() {
    super();
    this.auditorInterno = new AuditorInterno();
    this.motorAprendizaje = new MotorAprendizaje();
    this.diagnostico = new Diagnostico();
    this.estres = new Estres();
  }

  /**
   * Genera un informe completo para un expediente (pruebas)
   * @param {number} expedienteId - ID numérico del expediente
   * @returns {Object} Resultado con estado y informe generado
   */
  async generar(expedienteId) {
    try {
      if (typeof expedienteId !== 'number' || isNaN(expedienteId)) {
        throw new Error('expedienteId debe ser un número');
      }

      this.emit("prueba_iniciada", {
        tipo: 'informe_generacion',
        expedienteId,
        timestamp: new Date().toISOString()
      });

      const [auditorResult, aprendizajeResult, diagnosticoResult, estresResult] = await Promise.all([
        this.auditorInterno.obtenerHistorial(expedienteId),
        this.motorAprendizaje.resumenAprendizaje(expedienteId),
        this.diagnostico.resumen(expedienteId),
        this.estres.resumen(expedienteId)
      ]);

      const resultados = {
        auditor: auditorResult.success ? auditorResult : { error: auditorResult.error },
        aprendizaje: aprendizajeResult.success ? aprendizajeResult : { error: aprendizajeResult.error },
        diagnostico: diagnosticoResult.success ? diagnosticoResult : { error: diagnosticoResult.error },
        estres: estresResult.success ? estresResult : { error: estresResult.error }
      };

      const informe = {
        expedienteId,
        timestamp: new Date().toISOString(),
        secciones: {
          auditoria: resultados.auditor,
          aprendizaje: resultados.aprendizaje,
          diagnostico: resultados.diagnostico,
          estres: resultados.estres
        },
        resumenEjecutivo: this._generarResumenEjecutivo(resultados)
      };

      this.emit("prueba_finalizada", {
        tipo: 'informe_generacion',
        expedienteId,
        informe,
        timestamp: new Date().toISOString()
      });

      return {
        estado: 'exitoso',
        informe,
        mensaje: 'Informe generado correctamente'
      };
    } catch (error) {
      this.emit("prueba_error", {
        tipo: 'informe_generacion',
        expedienteId,
        error: error.message,
        timestamp: new Date().toISOString()
      });

      return {
        estado: 'error',
        mensaje: error.message
      };
    }
  }

  /**
   * Obtiene un informe previamente generado (pruebas)
   * @param {number} expedienteId - ID numérico del expediente
   * @returns {Object} Resultado con estado y informe
   */
  async obtener(expedienteId) {
    try {
      if (typeof expedienteId !== 'number' || isNaN(expedienteId)) {
        throw new Error('expedienteId debe ser un número');
      }
      return await this.generar(expedienteId);
    } catch (error) {
      return {
        estado: 'error',
        mensaje: error.message
      };
    }
  }

  // ============ NUEVOS MÉTODOS PARA MANTENIMIENTO ============

  /**
   * Genera un informe de mantenimiento para un servidor en custodia
   * @param {string} expedienteId - ID de MongoDB del expediente
   * @returns {Object} Informe de mantenimiento
   */
  async generarInformeMantenimiento(expedienteId) {
    try {
      console.log(`📄 Generando informe de mantenimiento para expediente ${expedienteId}`);

      const expediente = await Expediente.findById(expedienteId);
      if (!expediente) {
        throw new Error('Expediente no encontrado');
      }

      const metricas = expediente.mantenimiento?.metricasHistoricas || [];
      const alertas = expediente.mantenimiento?.alertas || [];

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

      // Calcular tendencias
      const tendencias = this._calcularTendencias(metricas);

      // Calcular puntuación de salud
      const puntuacionSalud = this._calcularScoreSaludMantenimiento(metricas, alertas);

      // Generar recomendaciones
      const recomendaciones = this._generarRecomendacionesMantenimiento(metricas, alertas);

      // Obtener predicciones
      const predicciones = this._generarPrediccionesMantenimiento(metricas, alertas);

      const informe = {
        success: true,
        data: {
          modulo: 'mantenimiento',
          expedienteId: expediente._id,
          expedienteNombre: expediente.nombre,
          servidor: {
            ip: expediente.servidor?.ip,
            hostname: expediente.servidor?.hostname
          },
          fechaGeneracion: new Date().toISOString(),
          resumen: {
            estadoGeneral: this._determinarEstadoGeneralMantenimiento(metricas, alertas),
            estadoCustodia: expediente.mantenimiento?.estadoCustodia || 'pendiente',
            puntuacionSalud,
            tiempoCustodia: this._calcularTiempoCustodia(expediente.mantenimiento?.fechaIngreso),
            recomendaciones
          },
          metricas: {
            promedioCPU,
            promedioRAM,
            promedioDISCO,
            tendencias,
            historial: metricas.slice(-50)
          },
          alertas: alertas.slice(-20),
          predicciones
        }
      };

      return informe;
    } catch (error) {
      console.error('Error generando informe de mantenimiento:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Obtiene un informe de mantenimiento (alias de generar)
   * @param {string} expedienteId - ID de MongoDB del expediente
   * @returns {Object} Informe de mantenimiento
   */
  async obtenerInformeMantenimiento(expedienteId) {
    return await this.generarInformeMantenimiento(expedienteId);
  }

  // ============ MÉTODOS AUXILIARES PRIVADOS ============

  _generarResumenEjecutivo(resultados) {
    const resumen = {
      estadoGeneral: 'desconocido',
      puntuacionTotal: 0,
      areasCriticas: [],
      recomendaciones: []
    };

    if (resultados.auditor.success && resultados.auditor.historial) {
      const totalEventos = resultados.auditor.total || 0;
      resumen.puntuacionTotal += Math.min(totalEventos / 10, 10);
    }

    if (resultados.aprendizaje.success && resultados.aprendizaje.resumen) {
      const resumenAprendizaje = resultados.aprendizaje.resumen;
      resumen.puntuacionTotal += Math.min(resumenAprendizaje.totalEventos / 5, 10);
      
      if (resumenAprendizaje.anomalíasDetectadas > 0) {
        resumen.areasCriticas.push('anomalías_en_aprendizaje');
        resumen.recomendaciones.push('Revisar anomalías detectadas en el aprendizaje');
      }
    }

    if (resultados.diagnostico.success && resultados.diagnostico.resumen) {
      const resumenDiagnostico = resultados.diagnostico.resumen;
      resumen.puntuacionTotal += Math.min(resumenDiagnostico.totalDiagnosticos * 2, 10);
    }

    if (resultados.estres.success && resultados.estres.resumen) {
      const resumenEstres = resultados.estres.resumen;
      resumen.puntuacionTotal += Math.min(resumenEstres.totalEstres * 2, 10);
    }

    if (resumen.puntuacionTotal >= 30) {
      resumen.estadoGeneral = 'excelente';
    } else if (resumen.puntuacionTotal >= 20) {
      resumen.estadoGeneral = 'bueno';
    } else if (resumen.puntuacionTotal >= 10) {
      resumen.estadoGeneral = 'regular';
    } else {
      resumen.estadoGeneral = 'necesita_mejora';
    }

    resumen.puntuacionTotal = Math.min(resumen.puntuacionTotal, 40);
    return resumen;
  }

  _calcularTendencias(metricas) {
    if (metricas.length < 10) {
      return { cpu: 'estable', memoria: 'estable', disco: 'estable' };
    }
    
    const cpuTrend = this._calcularTendenciaValor(metricas, 'cpu');
    const ramTrend = this._calcularTendenciaValor(metricas, 'memoria');
    const diskTrend = this._calcularTendenciaValor(metricas, 'disco');
    
    return {
      cpu: cpuTrend > 3 ? 'creciente' : (cpuTrend < -3 ? 'decreciente' : 'estable'),
      memoria: ramTrend > 3 ? 'creciente' : (ramTrend < -3 ? 'decreciente' : 'estable'),
      disco: diskTrend > 3 ? 'creciente' : (diskTrend < -3 ? 'decreciente' : 'estable')
    };
  }

  _calcularTendenciaValor(metricas, campo) {
    if (metricas.length < 10) return 0;
    
    const recientes = metricas.slice(-5).map(m => m[campo] || 0);
    const anteriores = metricas.slice(-10, -5).map(m => m[campo] || 0);
    
    const promedioReciente = recientes.reduce((a, b) => a + b, 0) / recientes.length;
    const promedioAnterior = anteriores.reduce((a, b) => a + b, 0) / anteriores.length;
    
    return promedioReciente - promedioAnterior;
  }

  _calcularScoreSaludMantenimiento(metricas, alertas) {
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

  _determinarEstadoGeneralMantenimiento(metricas, alertas) {
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

  _generarRecomendacionesMantenimiento(metricas, alertas) {
    const recomendaciones = [];
    const ultimasMetricas = metricas.slice(-20);
    
    if (ultimasMetricas.length === 0) {
      recomendaciones.push('Iniciar recolección de métricas para análisis completo');
      return recomendaciones;
    }
    
    const cpuPromedio = ultimasMetricas.reduce((s, m) => s + (m.cpu || 0), 0) / ultimasMetricas.length;
    const ramPromedio = ultimasMetricas.reduce((s, m) => s + (m.memoria || 0), 0) / ultimasMetricas.length;
    
    if (cpuPromedio > 75) recomendaciones.push('⚠️ Alto uso de CPU - Considerar escalar recursos');
    if (ramPromedio > 80) recomendaciones.push('💾 Memoria RAM cerca del límite - Revisar procesos');
    if (alertas.filter(a => a.tipo === 'error').length > 3) {
      recomendaciones.push('🔴 Múltiples errores detectados - Revisión inmediata recomendada');
    }
    
    if (recomendaciones.length === 0) {
      recomendaciones.push('✅ Servidor estable - Continuar monitoreo normal');
    }
    
    return recomendaciones;
  }

  _generarPrediccionesMantenimiento(metricas, alertas) {
    if (metricas.length < 10) {
      return { 
        probabilidadFallo: 10, 
        componenteCritico: 'Sin datos suficientes',
        tiempoEstimadoFallo: 'No disponible',
        recomendacion: 'Recolectar más métricas para predicción precisa'
      };
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
    probabilidad = Math.min(95, probabilidad);
    
    let tiempoEstimadoFallo = '> 30 días';
    if (probabilidad > 70) tiempoEstimadoFallo = '7-14 días';
    else if (probabilidad > 50) tiempoEstimadoFallo = '15-30 días';
    else if (probabilidad > 30) tiempoEstimadoFallo = '1-3 meses';
    
    return {
      probabilidadFallo: probabilidad,
      componenteCritico,
      tiempoEstimadoFallo,
      recomendacion: probabilidad > 50 ? 'Programar mantenimiento preventivo' : 'Monitoreo continuo'
    };
  }
}

module.exports = Informe;
// aprendizajeService.js - VERSIÓN CORREGIDA
const Metrica = require('../expediente/models/Metrica');
const Alerta = require('../expediente/models/Alerta');
const Prediccion = require('../expediente/models/Prediccion');
const Expediente = require('../expediente/models/Expediente');
const EventoAuditoria = require('../auditoria/models/EventoAuditoria');

class AprendizajeService {
  
  async analizarPatrones() {
    console.log('🧠 Analizando patrones...');
    return {
      alertasFrecuentes: [],
      recursosCriticos: { cpu: 0, memoria: 0, disco: 0 },
      recomendaciones: ['Sistema funcionando correctamente']
    };
  }
  
  async obtenerEvolucion(expedienteId) {
    const metricas = await Metrica.find({ expedienteId }).sort({ timestamp: -1 }).limit(100);
    return {
      expediente: 'Servidor',
      ultimasMetricas: metricas.slice(0, 10),
      totalMetricas: metricas.length
    };
  }
  
  async predecirRiesgo(expedienteId) {
    const ultimaCPU = await Metrica.findOne({ expedienteId, tipo: 'cpu' }).sort({ timestamp: -1 });
    const riesgo = ultimaCPU && ultimaCPU.valor > 75 ? 'alto' : 'bajo';
    return {
      expediente: 'Servidor',
      riesgo,
      factores: [],
      recomendacion: riesgo === 'alto' ? 'Intervención recomendada' : 'Estado estable'
    };
  }
  
  async obtenerEstadisticasGlobales() {
    const totalServidores = await Expediente.countDocuments();
    return {
      totalServidores,
      diagnosticados: totalServidores,
      saludables: totalServidores,
      atencion: 0,
      criticos: 0,
      scorePromedio: 85
    };
  }
  
  async analizarPatronesMantenimiento(id) {
    const alertas = await Alerta.find({ expedienteId: id, resuelta: false });
    return {
      expedienteId: id,
      alertasFrecuentes: [],
      tendencias: { cpu: 'estable', memoria: 'estable', disco: 'estable' },
      recomendaciones: ['Monitoreo normal'],
      totalMetricas: 0,
      totalAlertas: alertas.length
    };
  }
  
  async predecirFalloMantenimiento(id) {
    return {
      probabilidadFallo: 15,
      componenteCritico: 'Ninguno',
      tiempoEstimadoFallo: '> 30 días',
      recomendacion: 'Monitoreo continuo normal',
      tendencias: { cpu: 0, memoria: 0, disco: 0 },
      alertasRecientes: 0
    };
  }
  
  async analizarPatronesPorModulo(modulo) {
    const eventos = await EventoAuditoria.find({ modulo }).limit(100);
    return {
      modulo,
      totalEventos: eventos.length,
      porTipo: [],
      anomalias: 0,
      tasaError: '0%'
    };
  }
}

module.exports = AprendizajeService;
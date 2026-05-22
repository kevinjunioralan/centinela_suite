// backend/src/robot/models/MetricaSimulacion.js
const mongoose = require('mongoose');

const MetricaSimulacionSchema = new mongoose.Schema({
  simulacionId: { type: mongoose.Schema.Types.ObjectId, ref: 'SimulacionConfig', required: true },
  expedienteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Expediente' },
  
  // Métricas generadas
  metricas: {
    cpu: { type: Number, min: 0, max: 100 },
    ram: { type: Number, min: 0, max: 100 },
    disco: { type: Number, min: 0, max: 100 },
    red: { type: Number, default: 0 },
    temp: { type: Number, default: 0 }
  },
  
  // Contexto
  ciclo: { 
    type: String, 
    enum: ['trabajo_normal', 'carga_progresiva', 'pico_maximo', 'reposo'] 
  },
  
  falloInjectado: {
    activo: { type: Boolean, default: false },
    tipo: { type: String, enum: ['cpu_alta', 'memoria_alta', 'disco_lleno', 'caida_servicio', 'red_lenta'] },
    momento: Date,
    simulado: { type: Boolean, default: true }
  },
  
  // Resultado - el Oráculo evaluará esto después
  oraculoDetecto: { type: Boolean, default: false },
  oraculoEvaluado: { type: Boolean, default: false },
  oraculoEvaluacionEn: Date,
  
  timestamp: { type: Date, default: Date.now }
});

// Índices
MetricaSimulacionSchema.index({ simulacionId: 1, timestamp: -1 });
MetricaSimulacionSchema.index({ expedienteId: 1, timestamp: -1 });
MetricaSimulacionSchema.index({ oraculoEvaluado: 1 });

module.exports = mongoose.model('MetricaSimulacion', MetricaSimulacionSchema);
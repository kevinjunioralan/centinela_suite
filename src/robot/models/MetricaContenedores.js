// backend/src/robot/models/MetricaContenedores.js
const mongoose = require('mongoose');

const MetricaContenedoresSchema = new mongoose.Schema({
  simulacionId: { type: mongoose.Schema.Types.ObjectId, ref: 'SimulacionContenedores', required: true },
  expedienteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Expediente' },
  
  metricas: {
    contenedoresTotales: { type: Number, default: 0 },
    contenedoresRunning: { type: Number, default: 0 },
    contenedoresStopped: { type: Number, default: 0 },
    contenedoresFailed: { type: Number, default: 0 },
    imagenesLocal: { type: Number, default: 0 },
    volumenesUsados: { type: Number, default: 0 },
    usoCPU: { type: Number, default: 0 },           // % total CPU
    usoRAM: { type: Number, default: 0 },           // % total RAM
    tiempoDespliegue: { type: Number, default: 0 }, // segundos
    contenedorMasCargado: { type: String, default: '' }
  },
  
  pruebaActiva: {
    type: String,
    enum: ['despliegue', 'escalamiento', 'carga_maxima', 'limpieza', 'reposo']
  },
  
  falloInjectado: {
    activo: { type: Boolean, default: false },
    tipo: { type: String, enum: ['no_arranca', 'recursos_limitados', 'caida_red', 'imagen_corrupta', 'puerto_conflicto'] }
  },
  
  timestamp: { type: Date, default: Date.now }
});

MetricaContenedoresSchema.index({ simulacionId: 1, timestamp: -1 });

module.exports = mongoose.model('MetricaContenedores', MetricaContenedoresSchema);
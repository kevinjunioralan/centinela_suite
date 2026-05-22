// backend/src/robot/models/MetricaBD.js
const mongoose = require('mongoose');

const MetricaBDSchema = new mongoose.Schema({
  simulacionId: { type: mongoose.Schema.Types.ObjectId, ref: 'SimulacionBD', required: true },
  expedienteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Expediente' },
  
  metricas: {
    tiempoRespuesta: { type: Number, default: 0 },      // ms
    conexionesActivas: { type: Number, default: 0 },
    consultasPorSegundo: { type: Number, default: 0 },
    tamanioBD: { type: Number, default: 0 },            // MB
    tiempoBackup: { type: Number, default: 0 },         // segundos
    usoCPU: { type: Number, default: 0 },               // %
    usoRAM: { type: Number, default: 0 }                // %
  },
  
  pruebaActiva: {
    type: String,
    enum: ['consultas_simples', 'consultas_complejas', 'consultas_masivas', 'transacciones', 'backup', 'reposo']
  },
  
  falloInjectado: {
    activo: { type: Boolean, default: false },
    tipo: { type: String, enum: ['query_lenta', 'deadlock', 'pool_agotado', 'tabla_corrupta', 'backup_lento'] }
  },
  
  timestamp: { type: Date, default: Date.now }
});

MetricaBDSchema.index({ simulacionId: 1, timestamp: -1 });

module.exports = mongoose.model('MetricaBD', MetricaBDSchema);
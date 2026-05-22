// backend/src/robot/models/MetricaRed.js
const mongoose = require('mongoose');

const MetricaRedSchema = new mongoose.Schema({
  simulacionId: { type: mongoose.Schema.Types.ObjectId, ref: 'SimulacionRed', required: true },
  expedienteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Expediente' },
  metricas: {
    latencia: { type: Number, default: 0 },
    perdida: { type: Number, default: 0 },
    anchoBanda: { type: Number, default: 0 }
  },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('MetricaRed', MetricaRedSchema);
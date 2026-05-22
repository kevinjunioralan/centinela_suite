const mongoose = require('mongoose');

const ObservacionOraculoSchema = new mongoose.Schema({
  tipo: {
    type: String,
    enum: ['alerta_sistema', 'prediccion_corregida', 'recomendacion', 'anomalia', 'error_recurrente'],
    required: true
  },
  nivel: {
    type: String,
    enum: ['INFO', 'ADVERTENCIA', 'CRÍTICA'],
    default: 'INFO'
  },
  modulo: { type: String, required: true },
  expedienteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Expediente', default: null },
  observacion: { type: String, required: true },
  detalles: { type: Object, default: {} },
  resuelta: { type: Boolean, default: false },
  fecha: { type: Date, default: Date.now }
}, { timestamps: true });

ObservacionOraculoSchema.index({ modulo: 1, resuelta: 1, fecha: -1 });

module.exports = mongoose.models.ObservacionOraculo || mongoose.model('ObservacionOraculo', ObservacionOraculoSchema);
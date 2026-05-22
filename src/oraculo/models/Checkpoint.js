// backend/src/oraculo/models/Checkpoint.js
const mongoose = require('mongoose');

// Limpiar caché del modelo si existe
if (mongoose.models.Checkpoint) {
  delete mongoose.models.Checkpoint;
}

const CheckpointSchema = new mongoose.Schema({
  checkpointId: { 
    type: String, 
    required: true, 
    unique: true
  },
  origen: { 
    type: String, 
    enum: ['real', 'espejo'], 
    required: true 
  },
  punto: { 
    type: Number, 
    required: true 
  },
  snapshot: {
    totalExpedientes: Number,
    totalAlertas: Number,
    ultimaMetrica: Date,
    ultimaAccion: String,
    expedientesIds: [mongoose.Schema.Types.ObjectId],
    metricasUltimaHora: Number,
    hash: String
  },
  creadoPor: { 
    type: String, 
    default: 'oraculo' 
  },
  tamanoKB: Number,
  tiempoGeneracion: Number,
  restaurado: { 
    type: Boolean, 
    default: false 
  },
  restauradoEn: Date,
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

module.exports = mongoose.model('Checkpoint', CheckpointSchema);
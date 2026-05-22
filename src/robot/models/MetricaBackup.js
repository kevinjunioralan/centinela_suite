// backend/src/robot/models/MetricaBackup.js
const mongoose = require('mongoose');

const MetricaBackupSchema = new mongoose.Schema({
  simulacionId: { type: mongoose.Schema.Types.ObjectId, ref: 'SimulacionBackup', required: true },
  expedienteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Expediente' },
  
  metricas: {
    tiempoBackup: { type: Number, default: 0 },        // segundos
    tamanoBackup: { type: Number, default: 0 },        // MB
    tamanoOriginal: { type: Number, default: 0 },      // MB
    tasaCompresion: { type: Number, default: 0 },      // %
    integridad: { type: String, enum: ['valido', 'corrupto'], default: 'valido' },
    espacioDisponible: { type: Number, default: 0 },   // MB
    tiempoRestauracion: { type: Number, default: 0 },  // segundos
    tipoBackup: { type: String, enum: ['completo', 'incremental'], default: 'completo' }
  },
  
  pruebaActiva: {
    type: String,
    enum: ['backup_normal', 'backup_grande', 'backup_compresion', 'restauracion', 'reposo']
  },
  
  falloInjectado: {
    activo: { type: Boolean, default: false },
    tipo: { type: String, enum: ['corrupto', 'espacio_insuficiente', 'timeout', 'restauracion_fallida'] }
  },
  
  timestamp: { type: Date, default: Date.now }
});

MetricaBackupSchema.index({ simulacionId: 1, timestamp: -1 });

module.exports = mongoose.model('MetricaBackup', MetricaBackupSchema);
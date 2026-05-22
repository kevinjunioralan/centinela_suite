// backend/src/robot/models/SimulacionBackup.js
const mongoose = require('mongoose');

const SimulacionBackupSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  activa: { type: Boolean, default: false },
  servidor: {
    ip: { type: String, required: true },
    puerto: { type: Number, default: 22 },
    usuario: { type: String, required: true },
    password: { type: String, required: true }
  },
  expedienteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Expediente' },
  configuracion: {
    duracionTotal: { type: Number, default: 3600 },
    tipoBackup: { type: String, enum: ['completo', 'incremental'], default: 'incremental' },
    tamanoDatos: { type: Number, default: 100 }, // MB
    directorioOrigen: { type: String, default: '/var/lib/mysql' },
    directorioDestino: { type: String, default: '/backup' },
    compresion: { type: Boolean, default: true },
    fallos: {
      activados: { type: Boolean, default: true },
      probabilidad: { type: Number, default: 0.25 }
    }
  },
  estado: { type: String, enum: ['detenido', 'ejecutando', 'pausado', 'completado'], default: 'detenido' },
  estadisticas: {
    inicio: Date,
    fin: Date,
    metricasGeneradas: { type: Number, default: 0 },
    backupsRealizados: { type: Number, default: 0 },
    restauracionesExitosas: { type: Number, default: 0 }
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('SimulacionBackup', SimulacionBackupSchema);
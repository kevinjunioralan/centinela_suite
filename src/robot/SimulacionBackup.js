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
  configuracion: {
    duracionTotal: { type: Number, default: 3600 },
    tipoBackup: { type: String, enum: ['completo', 'incremental'], default: 'incremental' },
    tamanoBackup: { type: Number, default: 100 },
    fallos: {
      activados: { type: Boolean, default: true },
      probabilidad: { type: Number, default: 0.2 }
    }
  },
  estado: { type: String, enum: ['detenido', 'ejecutando', 'pausado', 'completado'], default: 'detenido' },
  estadisticas: {
    inicio: Date,
    fin: Date,
    metricasGeneradas: { type: Number, default: 0 },
    backupsRealizados: { type: Number, default: 0 }
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('SimulacionBackup', SimulacionBackupSchema);
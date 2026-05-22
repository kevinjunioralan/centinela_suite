// backend/src/robot/models/SimulacionHardware.js
const mongoose = require('mongoose');

const SimulacionHardwareSchema = new mongoose.Schema({
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
    intensidad: { type: String, enum: ['baja', 'media', 'alta', 'extrema'], default: 'media' },
    componentes: {
      cpu: { type: Boolean, default: true },
      memoria: { type: Boolean, default: true },
      disco: { type: Boolean, default: true },
      temperatura: { type: Boolean, default: true }
    },
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
    alertasHardware: { type: Number, default: 0 }
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('SimulacionHardware', SimulacionHardwareSchema);
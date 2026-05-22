// backend/src/robot/models/SimulacionBD.js
const mongoose = require('mongoose');

const SimulacionBDSchema = new mongoose.Schema({
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
    intensidad: { type: String, enum: ['baja', 'media', 'alta'], default: 'media' },
    tipoBD: { type: String, enum: ['postgresql', 'mysql', 'mongodb'], default: 'postgresql' },
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
    consultasRealizadas: { type: Number, default: 0 }
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('SimulacionBD', SimulacionBDSchema);
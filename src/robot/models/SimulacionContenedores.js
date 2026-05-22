// backend/src/robot/models/SimulacionContenedores.js
const mongoose = require('mongoose');

const SimulacionContenedoresSchema = new mongoose.Schema({
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
    runtime: { type: String, enum: ['docker', 'podman'], default: 'docker' },
    contenedores: {
      nginx: { type: Boolean, default: true },
      redis: { type: Boolean, default: false },
      postgres: { type: Boolean, default: false },
      nodejs: { type: Boolean, default: false }
    },
    fallos: {
      activados: { type: Boolean, default: true },
      probabilidad: { type: Number, default: 0.3 }
    }
  },
  estado: { type: String, enum: ['detenido', 'ejecutando', 'pausado', 'completado'], default: 'detenido' },
  estadisticas: {
    inicio: Date,
    fin: Date,
    metricasGeneradas: { type: Number, default: 0 },
    contenedoresDesplegados: { type: Number, default: 0 }
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('SimulacionContenedores', SimulacionContenedoresSchema);
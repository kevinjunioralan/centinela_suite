// backend/src/robot/models/SimulacionSeguridad.js
const mongoose = require('mongoose');

const SimulacionSeguridadSchema = new mongoose.Schema({
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
    ataques: {
      fuerzaBruta: { type: Boolean, default: true },
      escaneoPuertos: { type: Boolean, default: true },
      ddos: { type: Boolean, default: false },
      httpFlood: { type: Boolean, default: false }
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
    intentosDetectados: { type: Number, default: 0 },
    ipsBloqueadas: { type: Number, default: 0 }
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('SimulacionSeguridad', SimulacionSeguridadSchema);
const mongoose = require('mongoose');

const HabitacionSchema = new mongoose.Schema({
  habitacionId: { type: String, required: true, unique: true },
  expedienteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Expediente', required: true },
  nombre: { type: String, required: true },
  tipo: { type: String, enum: ['aislamiento', 'cuarentena', 'forense'], default: 'aislamiento' },
  estado: { type: String, enum: ['activa', 'destruida'], default: 'activa' },
  configuracion: {
    namespaceId: { type: String },
    ipInterna: { type: String },
    vethHostId: { type: String },
    vethNsId: { type: String }
  },
  fechaCreacion: { type: Date, default: Date.now },
  fechaDestruccion: { type: Date, default: null },
  historialAcciones: [{
    accion: { type: String },
    fecha: { type: Date, default: Date.now },
    detalles: { type: Object }
  }]
}, {
  collection: 'habitaciones'  // 🔥 Forzamos el nombre correcto
});

module.exports = mongoose.model('Habitacion', HabitacionSchema);
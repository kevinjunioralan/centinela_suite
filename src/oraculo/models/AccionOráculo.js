const mongoose = require('mongoose');

const AccionOráculoSchema = new mongoose.Schema({
  tipo: {
    type: String,
    enum: ['reintentar_mantenimiento', 'ejecutar_prueba_robot', 'reanudar_instalacion', 'escalar_admin', 'activar_espejo'],
    required: true
  },
  gravedad: {
    type: String,
    enum: ['LEVE', 'MEDIA', 'ALTA', 'CRÍTICA'],
    default: 'MEDIA'
  },
  entidadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Expediente', default: null },
  entidadTipo: { type: String, enum: ['expediente', 'robot', 'cliente'], default: 'expediente' },
  origen: { type: String, default: 'oraculo' },
  accion: { type: String, required: true },
  resultado: {
    type: String,
    enum: ['pendiente', 'exito', 'fallo', 'escalado'],
    default: 'pendiente'
  },
  mensaje: { type: String },
  detalles: { type: Object, default: {} },
  fecha: { type: Date, default: Date.now },
  resuelta: { type: Boolean, default: false }
}, { timestamps: true });

// Índices
AccionOráculoSchema.index({ fecha: -1 });
AccionOráculoSchema.index({ entidadId: 1, resultado: 1 });
AccionOráculoSchema.index({ gravedad: 1, resuelta: 1 });

module.exports = mongoose.model('AccionOráculo', AccionOráculoSchema);
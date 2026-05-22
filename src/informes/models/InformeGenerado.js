const mongoose = require('mongoose');

const InformeGeneradoSchema = new mongoose.Schema({
  tipo: {
    type: String,
    enum: ['mantenimiento_json', 'servidor_pdf', 'cliente_pdf', 'informe_pruebas'],
    required: true
  },
  formato: {
    type: String,
    enum: ['json', 'pdf'],
    required: true
  },
  expedienteId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Expediente',
    default: null,
    index: true
  },
  clienteId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Cliente',
    default: null,
    index: true
  },
  generadoPor: {
    type: String,
    default: 'sistema'
  },
  nombreArchivo: {
    type: String,
    default: null
  },
  rutaTemporal: {
    type: String,
    default: null
  },
  estado: {
    type: String,
    enum: ['generado', 'descargado', 'error', 'eliminado'],
    default: 'generado'
  },
  fechaDescarga: {
    type: Date,
    default: null
  },
  detalles: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  versionKey: false,
  timestamps: true
});

InformeGeneradoSchema.index({ tipo: 1, createdAt: -1 });
InformeGeneradoSchema.index({ expedienteId: 1, createdAt: -1 });
InformeGeneradoSchema.index({ clienteId: 1, createdAt: -1 });
InformeGeneradoSchema.index({ estado: 1, createdAt: -1 });

module.exports = mongoose.models.InformeGenerado || mongoose.model('InformeGenerado', InformeGeneradoSchema);

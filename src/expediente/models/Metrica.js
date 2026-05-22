const mongoose = require('mongoose');

const MetricaSchema = new mongoose.Schema({
  expedienteId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Expediente', 
    required: true,
    index: true 
  },
  
  clienteId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Cliente', 
    required: false,  // ✅ CAMBIADO a false para simulaciones
    index: true,
    default: null
  },
  
  timestamp: { 
    type: Date, 
    default: Date.now, 
    required: true
  },
  
  tipo: {
    type: String,
    enum: ['cpu', 'ram', 'disco', 'red', 'temperatura', 'custom'],
    required: true
  },
  
  valor: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  
  unidad: {
    type: String,
    default: '%'
  },
  
  origen: {
    type: String,
    enum: ['robot', 'monitorizacion', 'manual', 'instalacion', 'simulacion'],  // ✅ AÑADIDO 'simulacion'
    default: 'monitorizacion'
  },
  
  detalles: {
    type: Object,
    default: {}
  }
  
}, {
  versionKey: false,
  timestamps: true
});

// Índices
MetricaSchema.index({ expedienteId: 1, timestamp: -1 });
MetricaSchema.index({ expedienteId: 1, tipo: 1, timestamp: -1 });
MetricaSchema.index({ clienteId: 1, timestamp: -1 });
MetricaSchema.index({ timestamp: -1 });

module.exports = mongoose.model('Metrica', MetricaSchema);
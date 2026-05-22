const mongoose = require('mongoose');

const AlertaSchema = new mongoose.Schema({
  // ============ RELACIONES ============
  expedienteId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Expediente', 
    required: true,
    index: true 
  },
  
  clienteId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Cliente', 
    required: true,
    index: true 
  },
  
  // ============ DATOS DE LA ALERTA ============
  timestamp: { 
    type: Date, 
    default: Date.now, 
    required: true
    // ❌ Eliminado 'index: true' de aquí (se define abajo)
  },
  
  tipo: {
    type: String,
    enum: ['error', 'advertencia', 'info', 'critico'],
    required: true
  },
  
  mensaje: {
    type: String,
    required: true
  },
  
  // ============ DETALLES DE LA ALERTA ============
  origen: {
    type: String,
    enum: ['cpu', 'ram', 'disco', 'red', 'servicio', 'conexion', 'sistema', 'robot', 'verificacion'],
    default: 'sistema'
  },
  
  valor: {
    type: Number,
    description: 'Valor que provocó la alerta (ej: 95% CPU)'
  },
  
  umbral: {
    type: Number,
    description: 'Umbral que se superó (ej: 80%)'
  },
  
  // ============ ESTADO DE LA ALERTA ============
  resuelta: {
    type: Boolean,
    default: false
  },
  
  resueltaEn: {
    type: Date,
    default: null
  },
  
  resueltaPor: {
    type: String,
    default: null
  },
  
  // ============ METADATOS ============
  detalles: {
    type: Object,
    default: {}
  }
  
}, {
  versionKey: false,
  timestamps: true
});

// ============ ÍNDICES PARA BÚSQUEDAS RÁPIDAS ============
// ✅ Todos los índices definidos AQUÍ (una sola vez)
AlertaSchema.index({ expedienteId: 1, resuelta: 1, timestamp: -1 });
AlertaSchema.index({ tipo: 1, resuelta: 1, timestamp: -1 });
AlertaSchema.index({ clienteId: 1, timestamp: -1, resuelta: 1 });
AlertaSchema.index({ timestamp: -1 });
AlertaSchema.index({ timestamp: 1 });

module.exports = mongoose.model('Alerta', AlertaSchema);
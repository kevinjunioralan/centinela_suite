const mongoose = require('mongoose');

const PrediccionSchema = new mongoose.Schema({
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
  
  fechaPrediccion: { 
    type: Date, 
    default: Date.now, 
    required: true
    // ❌ Sin index:true aquí
  },
  
  tipoFallo: {
    type: String,
    enum: ['cpu', 'ram', 'disco', 'red', 'servicio', 'conexion', 'hardware', 'desconocido'],
    required: true
  },
  
  probabilidad: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  
  fechaEstimadaFallo: {
    type: Date,
    required: true
  },
  
  ventanaHoras: {
    type: Number,
    default: 24
  },
  
  acertada: {
    type: Boolean,
    default: null
  },
  
  fechaEvaluacion: {
    type: Date,
    default: null
  },
  
  precision: {
    type: Number,
    min: 0,
    max: 100
  },
  
  metricasBase: {
    type: Object,
    default: {}
  },
  
  recomendacion: {
    type: String,
    default: ''
  },
  
  origen: {
    type: String,
    enum: ['aprendizaje', 'manual', 'robot', 'oraculo'],
    default: 'aprendizaje'
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
PrediccionSchema.index({ expedienteId: 1, acertada: 1, fechaPrediccion: -1 });
PrediccionSchema.index({ clienteId: 1, fechaPrediccion: -1 });
PrediccionSchema.index({ fechaEstimadaFallo: 1 });
PrediccionSchema.index({ tipoFallo: 1, acertada: 1 });
PrediccionSchema.index({ fechaEstimadaFallo: 1, acertada: 1 });

module.exports = mongoose.model('Prediccion', PrediccionSchema);
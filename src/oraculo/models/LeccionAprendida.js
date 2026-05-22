// backend/src/oraculo/models/LeccionAprendida.js
const mongoose = require('mongoose');

const LeccionAprendidaSchema = new mongoose.Schema({
  // Relación con la predicción original
  prediccionId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Prediccion',
    required: true 
  },
  
  // Resultado real
  resultadoReal: {
    type: String,
    enum: ['acertada', 'fallida', 'parcial'],
    required: true
  },
  
  // Métricas de desviación
  desviacion: {
    predicho: Number,
    real: Number,
    diferencia: Number,
    porcentajeError: Number
  },
  
  // Lección aprendida
  leccion: {
    type: String,
    required: true
  },
  
  // Mejora aplicada
  mejoraAplicada: {
    tipo: { type: String, enum: ['ajuste_peso', 'nuevo_umbral', 'nuevo_factor'] },
    descripcion: String,
    valorAnterior: mongoose.Schema.Types.Mixed,
    valorNuevo: mongoose.Schema.Types.Mixed
  },
  
  // Feedback del sistema
  feedback: {
    util: { type: Boolean, default: true },
    comentario: String
  },
  
  createdAt: { type: Date, default: Date.now }
});

LeccionAprendidaSchema.index({ prediccionId: 1 });
LeccionAprendidaSchema.index({ createdAt: -1 });

module.exports = mongoose.model('LeccionAprendida', LeccionAprendidaSchema);
// backend/src/oraculo/models/Espejo.js
const mongoose = require('mongoose');

const EspejoSchema = new mongoose.Schema({
  nombre: { 
    type: String, 
    required: true, 
    default: 'espejo-principal' 
  },
  tipo: { 
    type: String, 
    enum: ['real', 'espejo'], 
    required: true 
  },
  estado: { 
    type: String, 
    enum: ['activo', 'en_espera', 'tomando_control', 'sincronizando', 'fallido'],
    default: 'en_espera'
  },
  // ... resto del esquema SIN índices duplicados
}, { 
  timestamps: true 
});

// ✅ Índices aquí, una sola vez
EspejoSchema.index({ tipo: 1 });
EspejoSchema.index({ estado: 1 });

module.exports = mongoose.model('Espejo', EspejoSchema);
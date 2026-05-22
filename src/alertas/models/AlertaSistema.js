// backend/src/alertas/models/AlertaSistema.js
const mongoose = require('mongoose');

const AlertaSistemaSchema = new mongoose.Schema({
  // Identificación
  tipo: {
    type: String,
    enum: ['critica', 'atencion', 'info', 'exito'],
    required: true
  },
  
  // Origen
  origen: {
    type: String,
    enum: ['oraculo', 'espejo', 'aprendizaje', 'sistema', 'usuario'],
    required: true
  },
  
  // Módulo específico
  modulo: {
    type: String,
    enum: ['oraculo', 'espejo', 'aprendizaje', 'mantenimiento', 'instalacion', 'robot'],
    default: 'sistema'
  },
  
  // Contenido
  titulo: { type: String, required: true },
  mensaje: { type: String, required: true },
  detalles: { type: Object, default: {} },
  
  // Estado
  leida: { type: Boolean, default: false },
  archivada: { type: Boolean, default: false },
  
  // Acción sugerida (opcional)
  accionSugerida: {
    tipo: { type: String, enum: ['ver', 'ir', 'ejecutar', 'ignorar'], default: 'ver' },
    destino: { type: String, default: null },
    parametros: { type: Object, default: {} }
  },
  
  // Metadatos
  creadaPor: { type: String, default: 'sistema' },
  createdAt: { type: Date, default: Date.now },
  leidaEn: { type: Date, default: null }
});

// Índices
AlertaSistemaSchema.index({ createdAt: -1 });
AlertaSistemaSchema.index({ leida: 1, archivada: 1 });
AlertaSistemaSchema.index({ tipo: 1, origen: 1 });

module.exports = mongoose.model('AlertaSistema', AlertaSistemaSchema);
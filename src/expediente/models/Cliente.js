const mongoose = require('mongoose');

const ClienteSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  nif: { type: String, default: '' },
  email: { type: String, default: '' },
  telefono: { type: String, default: '' },
  direccion: { type: String, default: '' },
  ciudad: { type: String, default: '' },
  codigoPostal: { type: String, default: '' },
  pais: { type: String, default: 'España' },
  fechaAlta: { type: Date, default: Date.now },
  plan: { 
    type: String, 
    enum: ['basico', 'premium', 'empresa'], 
    default: 'basico' 
  },
  activo: { type: Boolean, default: true },
  notas: { type: String, default: '' },
  origen: { 
    type: String, 
    enum: ['manual', 'importado', 'simulacion'], 
    default: 'manual' 
  },
  descripcion: { type: String, default: '' }
}, {
  versionKey: false,
  timestamps: true
});

module.exports = mongoose.model('Cliente', ClienteSchema);
const mongoose = require('mongoose');

const UsuarioSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  apellidos: { type: String, default: '' },
  email: { type: String, required: true },
  usuario: { type: String, required: true },
  password: { type: String, default: '' },
  puesto: { type: String, default: '' },
  telefono: { type: String, default: '' },
  activo: { type: Boolean, default: true },
  fechaCreacion: { type: Date, default: Date.now }
});

const UnidadOrganizativaSchema = new mongoose.Schema({
  clienteId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Cliente', 
    required: true 
  },
  nombre: { type: String, required: true },
  descripcion: { type: String, default: '' },
  parentId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'UnidadOrganizativa', 
    default: null 
  }, // Para jerarquía (sub-OU)
  usuarios: [UsuarioSchema],
  fechaCreacion: { type: Date, default: Date.now }
}, {
  versionKey: false,
  timestamps: true
});

module.exports = mongoose.model('UnidadOrganizativa', UnidadOrganizativaSchema);
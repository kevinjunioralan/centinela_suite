// backend/src/expediente/models/ApiKey.js
const mongoose = require('mongoose');

const ApiKeySchema = new mongoose.Schema({
  clienteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cliente', required: true },
  key: { type: String, required: true, unique: true },
  nombre: { type: String, default: 'API Key Principal' },
  activa: { type: Boolean, default: true },
  ultimoUso: { type: Date, default: null },
  fechaCreacion: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ApiKey', ApiKeySchema);
const mongoose = require('mongoose');

const AreaSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  usuarios: { type: Number, default: 0, min: 0 },
  pcs: { type: Number, default: 0, min: 0 },
  impresoras: { type: Number, default: 0, min: 0 },
  vms: { type: Number, default: 0, min: 0 },
  criticidad: {
    type: String,
    enum: ['baja', 'media', 'alta'],
    default: 'media'
  }
}, { _id: false });

const NecesidadesSchema = new mongoose.Schema({
  usuarios: { type: Number, default: 0, min: 0 },
  pcs: { type: Number, default: 0, min: 0 },
  impresoras: { type: Number, default: 0, min: 0 },
  vms: { type: Number, default: 0, min: 0 },
  switches: { type: Number, default: 0, min: 0 },
  routers: { type: Number, default: 0, min: 0 },
  apsWifi: { type: Number, default: 0, min: 0 }
}, { _id: false });

const RedDisenoOrganizacionSchema = new mongoose.Schema({
  clienteId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Cliente',
    required: true,
    unique: true,
    index: true
  },
  version: { type: Number, default: 1, min: 1 },
  necesidades: { type: NecesidadesSchema, default: () => ({}) },
  areas: { type: [AreaSchema], default: [] },
  observaciones: { type: String, default: '', trim: true },
  actualizadoPor: { type: String, default: 'sistema', trim: true },
  fechaCalculoSolicitado: { type: Date, default: null },
  ultimaPropuesta: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  historialPropuestas: {
    type: [mongoose.Schema.Types.Mixed],
    default: []
  },
  ultimaAsignacionServidores: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  ultimaAplicacionIps: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  ultimaSugerenciaHardware: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  historialAplicacionesIps: {
    type: [mongoose.Schema.Types.Mixed],
    default: []
  },
  historialSugerenciasHardware: {
    type: [mongoose.Schema.Types.Mixed],
    default: []
  }
}, {
  versionKey: false,
  timestamps: true
});

module.exports = mongoose.model('RedDisenoOrganizacion', RedDisenoOrganizacionSchema);

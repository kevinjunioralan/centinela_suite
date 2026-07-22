const mongoose = require('mongoose');

const OUCapacidadSchema = new mongoose.Schema({
  usuarios: { type: Number, default: 0 },
  ordenadores: { type: Number, default: 0 },
  impresoras: { type: Number, default: 0 },
  perifericos: { type: Number, default: 0 },
  crecimientoPct: { type: Number, default: 0 }
}, { _id: false });

const OUSeguridadSchema = new mongoose.Schema({
  sensibilidad: { type: String, default: 'media' },
  segmentacionEstricta: { type: Boolean, default: false }
}, { _id: false });

const OUSchema = new mongoose.Schema({
  id: { type: String, required: true },
  nombre: { type: String, required: true },
  padreId: { type: String, default: null },
  criticidad: { type: String, enum: ['alta', 'media', 'baja'], default: 'media' },
  seguridad: { type: OUSeguridadSchema, default: () => ({}) },
  capacidad: { type: OUCapacidadSchema, default: () => ({}) }
}, { _id: false });

const OrganizacionSchema = new mongoose.Schema({
  empresa: { type: String, default: '' },
  dominio: { type: String, required: true },
  sedePrincipal: { type: String, default: '' }
}, { _id: false });

const DerivacionSnapshotSchema = new mongoose.Schema({
  generadoEn: { type: String, required: true },
  resumen: {
    totalOUs: { type: Number, default: 0 },
    totalServicios: { type: Number, default: 0 },
    totalUsuarios: { type: Number, default: 0 },
    totalOrdenadores: { type: Number, default: 0 }
  },
  red: { type: mongoose.Schema.Types.Mixed, default: {} },
  instalacion: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { _id: false });

const DisenoVersionSnapshotSchema = new mongoose.Schema({
  version: { type: Number, required: true },
  guardadoEn: { type: String, required: true },
  actualizadoPor: { type: String, default: 'sistema' },
  resumen: {
    totalOUs: { type: Number, default: 0 },
    totalServicios: { type: Number, default: 0 },
    totalUsuarios: { type: Number, default: 0 },
    totalOrdenadores: { type: Number, default: 0 }
  },
  diseno: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { _id: false });

const AutochequeoRuleSchema = new mongoose.Schema({
  codigo: { type: String, default: '' },
  severidad: { type: String, default: '' },
  titulo: { type: String, default: '' }
}, { _id: false });

const AutochequeoSnapshotSchema = new mongoose.Schema({
  generadoEn: { type: String, required: true },
  score: { type: Number, default: 0 },
  estado: { type: String, default: 'revisar' },
  bloqueos: { type: [String], default: [] },
  avisos: { type: [String], default: [] },
  sugerencias: { type: [String], default: [] },
  reglasDisparadas: { type: [AutochequeoRuleSchema], default: [] }
}, { _id: false });

const OrganizacionDisenoSchema = new mongoose.Schema({
  clienteId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Cliente',
    required: true,
    unique: true,
    index: true
  },
  organizacion: { type: OrganizacionSchema, default: () => ({}) },
  serviciosObjetivo: { type: [String], default: [] },
  ous: { type: [OUSchema], default: [] },
  actualizadoPor: { type: String, default: 'sistema' },
  versionActual: { type: Number, default: 0 },
  ultimaVersion: { type: DisenoVersionSnapshotSchema, default: null },
  historialVersiones: { type: [DisenoVersionSnapshotSchema], default: [] },
  ultimoAutochequeo: { type: AutochequeoSnapshotSchema, default: null },
  historialAutochequeo: { type: [AutochequeoSnapshotSchema], default: [] },
  ultimaDerivacion: { type: DerivacionSnapshotSchema, default: null },
  historialDerivaciones: { type: [DerivacionSnapshotSchema], default: [] }
}, {
  versionKey: false,
  timestamps: true
});

module.exports = mongoose.model('OrganizacionDiseno', OrganizacionDisenoSchema);

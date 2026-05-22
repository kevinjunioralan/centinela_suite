const mongoose = require('mongoose');

const RedSchema = new mongoose.Schema({
  clienteId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Cliente', 
    required: true 
  },
  nombre: { type: String, required: true },
  tipo: { 
    type: String, 
    enum: ['lan', 'dmz', 'vpn', 'wifi', 'management'], 
    default: 'lan' 
  },
  direccionRed: { type: String, required: true }, // ej: 192.168.1.0
  mascara: { type: String, default: '255.255.255.0' },
  puertaEnlace: { type: String }, // ej: 192.168.1.1
  dnsPrimario: { type: String, default: '8.8.8.8' },
  dnsSecundario: { type: String, default: '8.8.4.4' },
  vlanId: { type: Number }, // Para redes VLAN
  dhcp: {
    activado: { type: Boolean, default: false },
    rangoInicio: { type: String },
    rangoFin: { type: String },
    tiempoConcesion: { type: Number, default: 86400 } // segundos
  },
  descripcion: { type: String, default: '' },
  activa: { type: Boolean, default: true }
}, {
  versionKey: false,
  timestamps: true
});

module.exports = mongoose.model('Red', RedSchema);
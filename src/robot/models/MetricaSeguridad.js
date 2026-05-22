// backend/src/robot/models/MetricaSeguridad.js
const mongoose = require('mongoose');

const MetricaSeguridadSchema = new mongoose.Schema({
  simulacionId: { type: mongoose.Schema.Types.ObjectId, ref: 'SimulacionSeguridad', required: true },
  expedienteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Expediente' },
  
  metricas: {
    intentosFallidos: { type: Number, default: 0 },      // número de logins fallidos
    puertosAbiertos: { type: Number, default: 0 },       // puertos detectados
    conexionesPorIP: { type: Number, default: 0 },       // conexiones desde misma IP
    peticionesPorSegundo: { type: Number, default: 0 },  // para detección de DDoS
    ipsBloqueadas: { type: Number, default: 0 },         // IPs en fail2ban
    latenciaRespuesta: { type: Number, default: 0 }      // ms
  },
  
  pruebaActiva: {
    type: String,
    enum: ['normal', 'escaneo', 'fuerza_bruta', 'ddos', 'http_flood', 'reposo']
  },
  
  ataqueInjectado: {
    activo: { type: Boolean, default: false },
    tipo: { type: String, enum: ['fuerza_bruta', 'escaneo_puertos', 'ddos', 'http_flood'] },
    ipOrigen: { type: String },
    timestamp: Date
  },
  
  timestamp: { type: Date, default: Date.now }
});

MetricaSeguridadSchema.index({ simulacionId: 1, timestamp: -1 });

module.exports = mongoose.model('MetricaSeguridad', MetricaSeguridadSchema);
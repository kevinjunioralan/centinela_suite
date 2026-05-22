// backend/src/robot/models/MetricaHardware.js
const mongoose = require('mongoose');

const MetricaHardwareSchema = new mongoose.Schema({
  simulacionId: { type: mongoose.Schema.Types.ObjectId, ref: 'SimulacionHardware', required: true },
  expedienteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Expediente' },
  
  metricas: {
    tempCPU: { type: Number, default: 0 },        // °C
    tempDisco: { type: Number, default: 0 },      // °C
    tempMotherboard: { type: Number, default: 0 }, // °C
    voltajeCPU: { type: Number, default: 0 },     // V
    voltajeRAM: { type: Number, default: 0 },     // V
    fanRPM: { type: Number, default: 0 },         // RPM
    erroresSMART: { type: Number, default: 0 },
    throttlingActivo: { type: Boolean, default: false },
    consumoWatts: { type: Number, default: 0 },   // W
    usoCPU: { type: Number, default: 0 },         // %
    usoRAM: { type: Number, default: 0 },         // %
    usoDisco: { type: Number, default: 0 }        // %
  },
  
  pruebaActiva: {
    type: String,
    enum: ['normal', 'estres_cpu', 'estres_ram', 'estres_disco', 'temperatura', 'reposo']
  },
  
  falloInjectado: {
    activo: { type: Boolean, default: false },
    tipo: { type: String, enum: ['sobrecalentamiento', 'fallo_disco', 'memoria_defectuosa', 'throttling', 'ventilador'] }
  },
  
  timestamp: { type: Date, default: Date.now }
});

MetricaHardwareSchema.index({ simulacionId: 1, timestamp: -1 });

module.exports = mongoose.model('MetricaHardware', MetricaHardwareSchema);
// backend/src/robot/models/SimulacionConfig.js
const mongoose = require('mongoose');

const SimulacionConfigSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  activa: { type: Boolean, default: false },
  
  // Conexión al servidor
  servidor: {
    ip: { type: String },
    puerto: { type: Number, default: 22 },
    usuario: { type: String },
    password: { type: String }
  },
  
  // Referencia al expediente
  expedienteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Expediente' },
  
  // Tipo de pack
  pack: {
    type: String,
    enum: ['pack_web', 'pack_dominio', 'pack_cortafuegos', 'pack_correo', 'pack_monitoreo'],
    required: true
  },
  
  // Configuración de la simulación
  configuracion: {
    duracionTotal: { type: Number, default: 86400 },
    intensidad: { type: String, enum: ['baja', 'media', 'alta', 'extrema'], default: 'media' },
    cicloCompleto: { type: Boolean, default: true },
    
    // ✅ CORREGIDO: Ahora cada campo tiene su tipo Number
    ciclos: {
      trabajoNormal: {
        porcentaje: { type: Number, default: 60 },
        duracion: { type: Number, default: 3600 },
        cargaMin: { type: Number, default: 40 },
        cargaMax: { type: Number, default: 60 }
      },
      cargaProgresiva: {
        porcentaje: { type: Number, default: 20 },
        duracion: { type: Number, default: 1800 },
        cargaMin: { type: Number, default: 60 },
        cargaMax: { type: Number, default: 85 }
      },
      picoMaximo: {
        porcentaje: { type: Number, default: 10 },
        duracion: { type: Number, default: 600 },
        cargaMin: { type: Number, default: 85 },
        cargaMax: { type: Number, default: 98 }
      },
      reposo: {
        porcentaje: { type: Number, default: 10 },
        duracion: { type: Number, default: 300 },
        cargaMin: { type: Number, default: 5 },
        cargaMax: { type: Number, default: 15 }
      }
    },
    
    // Fallos programados
    fallos: {
      activados: { type: Boolean, default: true },
      probabilidad: { type: Number, default: 0.3, min: 0, max: 1 },
      tiposPermitidos: [{ 
        type: String, 
        enum: ['cpu_alta', 'memoria_alta', 'disco_lleno', 'caida_servicio', 'red_lenta'] 
      }]
    }
  },
  
  // Estado actual
  estado: {
    type: String,
    enum: ['detenido', 'ejecutando', 'pausado', 'completado', 'error'],
    default: 'detenido'
  },
  
  // Estadísticas
  estadisticas: {
    inicio: { type: Date },
    fin: { type: Date },
    ciclosCompletados: { type: Number, default: 0 },
    fallosInyectados: { type: Number, default: 0 },
    fallosDetectados: { type: Number, default: 0 },
    metricasGeneradas: { type: Number, default: 0 }
  },
  
  creadoPor: { type: String, default: 'sistema' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('SimulacionConfig', SimulacionConfigSchema);
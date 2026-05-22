const mongoose = require('mongoose');

const RobotConfigSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  descripcion: { type: String, default: '' },
  activo: { type: Boolean, default: false },
  
  // Configuración del servidor
  servidor: {
    ip: { type: String, required: true },
    puerto: { type: Number, default: 22 },
    usuario: { type: String, required: true },
    password: { type: String, required: true },
    hostname: { type: String, default: null }
  },
  
  // Configuración del robot
  configuracion: {
    intervalo: { type: Number, default: 30000 }, // ms
    maxCiclos: { type: Number, default: 0 }, // 0 = infinito
    acciones: {
      crearExpediente: { type: Boolean, default: true },
      crearHabitacion: { type: Boolean, default: true },
      cerrarPuerta: { type: Boolean, default: true },
      ejecutarDiagnostico: { type: Boolean, default: true },
      destruirHabitacion: { type: Boolean, default: true }
    }
  },
  
  // Estadísticas acumuladas
  estadisticas: {
    totalCiclos: { type: Number, default: 0 },
    exitosos: { type: Number, default: 0 },
    fallidos: { type: Number, default: 0 },
    ultimoCiclo: { type: Date, default: null },
    ultimoError: { type: String, default: null },
    scorePromedio: { type: Number, default: 0 },
    scores: { type: Array, default: [] }
  },
  
  creado: { type: Date, default: Date.now },
  actualizado: { type: Date, default: Date.now }
});

module.exports = mongoose.models.RobotConfig || mongoose.model('RobotConfig', RobotConfigSchema);
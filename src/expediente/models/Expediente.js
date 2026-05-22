const mongoose = require('mongoose');

const ExpedienteSchema = new mongoose.Schema({
  // ============ DATOS BÁSICOS ============
  nombre: { type: String, default: "" },
  descripcion: { type: String, default: "" },
  fechaCreacion: { type: Date, default: Date.now },
  
  // ============ RELACIONES ============
  clienteId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Cliente', 
    required: false,
    default: null,
    index: true 
  },
  
  // ============ ORIGEN Y ESTADO ============
 // backend/src/expediente/models/Expediente.js

origen: {
  type: String,
  enum: ['manual', 'robot', 'mantenimiento', 'instalacion', 'simulacion'],
  default: 'manual'
},
  
  estado: {
    type: String,
    enum: ['pendiente', 'en_cuarentena', 'en_pruebas', 'diagnosticado', 'en_mantenimiento', 'instalando', 'instalado'],
    default: 'pendiente'
  },
  
  // ============ SERVIDOR (SSH) ============
  servidor: {
    ip: { type: String, default: null },
    puerto: { type: Number, default: 22 },
    usuario: { type: String, default: "root" },
    password: { type: String, default: null },
    hostname: { type: String, default: null }
  },
  
  // ============ HABITACIÓN ============
  habitacionId: { type: String, default: null },
  fechaAsignacion: { type: Date, default: null },
  fechaLiberacion: { type: Date, default: null },
  
  // ============ CONEXIÓN SSH ============
  conexionSSH: {
    fechaInicio: { type: Date, default: null },
    fechaFin: { type: Date, default: null },
    duracionSegundos: { type: Number, default: 0 },
    ultimoComando: { type: String, default: null },
    totalComandos: { type: Number, default: 0 }
  },
  
  // ============ CIERRE DE PUERTA ============
  cierrePuerta: {
    fecha: { type: Date, default: null },
    exitoso: { type: Boolean, default: false },
    errores: { type: Array, default: [] }
  },
  
  // ============ MÉTRICAS GENERALES ============
  metricas: {
    tiempoConexionMs: { type: Number, default: 0 },
    ultimaActividad: { type: Date, default: null }
  },
  
  // ============ DIAGNÓSTICO (estático) ============
  diagnostico: {
    fecha: { type: Date, default: null },
    score: { type: Number, default: 0 },
    estado: { type: String, default: null },
    inventario: { type: Object, default: {} },
    metricas: { type: Object, default: {} },
    alertas: { type: Array, default: [] }
  },
  
  // ============ MANTENIMIENTO (solo datos de estado, NO métricas históricas) ============
  mantenimiento: {
    fechaIngreso: { type: Date, default: null },
    estadoCustodia: { 
      type: String, 
      enum: ['pendiente', 'conectado', 'error', 'desconectado'],
      default: 'pendiente'
    },
    ultimaConexion: { type: Date, default: null },
    umbrales: {
      cpuMax: { type: Number, default: 80 },
      memoriaMax: { type: Number, default: 85 },
      discoMax: { type: Number, default: 90 }
    }
  },
  
  // ============ INSTALACIÓN ============
  instalacion: {
    estado: {
      type: String,
      enum: ['pendiente', 'planificando', 'conectando', 'instalando', 'verificando', 'completado', 'fallo', 'rollback'],
      default: 'pendiente'
    },
    software: [{
      nombre: { type: String, required: true },
      version: { type: String },
      estado: {
        type: String,
        enum: ['pendiente', 'instalando', 'instalado', 'error', 'skip', 'rollback'],
        default: 'pendiente'
      },
      tiempoInstalacion: { type: Number, default: null },
      fechaInicio: { type: Date },
      fechaFin: { type: Date },
      logs: { type: String },
      error: { type: String }
    }],
    paquetes: [{
      nombre: { type: String },
      versionRequerida: { type: String },
      versionInstalada: { type: String },
      estado: { type: String }
    }],
    configuracion: {
      archivos: [{
        ruta: { type: String },
        contenido: { type: String },
        backup: { type: String }
      }],
      servicios: [{
        nombre: { type: String },
        estado: { type: String },
        puerto: { type: Number }
      }],
      variables: { type: Map, of: String }
    },
    verificacion: {
      tests: [{
        nombre: { type: String },
        resultado: { type: Boolean },
        mensaje: { type: String },
        timestamp: { type: Date, default: Date.now }
      }],
      score: { type: Number, default: 0 },
      completado: { type: Boolean, default: false }
    },
    logs: [{
      timestamp: { type: Date, default: Date.now },
      nivel: { type: String, enum: ['info', 'warn', 'error'], default: 'info' },
      mensaje: { type: String }
    }],
    progreso: { type: Number, default: 0 },
    fechaInicio: { type: Date },
    fechaFin: { type: Date },
    realizadoPor: { type: String, default: 'sistema' },
    tiempoTotalSegundos: { type: Number, default: 0 },
    
    // Campos de pack
    packSeleccionado: {
      type: String,
      enum: ['pack_web', 'pack_dominio', 'pack_cortafuegos', 'pack_correo', 'pack_monitoreo', 'pack_coreos', 'pack_seguridad', 'pack_bases_datos', null],
      default: null
    },
    packNombre: { type: String, default: null },
    
    resumen: {
      exitoso: { type: Boolean, default: false },
      totalPaquetes: { type: Number, default: 0 },
      exitosos: { type: Number, default: 0 },
      fallidos: { type: Number, default: 0 },
      scoreFinal: { type: Number, default: 0 },
      tiempoTotalMinutos: { type: Number, default: 0 }
    },

    ultimaConfiguracionEjecutada: {
      cycleId: { type: String, default: null },
      packTipo: {
        type: String,
        enum: ['pack_web', 'pack_dominio', 'pack_cortafuegos', 'pack_correo', 'pack_monitoreo', null],
        default: null
      },
      fecha: { type: Date, default: null },
      configuracion: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
      }
    },

    historialConfiguracion: [{
      cycleId: { type: String, default: null },
      packTipo: {
        type: String,
        enum: ['pack_web', 'pack_dominio', 'pack_cortafuegos', 'pack_correo', 'pack_monitoreo', null],
        default: null
      },
      fecha: { type: Date, default: Date.now },
      configuracion: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
      }
    }]
  },
  
  // ============ VALIDACIÓN ============
  validacion: {
    estado: {
      type: String,
      enum: ['pendiente', 'en_progreso', 'completado', 'fallo'],
      default: 'pendiente'
    },
    packTipo: {
      type: String,
      enum: ['pack_web', 'pack_dominio', 'pack_cortafuegos', 'pack_correo', 'pack_monitoreo', null],
      default: null
    },
    fechaInicio: { type: Date, default: null },
    fechaFin: { type: Date, default: null },
    duracionHoras: { type: Number, default: 0 },
    pruebasEjecutadas: { type: Number, default: 0 },
    pruebasExitosas: { type: Number, default: 0 },
    pruebasFallidas: { type: Number, default: 0 },
    score: { type: Number, default: 0 },
    recomendacion: { type: String, default: '' },
    metricas: {
      cpuPromedio: { type: Number, default: 0 },
      cpuMax: { type: Number, default: 0 },
      ramPromedio: { type: Number, default: 0 },
      ramMax: { type: Number, default: 0 },
      tiempoRespuestaPromedio: { type: Number, default: 0 },
      tiempoRespuestaMax: { type: Number, default: 0 }
    },
    logs: [{
      timestamp: { type: Date, default: Date.now },
      mensaje: { type: String },
      tipo: { type: String, enum: ['info', 'exito', 'error'], default: 'info' }
    }],
    enProgreso: { type: Boolean, default: false }
  },
  
  // ============ CONFIGURACIÓN ============
  configuracion: {
    packTipo: {
      type: String,
      enum: ['pack_web', 'pack_dominio', 'pack_cortafuegos', 'pack_correo', 'pack_monitoreo', null],
      default: null
    },
    valores: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    completada: { type: Boolean, default: false },
    fecha: { type: Date, default: null }
  },
  
  // ============ HISTORIAL Y ROBOT ============
  historialEstados: { type: Array, default: [] },
  robotId: { type: mongoose.Schema.Types.ObjectId, ref: 'RobotConfig', default: null }
  
}, {
  versionKey: false,
  timestamps: true
});

// ============ ÍNDICES ============
ExpedienteSchema.index({ clienteId: 1, createdAt: -1 });
ExpedienteSchema.index({ origen: 1 });
ExpedienteSchema.index({ estado: 1 });
ExpedienteSchema.index({ 'instalacion.estado': 1 });
ExpedienteSchema.index({ 'instalacion.packSeleccionado': 1 });

module.exports = mongoose.model('Expediente', ExpedienteSchema);
const mongoose = require('mongoose');

const EventoAuditoriaSchema = new mongoose.Schema({
  tipo: {
    type: String,
    enum: [
      'creacion_expediente',
      'actualizacion_expediente',
      'eliminacion_expediente',
      'creacion_habitacion',
      'cierre_puerta',
      'diagnostico',
      'destruccion_habitacion',
      'prueba_manual',
      'login',
      'logout',
      // Mantenimiento
      'conexion_ssh',
      'desconexion_ssh',
      'reconexion_ssh',
      'error_conexion',
      'alerta_generada',
      'decision_automatica',
      'generacion_informe',
      'prediccion_ia',
      // Instalación
      'inicio_instalacion',
      'paso_instalacion',
      'fallo_instalacion',
      'reanudar_instalacion',
      'fin_instalacion_exito',
      'fin_instalacion_fallo',
      // Robot
      'inicio_simulacion_robot',
      'resultado_simulacion_robot',
      'error_simulacion_robot',
      // Oráculo
      'fallo_simulado',
      'forzando_solucion',
      'solucion_forzada',
      'delegacion_modulo',
      'evaluacion_anomalia',
      // Espejo
      'restauracion_checkpoint',
      'switchover_completado',
      'switchover_automatico',
      'hotupdate_preparado',
      'hotupdate_exitoso',
      'hotupdate_desplegado',
      // Aprendizaje
      'aprendizaje_procesado',
      // Alertas
      'alerta_critica',
      'alerta_atencion',
      'alerta_info',
      'alerta_exito',
      'escalamiento_admin',
      // 🔥 SIMULACIÓN 24/7 (NUEVOS)
      'inicio_simulacion',
      'simulacion_pausada',
      'simulacion_reanudada',
      'simulacion_completado',
      'simulacion_detenido',
      'simulacion_error',
      'fallo_simulado_injectado',
      'metrica_simulada'
    ],
    required: true
  },
  
  modulo: {
    type: String,
    enum: [
      'auth', 'expediente', 'habitaciones', 'mantenimiento', 
      'pruebas', 'robot', 'auditoria', 'aprendizaje', 
      'informes', 'sistema', 'instalacion',
      'oraculo', 'espejo', 'alertas'
    ],
    default: 'sistema'
  },
  
  usuario: { type: String, required: true },
  fecha: { type: Date, default: Date.now },
  expedienteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Expediente', default: null },
  habitacionId: { type: String, default: null },
  detalles: { type: Object, default: {} },
  ip: { type: String, default: null }
}, {
  timestamps: true
});

// Índices
EventoAuditoriaSchema.index({ modulo: 1, expedienteId: 1, fecha: -1 });
EventoAuditoriaSchema.index({ tipo: 1 });
EventoAuditoriaSchema.index({ createdAt: -1 });

module.exports = mongoose.models.EventoAuditoria || mongoose.model('EventoAuditoria', EventoAuditoriaSchema);
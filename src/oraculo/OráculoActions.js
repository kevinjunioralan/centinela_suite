// backend/src/oraculo/OráculoActions.js
const AccionOráculo = require('./models/AccionOráculo');
const EventoAuditoria = require('../auditoria/models/EventoAuditoria');

// Configuración de endpoints de los módulos (ajusta los puertos según tu entorno)
const MODULOS = {
  mantenimiento: process.env.MANTENIMIENTO_URL || 'http://localhost:3012/api/mantenimiento',
  instalacion: process.env.INSTALACION_URL || 'http://localhost:3012/api/instalacion',
  robot: process.env.ROBOT_URL || 'http://localhost:3012/api/robot',
  aprendizaje: process.env.APRENDIZAJE_URL || 'http://localhost:3012/api/aprendizaje',
  auditor: process.env.AUDITOR_URL || 'http://localhost:3012/api/auditoria'
};

class OráculoActions {
  constructor() {
    this.modoSoloObservacion = false; // Modo seguro: solo simula, no ordena
  }

  // ============ MODO SEGURO ============
  
  setModoSoloObservacion(activo) {
    this.modoSoloObservacion = activo;
    console.log(`🔮 Oráculo - Modo solo observación: ${activo ? 'ACTIVADO' : 'DESACTIVADO'}`);
  }
  
  getModoSoloObservacion() {
    return this.modoSoloObservacion;
  }

  // ============ REGISTRO DE ACCIONES ============
  
  async registrarAccion(tipo, gravedad, entidadId, entidadTipo, accion, detalles = {}) {
    const nuevaAccion = new AccionOráculo({
      tipo,
      gravedad,
      entidadId,
      entidadTipo,
      accion,
      detalles,
      resultado: 'pendiente',
      fecha: new Date()
    });
    await nuevaAccion.save();
    
    // Registrar en auditoría
    await EventoAuditoria.create({
      tipo: `oraculo_${tipo}`,
      modulo: 'oraculo',
      usuario: 'oraculo',
      detalles: { accionId: nuevaAccion._id, entidadId, ...detalles },
      fecha: new Date()
    });
    
    return nuevaAccion;
  }
  
  async actualizarResultado(accionId, resultado, mensaje = null) {
    const update = { resultado };
    if (mensaje) update.mensaje = mensaje;
    if (resultado === 'exito') update.resuelta = true;
    
    await AccionOráculo.findByIdAndUpdate(accionId, update);
  }

  // ============ MÉTODO GENERIC PARA ORDENAR ============
  
  async ordenar(modulo, endpoint, metodo = 'POST', datos = {}) {
    if (this.modoSoloObservacion) {
      console.log(`🔮 [SIMULACIÓN] Oráculo ordenaría a ${modulo}: ${endpoint}`, datos);
      return { success: true, simulado: true, orden: { modulo, endpoint, datos } };
    }
    
    const url = `${MODULOS[modulo]}${endpoint}`;
    console.log(`🔮 [ORÁCULO] Ordenando a ${modulo}: ${metodo} ${url}`);
    
    try {
      const fetch = require('node-fetch');
      const response = await fetch(url, {
        method: metodo,
        headers: { 'Content-Type': 'application/json' },
        body: metodo !== 'GET' ? JSON.stringify(datos) : undefined
      });
      
      const resultado = await response.json();
      
      if (!response.ok) {
        throw new Error(resultado.error || `Error HTTP ${response.status}`);
      }
      
      return { success: true, resultado };
      
    } catch (error) {
      console.error(`❌ [ORÁCULO] Error al ordenar a ${modulo}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  // ============ ÓRDENES A MÓDULOS ============
  
  async reintentarMantenimiento(expedienteId, gravedad = 'MEDIA') {
    const accion = await this.registrarAccion(
      'reintentar_mantenimiento',
      gravedad,
      expedienteId,
      'expediente',
      'Ordenar reintento de mantenimiento',
      { tipo: 'reintento_manual' }
    );
    
    // 🧠 El Oráculo ORDENA, NO ejecuta
    const resultado = await this.ordenar('mantenimiento', `/${expedienteId}/reintentar`, 'POST');
    
    if (resultado.success) {
      await this.actualizarResultado(accion._id, 'exito', 'Orden de reintento enviada');
    } else {
      await this.actualizarResultado(accion._id, 'fallo', resultado.error);
    }
    
    return { success: resultado.success, accionId: accion._id, error: resultado.error };
  }
  
  async ejecutarPruebaRobot(robotId, tipoPrueba = 'completa', gravedad = 'MEDIA') {
    const accion = await this.registrarAccion(
      'ejecutar_prueba_robot',
      gravedad,
      robotId,
      'robot',
      `Ordenar prueba ${tipoPrueba}`,
      { tipoPrueba }
    );
    
    // 🧠 El Oráculo ORDENA, NO ejecuta
    const resultado = await this.ordenar('robot', `/${robotId}/ejecutar-prueba`, 'POST', { tipoPrueba });
    
    if (resultado.success) {
      await this.actualizarResultado(accion._id, 'exito', `Orden de prueba ${tipoPrueba} enviada`);
    } else {
      await this.actualizarResultado(accion._id, 'fallo', resultado.error);
    }
    
    return { success: resultado.success, accionId: accion._id, error: resultado.error };
  }
  
  async reanudarInstalacion(expedienteId, gravedad = 'ALTA') {
    const accion = await this.registrarAccion(
      'reanudar_instalacion',
      gravedad,
      expedienteId,
      'expediente',
      'Ordenar reanudación de instalación',
      { tipo: 'reanudacion_automatica' }
    );
    
    // 🧠 El Oráculo ORDENA, NO ejecuta
    const resultado = await this.ordenar('instalacion', `/${expedienteId}/reanudar`, 'POST');
    
    if (resultado.success) {
      await this.actualizarResultado(accion._id, 'exito', 'Orden de reanudación enviada');
    } else {
      await this.actualizarResultado(accion._id, 'fallo', resultado.error);
    }
    
    return { success: resultado.success, accionId: accion._id, error: resultado.error };
  }
  
  async escalarAdmin(expedienteId, problema, gravedad = 'ALTA') {
    const accion = await this.registrarAccion(
      'escalar_admin',
      gravedad,
      expedienteId,
      'expediente',
      `Escalar al ADMIN: ${problema}`,
      { problema }
    );
    
    // 🧠 Escalar es notificar, no ejecutar acción operativa
    // En un sistema real, aquí iría email/Slack/Webhook
    console.log(`🔮 [ESCALAR] ADMIN notificado para expediente ${expedienteId}: ${problema}`);
    
    // Registrar también en auditoría
    await EventoAuditoria.create({
      tipo: 'escalamiento_admin',
      modulo: 'oraculo',
      usuario: 'oraculo',
      detalles: { expedienteId, problema },
      fecha: new Date()
    });
    
    await this.actualizarResultado(accion._id, 'exito', 'ADMIN notificado');
    
    return { success: true, accionId: accion._id, notificado: true };
  }

  // ============ CADENA DE ACCIONES ============
  
  async ejecutarCadenaAcciones(expedienteId, problema, opciones = {}) {
    console.log(`🔮 Oráculo ejecutando cadena de acciones para ${expedienteId}`);
    
    // 1. Solución suave: ordenar reintento
    let resultado = await this.reintentarMantenimiento(expedienteId, 'LEVE');
    if (resultado.success) {
      console.log(`✅ Orden de reintento enviada para ${expedienteId}`);
      return { success: true, nivel: 'suave', accion: 'reintentar' };
    }
    
    // 2. Solución media: ordenar reanudación de instalación
    resultado = await this.reanudarInstalacion(expedienteId, 'MEDIA');
    if (resultado.success) {
      console.log(`✅ Orden de reanudación enviada para ${expedienteId}`);
      return { success: true, nivel: 'media', accion: 'reanudar' };
    }
    
    // 3. Escalar al ADMIN
    await this.escalarAdmin(expedienteId, problema, 'ALTA');
    console.log(`⚠️ Problema escalado al ADMIN para ${expedienteId}`);
    
    return { success: false, nivel: 'escalado', accion: 'escalar_admin', requiereAtencion: true };
  }
  
  // ============ MÉTODO PARA QUE EL ORÁCULO APRENDA ============
  
  async registrarResultadoAccion(accionId, resultadoReal) {
    // 🧠 Este método permite que el módulo de APRENDIZAJE
    // alimente al Oráculo con el resultado real de sus órdenes
    
    const accion = await AccionOráculo.findById(accionId);
    if (!accion) return { success: false, error: 'Acción no encontrada' };
    
    accion.resultadoReal = resultadoReal;
    accion.leccionAprendida = true;
    await accion.save();
    
    // Registrar para que el módulo de aprendizaje analice
    await EventoAuditoria.create({
      tipo: 'resultado_accion',
      modulo: 'oraculo',
      usuario: 'aprendizaje',
      detalles: { accionId, resultadoReal, accionPrevia: accion.accion },
      fecha: new Date()
    });
    
    return { success: true };
  }
}

module.exports = OráculoActions;
// HabitacionDestroyer.js - Destructor de habitaciones de aislamiento
const EventEmitter = require('events');

class HabitacionDestroyer extends EventEmitter {
  constructor() {
    super();
    // Inicializar los managers necesarios
    const SSHManager = require('../../ssh/SSHManager/SSHManager');
    const NetworkMonitor = require('../../core/NetworkMonitor/NetworkMonitor');
    const FirewallManager = require('../../core/FirewallManager/FirewallManager');
    const VethManager = require('../../core/VethManager/VethManager');
    const NamespaceManager = require('../../core/NamespaceManager/NamespaceManager');
    const AuditorInterno = require('../../auditor/AuditorInterno/AuditorInterno');
    const EventosSuite = require('../../integracion/EventosSuite/EventosSuite');

    this.sshManager = new SSHManager();
    this.networkMonitor = new NetworkMonitor();
    this.firewallManager = new FirewallManager();
    this.vethManager = new VethManager();
    this.namespaceManager = new NamespaceManager();
    this.auditorInterno = new AuditorInterno();
    this.eventosSuite = new EventosSuite();

    // Registro interno del proceso de destrucción
    this.procesosDestruccion = new Map();
  }

  /**
   * Valida que el expedienteId sea numérico o extraíble de habitacionId
   * @param {number|string} expedienteId - ID del expediente
   * @returns {boolean} - True si es válido
   */
  _validarExpedienteId(expedienteId) {
    if (typeof expedienteId === 'string' && expedienteId.startsWith('hab_')) {
      const match = expedienteId.match(/hab_(\d+)_/);
      return match && !isNaN(parseInt(match[1]));
    }
    return !isNaN(expedienteId) && parseInt(expedienteId) > 0;
  }

  /**
   * Extrae el expedienteId de un habitacionId
   * @param {string} habitacionId - ID de la habitación (ej: hab_123_456)
   * @returns {number|null} - expedienteId extraído o null
   */
  _extraerExpedienteId(habitacionId) {
    const match = habitacionId.match(/hab_(\d+)_/);
    if (match && match[1]) {
      return parseInt(match[1]);
    }
    return null;
  }

  /**
   * Valida que el namespaceId tenga formato "ns-expediente-<id>"
   * @param {string} namespaceId - ID del namespace
   * @returns {boolean} - True si es válido
   */
  _validarNamespaceId(namespaceId) {
    return typeof namespaceId === 'string' && namespaceId.startsWith('ns-expediente-') &&
           !isNaN(namespaceId.split('-')[2]);
  }

  /**
   * Destruye una habitación de aislamiento
   * @param {number} expedienteId - ID numérico del expediente
   * @param {string} namespaceId - ID del namespace (formato: ns-expediente-<id>)
   * @returns {Promise<Object>} Resultado de la operación
   */
  async destruir(expedienteId, namespaceId) {
    // Validaciones mínimas
    if (!this._validarExpedienteId(expedienteId)) {
      throw new Error('expedienteId debe ser numérico y positivo');
    }

    // Convertir a número si es string
    const idNumerico = typeof expedienteId === 'string' && expedienteId.startsWith('hab_') 
      ? this._extraerExpedienteId(expedienteId) 
      : parseInt(expedienteId);
    
    if (!idNumerico || isNaN(idNumerico)) {
      throw new Error('No se pudo determinar el expedienteId');
    }

    if (!this._validarNamespaceId(namespaceId)) {
      throw new Error('namespaceId debe tener formato "ns-expediente-<id>"');
    }

    const procesoId = `${idNumerico}-${Date.now()}`;
    const proceso = {
      expedienteId: idNumerico,
      namespaceId,
      pasos: [],
      estado: 'iniciado',
      inicio: new Date().toISOString()
    };

    this.procesosDestruccion.set(procesoId, proceso);

    try {
      // Paso 1: Cerrar sesión SSH
      await this._cerrarSesionSSH(idNumerico, proceso);

      // Paso 2: Detener monitorización
      await this._detenerMonitoreo(idNumerico, proceso);

      // Paso 3: Eliminar reglas de firewall
      await this._eliminarFirewall(idNumerico, proceso);

      // Paso 4: Eliminar interfaces veth
      await this._eliminarVeth(idNumerico, proceso);

      // Paso 5: Destruir namespace
      await this._destruirNamespace(namespaceId, proceso);

      // Marcar como completado
      proceso.estado = 'completado';
      proceso.fin = new Date().toISOString();

      // Emitir evento de éxito
      this.emit("habitacion_destruida", {
        expedienteId: idNumerico,
        namespaceId,
        procesoId,
        timestamp: new Date().toISOString()
      });

      // Registrar en auditoría interna
      await this.auditorInterno.registrarEvento(idNumerico, 'habitacion_destruida', {
        namespaceId,
        procesoId,
        pasos: proceso.pasos
      });

      // Notificar a la Suite
      await this.eventosSuite.enviarEvento(idNumerico, 'habitacion_destruida', {
        namespaceId,
        procesoId,
        pasos: proceso.pasos
      });

      return {
        success: true,
        expedienteId: idNumerico,
        namespaceId,
        procesoId,
        mensaje: 'Habitación destruida exitosamente',
        proceso
      };
    } catch (error) {
      // Manejar errores con rollback parcial
      proceso.estado = 'error';
      proceso.error = error.message;
      proceso.fin = new Date().toISOString();

      // Emitir evento de error
      this.emit("habitacion_error", {
        expedienteId: idNumerico,
        namespaceId,
        procesoId,
        error: error.message,
        timestamp: new Date().toISOString()
      });

      // Registrar error en auditoría interna
      await this.auditorInterno.registrarEvento(idNumerico, 'habitacion_error', {
        namespaceId,
        procesoId,
        error: error.message,
        pasos: proceso.pasos
      });

      throw error;
    }
  }

  /**
   * Limpia recursos asociados a un expediente
   * @param {number} expedienteId - ID numérico del expediente
   * @returns {Promise<Object>} Resultado de la operación
   */
  async limpiarRecursos(expedienteId) {
    const idNumerico = typeof expedienteId === 'string' && expedienteId.startsWith('hab_')
      ? this._extraerExpedienteId(expedienteId)
      : parseInt(expedienteId);

    if (!idNumerico || isNaN(idNumerico)) {
      throw new Error('expedienteId debe ser numérico y positivo');
    }

    try {
      await this.networkMonitor.stopMonitoring(idNumerico);
      await this.firewallManager.deleteRules(idNumerico);

      await this.auditorInterno.registrarEvento(idNumerico, 'recursos_limpiados', {
        expedienteId: idNumerico,
        timestamp: new Date().toISOString()
      });

      return {
        success: true,
        expedienteId: idNumerico,
        mensaje: 'Recursos limpiados exitosamente'
      };
    } catch (error) {
      await this.auditorInterno.registrarEvento(idNumerico, 'recursos_error', {
        expedienteId: idNumerico,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Obtiene el estado del proceso de destrucción
   * @param {number} expedienteId - ID numérico del expediente
   * @returns {Promise<Object>} Estado del proceso
   */
  async estado(expedienteId) {
    const idNumerico = typeof expedienteId === 'string' && expedienteId.startsWith('hab_')
      ? this._extraerExpedienteId(expedienteId)
      : parseInt(expedienteId);

    if (!idNumerico || isNaN(idNumerico)) {
      throw new Error('expedienteId debe ser numérico y positivo');
    }

    try {
      const procesosExpediente = Array.from(this.procesosDestruccion.values()).filter(
        proceso => proceso.expedienteId === idNumerico
      );

      if (procesosExpediente.length === 0) {
        return {
          success: true,
          expedienteId: idNumerico,
          procesos: [],
          mensaje: 'No hay procesos de destrucción para este expediente'
        };
      }

      return {
        success: true,
        expedienteId: idNumerico,
        procesos: procesosExpediente,
        total: procesosExpediente.length,
        mensaje: 'Estado obtenido exitosamente'
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * 🔥 DESTRUIR HABITACIÓN POR ID - Versión corregida (acepta string hab_xxx_xxx)
   * @param {string} habitacionId - ID de la habitación (ej: hab_123_456)
   * @returns {Promise<Object>} Resultado de la operación
   */
  async destruirHabitacion(habitacionId) {
    console.log('💥 Destruyendo habitación con ID:', habitacionId);
    
    try {
      // Extraer el expedienteId del habitacionId
      const expedienteId = this._extraerExpedienteId(habitacionId);
      
      if (!expedienteId) {
        // Si no se pudo extraer, buscar en MongoDB
        const Habitacion = require('../models/Habitacion');
        const habitacion = await Habitacion.findOne({ habitacionId: habitacionId });
        if (habitacion && habitacion.expedienteId) {
          const expedienteIdMongo = habitacion.expedienteId.toString();
          const match = expedienteIdMongo.match(/\d+/);
          if (match) {
            const idNumerico = parseInt(match[0]);
            const namespaceId = `ns-expediente-${idNumerico}`;
            return await this.destruir(idNumerico, namespaceId);
          }
        }
        throw new Error(`No se pudo determinar el expedienteId para la habitación ${habitacionId}`);
      }
      
      const namespaceId = `ns-expediente-${expedienteId}`;
      
      // Usar el método destruir existente
      const resultado = await this.destruir(expedienteId, namespaceId);
      
      return resultado;
    } catch (error) {
      console.error('❌ Error en destruirHabitacion:', error);
      throw error;
    }
  }

  // Métodos privados para cada paso de la destrucción

  async _cerrarSesionSSH(expedienteId, proceso) {
    try {
      const resultado = await this.sshManager.cerrarSesion(expedienteId);
      proceso.pasos.push({
        paso: 'cerrar_sesion_ssh',
        resultado: resultado.success ? 'exitoso' : 'fallido',
        timestamp: new Date().toISOString()
      });

      if (!resultado.success) {
        throw new Error(`Error al cerrar sesión SSH: ${resultado.error}`);
      }
    } catch (error) {
      proceso.pasos.push({
        paso: 'cerrar_sesion_ssh',
        resultado: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  async _detenerMonitoreo(expedienteId, proceso) {
    try {
      const resultado = await this.networkMonitor.stopMonitoring(expedienteId);
      proceso.pasos.push({
        paso: 'detener_monitoreo',
        resultado: resultado.success ? 'exitoso' : 'fallido',
        timestamp: new Date().toISOString()
      });

      if (!resultado.success) {
        throw new Error(`Error al detener monitoreo: ${resultado.error}`);
      }
    } catch (error) {
      proceso.pasos.push({
        paso: 'detener_monitoreo',
        resultado: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  async _eliminarFirewall(expedienteId, proceso) {
    try {
      const resultado = await this.firewallManager.deleteRules(expedienteId);
      proceso.pasos.push({
        paso: 'eliminar_firewall',
        resultado: resultado.success ? 'exitoso' : 'fallido',
        timestamp: new Date().toISOString()
      });

      if (!resultado.success) {
        throw new Error(`Error al eliminar firewall: ${resultado.error}`);
      }
    } catch (error) {
      proceso.pasos.push({
        paso: 'eliminar_firewall',
        resultado: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  async _eliminarVeth(expedienteId, proceso) {
    try {
      const vethHostId = `veth-host-${expedienteId}`;
      const vethNsId = `veth-ns-${expedienteId}`;

      const resultado = await this.vethManager.deleteVethPair(vethHostId, vethNsId);
      proceso.pasos.push({
        paso: 'eliminar_veth',
        resultado: resultado.success ? 'exitoso' : 'fallido',
        timestamp: new Date().toISOString()
      });

      if (!resultado.success) {
        throw new Error(`Error al eliminar veth: ${resultado.error}`);
      }
    } catch (error) {
      proceso.pasos.push({
        paso: 'eliminar_veth',
        resultado: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  async _destruirNamespace(namespaceId, proceso) {
    try {
      const resultado = await this.namespaceManager.deleteNamespace(namespaceId);
      proceso.pasos.push({
        paso: 'destruir_namespace',
        resultado: resultado.success ? 'exitoso' : 'fallido',
        timestamp: new Date().toISOString()
      });

      if (!resultado.success) {
        throw new Error(`Error al destruir namespace: ${resultado.error}`);
      }
    } catch (error) {
      proceso.pasos.push({
        paso: 'destruir_namespace',
        resultado: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }
}

module.exports = HabitacionDestroyer;
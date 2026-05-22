const SSHManager = require('../../ssh/SSHManager/SSHManager');
const AuditorInterno = require('../../auditor/AuditorInterno/AuditorInterno');

class Diagnostico extends require('events').EventEmitter {
  constructor() {
    super();
    this.sshManager = new SSHManager();
    this.auditorInterno = new AuditorInterno();
  }

  /**
   * Ejecuta un ping dentro del namespace
   * @param {number} expedienteId - ID numérico del expediente
   * @param {string} namespaceId - ID del namespace (formato: ns-expediente-<id>)
   * @returns {Object} Resultado con estado y datos
   */
  async ejecutarPing(expedienteId, namespaceId) {
    try {
      // Validaciones
      if (typeof expedienteId !== 'number' || isNaN(expedienteId)) {
        throw new Error('expedienteId debe ser un número');
      }
      if (typeof namespaceId !== 'string' || !namespaceId.startsWith('ns-expediente-')) {
        throw new Error('namespaceId debe tener formato "ns-expediente-<id>"');
      }

      // Emitir evento de prueba iniciada
      this.emit("prueba_iniciada", {
        tipo: 'diagnostico_ping',
        expedienteId,
        namespaceId,
        timestamp: new Date().toISOString()
      });

      // Registrar inicio en AuditorInterno
      await this.auditorInterno.registrarEvento(expedienteId, 'prueba', {
        tipo: 'diagnostico_ping',
        namespaceId,
        accion: 'inicio'
      });

      // Ejecutar comando ping
      const resultado = await this.sshManager.ejecutarComando(
        expedienteId,
        'ping -c 4 8.8.8.8'
      );

      // Registrar resultado en AuditorInterno
      await this.auditorInterno.registrarEvento(expedienteId, 'prueba', {
        tipo: 'diagnostico_ping',
        namespaceId,
        accion: 'resultado',
        datos: resultado
      });

      // Emitir evento de prueba finalizada
      this.emit("prueba_finalizada", {
        tipo: 'diagnostico_ping',
        expedienteId,
        namespaceId,
        resultado,
        timestamp: new Date().toISOString()
      });

      return {
        estado: 'exitoso',
        datos: resultado,
        mensaje: 'Ping ejecutado correctamente'
      };
    } catch (error) {
      // Emitir evento de error
      this.emit("prueba_error", {
        tipo: 'diagnostico_ping',
        expedienteId,
        namespaceId,
        error: error.message,
        timestamp: new Date().toISOString()
      });

      return {
        estado: 'error',
        mensaje: error.message
      };
    }
  }

  /**
   * Verifica puertos abiertos en el namespace
   * @param {number} expedienteId - ID numérico del expediente
   * @param {string} namespaceId - ID del namespace (formato: ns-expediente-<id>)
   * @returns {Object} Resultado con estado y datos
   */
  async verificarPuertos(expedienteId, namespaceId) {
    try {
      // Validaciones
      if (typeof expedienteId !== 'number' || isNaN(expedienteId)) {
        throw new Error('expedienteId debe ser un número');
      }
      if (typeof namespaceId !== 'string' || !namespaceId.startsWith('ns-expediente-')) {
        throw new Error('namespaceId debe tener formato "ns-expediente-<id>"');
      }

      // Emitir evento de prueba iniciada
      this.emit("prueba_iniciada", {
        tipo: 'diagnostico_puertos',
        expedienteId,
        namespaceId,
        timestamp: new Date().toISOString()
      });

      // Registrar inicio en AuditorInterno
      await this.auditorInterno.registrarEvento(expedienteId, 'prueba', {
        tipo: 'diagnostico_puertos',
        namespaceId,
        accion: 'inicio'
      });

      // Ejecutar comando ss
      const resultado = await this.sshManager.ejecutarComando(
        expedienteId,
        'ss -tulnp'
      );

      // Registrar resultado en AuditorInterno
      await this.auditorInterno.registrarEvento(expedienteId, 'prueba', {
        tipo: 'diagnostico_puertos',
        namespaceId,
        accion: 'resultado',
        datos: resultado
      });

      // Emitir evento de prueba finalizada
      this.emit("prueba_finalizada", {
        tipo: 'diagnostico_puertos',
        expedienteId,
        namespaceId,
        resultado,
        timestamp: new Date().toISOString()
      });

      return {
        estado: 'exitoso',
        datos: resultado,
        mensaje: 'Verificación de puertos ejecutada correctamente'
      };
    } catch (error) {
      // Emitir evento de error
      this.emit("prueba_error", {
        tipo: 'diagnostico_puertos',
        expedienteId,
        namespaceId,
        error: error.message,
        timestamp: new Date().toISOString()
      });

      return {
        estado: 'error',
        mensaje: error.message
      };
    }
  }

  /**
   * Revisa procesos en ejecución en el namespace
   * @param {number} expedienteId - ID numérico del expediente
   * @param {string} namespaceId - ID del namespace (formato: ns-expediente-<id>)
   * @returns {Object} Resultado con estado y datos
   */
  async revisarProcesos(expedienteId, namespaceId) {
    try {
      // Validaciones
      if (typeof expedienteId !== 'number' || isNaN(expedienteId)) {
        throw new Error('expedienteId debe ser un número');
      }
      if (typeof namespaceId !== 'string' || !namespaceId.startsWith('ns-expediente-')) {
        throw new Error('namespaceId debe tener formato "ns-expediente-<id>"');
      }

      // Emitir evento de prueba iniciada
      this.emit("prueba_iniciada", {
        tipo: 'diagnostico_procesos',
        expedienteId,
        namespaceId,
        timestamp: new Date().toISOString()
      });

      // Registrar inicio en AuditorInterno
      await this.auditorInterno.registrarEvento(expedienteId, 'prueba', {
        tipo: 'diagnostico_procesos',
        namespaceId,
        accion: 'inicio'
      });

      // Ejecutar comando ps
      const resultado = await this.sshManager.ejecutarComando(
        expedienteId,
        'ps aux'
      );

      // Registrar resultado en AuditorInterno
      await this.auditorInterno.registrarEvento(expedienteId, 'prueba', {
        tipo: 'diagnostico_procesos',
        namespaceId,
        accion: 'resultado',
        datos: resultado
      });

      // Emitir evento de prueba finalizada
      this.emit("prueba_finalizada", {
        tipo: 'diagnostico_procesos',
        expedienteId,
        namespaceId,
        resultado,
        timestamp: new Date().toISOString()
      });

      return {
        estado: 'exitoso',
        datos: resultado,
        mensaje: 'Revisión de procesos ejecutada correctamente'
      };
    } catch (error) {
      // Emitir evento de error
      this.emit("prueba_error", {
        tipo: 'diagnostico_procesos',
        expedienteId,
        namespaceId,
        error: error.message,
        timestamp: new Date().toISOString()
      });

      return {
        estado: 'error',
        mensaje: error.message
      };
    }
  }

  /**
   * Genera un resumen de los diagnósticos realizados
   * @param {number} expedienteId - ID numérico del expediente
   * @returns {Object} Resultado con estado y resumen
   */
  async resumen(expedienteId) {
    try {
      // Validaciones
      if (typeof expedienteId !== 'number' || isNaN(expedienteId)) {
        throw new Error('expedienteId debe ser un número');
      }

      // Obtener historial de eventos de diagnóstico
      const historialResult = await this.auditorInterno.obtenerHistorial(expedienteId);
      if (!historialResult.success) {
        throw new Error(historialResult.error);
      }

      const eventos = historialResult.historial;
      const eventosDiagnostico = eventos.filter(e => 
        e.tipo === 'prueba' && 
        e.datos.tipo && 
        e.datos.tipo.startsWith('diagnostico_')
      );

      const resumen = {
        totalDiagnosticos: eventosDiagnostico.length,
        pingEjecutados: eventosDiagnostico.filter(e => e.datos.tipo === 'diagnostico_ping').length,
        puertosVerificados: eventosDiagnostico.filter(e => e.datos.tipo === 'diagnostico_puertos').length,
        procesosRevisados: eventosDiagnostico.filter(e => e.datos.tipo === 'diagnostico_procesos').length,
        ultimoDiagnostico: eventosDiagnostico.length > 0 ? {
          tipo: eventosDiagnostico[eventosDiagnostico.length - 1].datos.tipo,
          timestamp: eventosDiagnostico[eventosDiagnostico.length - 1].timestamp
        } : null
      };

      return {
        estado: 'exitoso',
        resumen,
        mensaje: 'Resumen de diagnósticos obtenido correctamente'
      };
    } catch (error) {
      return {
        estado: 'error',
        mensaje: error.message
      };
    }
  }
}

module.exports = Diagnostico;
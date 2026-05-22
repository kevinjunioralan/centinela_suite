const SSHManager = require('../../ssh/SSHManager/SSHManager');
const AuditorInterno = require('../../auditor/AuditorInterno/AuditorInterno');

class Estres extends require('events').EventEmitter {
  constructor() {
    super();
    this.sshManager = new SSHManager();
    this.auditorInterno = new AuditorInterno();
  }

  /**
   * Ejecuta prueba de estrés de CPU
   * @param {number} expedienteId - ID numérico del expediente
   * @param {string} namespaceId - ID del namespace (formato: ns-expediente-<id>)
   * @returns {Object} Resultado con estado y datos
   */
  async cpu(expedienteId, namespaceId) {
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
        tipo: 'estres_cpu',
        expedienteId,
        namespaceId,
        timestamp: new Date().toISOString()
      });

      // Registrar inicio en AuditorInterno
      await this.auditorInterno.registrarEvento(expedienteId, 'prueba', {
        tipo: 'estres_cpu',
        namespaceId,
        accion: 'inicio'
      });

      // Ejecutar comando de estrés de CPU (yes > /dev/null con timeout)
      const resultado = await this.sshManager.ejecutarComando(
        expedienteId,
        'timeout 5s yes > /dev/null'
      );

      // Registrar resultado en AuditorInterno
      await this.auditorInterno.registrarEvento(expedienteId, 'prueba', {
        tipo: 'estres_cpu',
        namespaceId,
        accion: 'resultado',
        datos: resultado
      });

      // Emitir evento de prueba finalizada
      this.emit("prueba_finalizada", {
        tipo: 'estres_cpu',
        expedienteId,
        namespaceId,
        resultado,
        timestamp: new Date().toISOString()
      });

      return {
        estado: 'exitoso',
        datos: resultado,
        mensaje: 'Prueba de estrés de CPU ejecutada correctamente'
      };
    } catch (error) {
      // Emitir evento de error
      this.emit("prueba_error", {
        tipo: 'estres_cpu',
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
   * Ejecuta prueba de estrés de memoria
   * @param {number} expedienteId - ID numérico del expediente
   * @param {string} namespaceId - ID del namespace (formato: ns-expediente-<id>)
   * @returns {Object} Resultado con estado y datos
   */
  async memoria(expedienteId, namespaceId) {
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
        tipo: 'estres_memoria',
        expedienteId,
        namespaceId,
        timestamp: new Date().toISOString()
      });

      // Registrar inicio en AuditorInterno
      await this.auditorInterno.registrarEvento(expedienteId, 'prueba', {
        tipo: 'estres_memoria',
        namespaceId,
        accion: 'inicio'
      });

      // Ejecutar comando de estrés de memoria (stress-ng)
      const resultado = await this.sshManager.ejecutarComando(
        expedienteId,
        'stress-ng --vm 1 --vm-bytes 128M --timeout 5s'
      );

      // Registrar resultado en AuditorInterno
      await this.auditorInterno.registrarEvento(expedienteId, 'prueba', {
        tipo: 'estres_memoria',
        namespaceId,
        accion: 'resultado',
        datos: resultado
      });

      // Emitir evento de prueba finalizada
      this.emit("prueba_finalizada", {
        tipo: 'estres_memoria',
        expedienteId,
        namespaceId,
        resultado,
        timestamp: new Date().toISOString()
      });

      return {
        estado: 'exitoso',
        datos: resultado,
        mensaje: 'Prueba de estrés de memoria ejecutada correctamente'
      };
    } catch (error) {
      // Emitir evento de error
      this.emit("prueba_error", {
        tipo: 'estres_memoria',
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
   * Ejecuta prueba de estrés de red
   * @param {number} expedienteId - ID numérico del expediente
   * @param {string} namespaceId - ID del namespace (formato: ns-expediente-<id>)
   * @returns {Object} Resultado con estado y datos
   */
  async red(expedienteId, namespaceId) {
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
        tipo: 'estres_red',
        expedienteId,
        namespaceId,
        timestamp: new Date().toISOString()
      });

      // Registrar inicio en AuditorInterno
      await this.auditorInterno.registrarEvento(expedienteId, 'prueba', {
        tipo: 'estres_red',
        namespaceId,
        accion: 'inicio'
      });

      // Ejecutar comando de estrés de red (iperf3 placeholder)
      const resultado = await this.sshManager.ejecutarComando(
        expedienteId,
        'echo "iperf3 placeholder - prueba de red simulada"'
      );

      // Registrar resultado en AuditorInterno
      await this.auditorInterno.registrarEvento(expedienteId, 'prueba', {
        tipo: 'estres_red',
        namespaceId,
        accion: 'resultado',
        datos: resultado
      });

      // Emitir evento de prueba finalizada
      this.emit("prueba_finalizada", {
        tipo: 'estres_red',
        expedienteId,
        namespaceId,
        resultado,
        timestamp: new Date().toISOString()
      });

      return {
        estado: 'exitoso',
        datos: resultado,
        mensaje: 'Prueba de estrés de red ejecutada correctamente'
      };
    } catch (error) {
      // Emitir evento de error
      this.emit("prueba_error", {
        tipo: 'estres_red',
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
   * Genera un resumen de las pruebas de estrés realizadas
   * @param {number} expedienteId - ID numérico del expediente
   * @returns {Object} Resultado con estado y resumen
   */
  async resumen(expedienteId) {
    try {
      // Validaciones
      if (typeof expedienteId !== 'number' || isNaN(expedienteId)) {
        throw new Error('expedienteId debe ser un número');
      }

      // Obtener historial de eventos de estrés
      const historialResult = await this.auditorInterno.obtenerHistorial(expedienteId);
      if (!historialResult.success) {
        throw new Error(historialResult.error);
      }

      const eventos = historialResult.historial;
      const eventosEstres = eventos.filter(e => 
        e.tipo === 'prueba' && 
        e.datos.tipo && 
        e.datos.tipo.startsWith('estres_')
      );

      const resumen = {
        totalEstres: eventosEstres.length,
        cpuEjecutados: eventosEstres.filter(e => e.datos.tipo === 'estres_cpu').length,
        memoriaEjecutados: eventosEstres.filter(e => e.datos.tipo === 'estres_memoria').length,
        redEjecutados: eventosEstres.filter(e => e.datos.tipo === 'estres_red').length,
        ultimoEstres: eventosEstres.length > 0 ? {
          tipo: eventosEstres[eventosEstres.length - 1].datos.tipo,
          timestamp: eventosEstres[eventosEstres.length - 1].timestamp
        } : null
      };

      return {
        estado: 'exitoso',
        resumen,
        mensaje: 'Resumen de pruebas de estrés obtenido correctamente'
      };
    } catch (error) {
      return {
        estado: 'error',
        mensaje: error.message
      };
    }
  }
}

module.exports = Estres;
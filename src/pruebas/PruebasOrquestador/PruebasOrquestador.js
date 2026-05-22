const AuditorInterno = require('../../auditor/AuditorInterno/AuditorInterno');
const Diagnostico = require('../Diagnostico/Diagnostico');
const Estres = require('../Estres/Estres');
const Informe = require('../Informe/Informe');

class PruebasOrquestador extends require('events').EventEmitter {
  constructor() {
    super();
    this.auditorInterno = new AuditorInterno();
    this.diagnostico = new Diagnostico();
    this.estres = new Estres();
    this.informe = new Informe();
  }

  /**
   * Ejecuta una prueba específica
   * @param {number} expedienteId - ID numérico del expediente
   * @param {string} tipoPrueba - Tipo de prueba a ejecutar (diagnostico, estres, informe, todo)
   * @param {Object} parametros - Parámetros adicionales (incluyendo namespaceId)
   * @returns {Object} Resultado con estado
   */
  async ejecutarPrueba(expedienteId, tipoPrueba, parametros) {
    try {
      // Validaciones
      if (typeof expedienteId !== 'number' || isNaN(expedienteId)) {
        throw new Error('expedienteId debe ser un número');
      }
      
      const namespaceId = parametros?.namespaceId;
      if (typeof namespaceId !== 'string' || !namespaceId.startsWith('ns-expediente-')) {
        throw new Error('namespaceId es requerido y debe tener formato "ns-expediente-<id>"');
      }

      // Emitir evento de prueba iniciada
      this.emit("prueba_iniciada", {
        tipo: `orquestador_${tipoPrueba}`,
        expedienteId,
        namespaceId,
        timestamp: new Date().toISOString()
      });

      // Registrar inicio en AuditorInterno
      await this.auditorInterno.registrarEvento(expedienteId, 'prueba', {
        tipo: `orquestador_${tipoPrueba}`,
        namespaceId,
        accion: 'inicio'
      });

      let resultado;
      
      // Ejecutar la prueba según el tipo
      switch (tipoPrueba) {
        case 'diagnostico':
          resultado = await this.diagnostico.resumen(expedienteId);
          break;
        case 'estres':
          resultado = await this.estres.resumen(expedienteId);
          break;
        case 'informe':
          resultado = await this.informe.obtener(expedienteId);
          break;
        case 'todo':
          resultado = await this.ejecutarTodo(expedienteId, namespaceId);
          break;
        default:
          throw new Error(`Tipo de prueba no soportado: ${tipoPrueba}`);
      }

      // Registrar finalización en AuditorInterno
      await this.auditorInterno.registrarEvento(expedienteId, 'prueba', {
        tipo: `orquestador_${tipoPrueba}`,
        namespaceId,
        accion: 'finalizacion',
        datos: resultado
      });

      // Emitir evento de prueba finalizada
      this.emit("prueba_finalizada", {
        tipo: `orquestador_${tipoPrueba}`,
        expedienteId,
        namespaceId,
        resultado,
        timestamp: new Date().toISOString()
      });

      return {
        estado: 'exitoso',
        resultado,
        mensaje: `${tipoPrueba.charAt(0).toUpperCase() + tipoPrueba.slice(1)} ejecutado correctamente`
      };
    } catch (error) {
      // Emitir evento de error
      this.emit("prueba_error", {
        tipo: `orquestador_${tipoPrueba}`,
        expedienteId,
        namespaceId: parametros?.namespaceId || 'unknown',
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
   * Obtiene una prueba por ID
   * @param {number} id - ID de la prueba/expediente
   * @returns {Object} Resultado con estado y datos
   */
  async obtenerPrueba(id) {
    try {
      // Validaciones
      if (typeof id !== 'number' || isNaN(id)) {
        throw new Error('ID debe ser numérico y positivo');
      }

      // Emitir evento de prueba iniciada
      this.emit("prueba_iniciada", {
        tipo: 'orquestador_obtener',
        expedienteId: id,
        timestamp: new Date().toISOString()
      });

      // Registrar inicio en AuditorInterno
      await this.auditorInterno.registrarEvento(id, 'prueba', {
        tipo: 'orquestador_obtener',
        accion: 'inicio'
      });

      // Obtener el informe (como representación de la prueba)
      const resultado = await this.informe.obtener(id);

      // Registrar finalización en AuditorInterno
      await this.auditorInterno.registrarEvento(id, 'prueba', {
        tipo: 'orquestador_obtener',
        accion: 'finalizacion',
        datos: resultado
      });

      // Emitir evento de prueba finalizada
      this.emit("prueba_finalizada", {
        tipo: 'orquestador_obtener',
        expedienteId: id,
        resultado,
        timestamp: new Date().toISOString()
      });

      return {
        estado: 'exitoso',
        data: resultado,
        mensaje: 'Prueba obtenida correctamente'
      };
    } catch (error) {
      // Emitir evento de error
      this.emit("prueba_error", {
        tipo: 'orquestador_obtener',
        expedienteId: id,
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
   * Ejecuta todas las pruebas (diagnóstico, estrés e informe)
   * @param {number} expedienteId - ID numérico del expediente
   * @param {string} namespaceId - ID del namespace (formato: ns-expediente-<id>)
   * @returns {Object} Resultado con estado final
   */
  async ejecutarTodo(expedienteId, namespaceId) {
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
        tipo: 'orquestador_todo',
        expedienteId,
        namespaceId,
        timestamp: new Date().toISOString()
      });

      // Registrar inicio en AuditorInterno
      await this.auditorInterno.registrarEvento(expedienteId, 'prueba', {
        tipo: 'orquestador_todo',
        namespaceId,
        accion: 'inicio'
      });

      // Ejecutar diagnóstico
      const resultadoDiagnostico = await this.diagnostico.resumen(expedienteId);
      
      // Ejecutar estrés
      const resultadoEstres = await this.estres.resumen(expedienteId);
      
      // Generar informe
      const resultadoInforme = await this.informe.generar(expedienteId);

      // Registrar finalización en AuditorInterno
      await this.auditorInterno.registrarEvento(expedienteId, 'prueba', {
        tipo: 'orquestador_todo',
        namespaceId,
        accion: 'finalizacion',
        datos: {
          diagnostico: resultadoDiagnostico,
          estres: resultadoEstres,
          informe: resultadoInforme
        }
      });

      // Emitir evento de prueba finalizada
      this.emit("prueba_finalizada", {
        tipo: 'orquestador_todo',
        expedienteId,
        namespaceId,
        resultados: {
          diagnostico: resultadoDiagnostico,
          estres: resultadoEstres,
          informe: resultadoInforme
        },
        timestamp: new Date().toISOString()
      });

      return {
        estado: 'exitoso',
        resultados: {
          diagnostico: resultadoDiagnostico,
          estres: resultadoEstres,
          informe: resultadoInforme
        },
        mensaje: 'Todas las pruebas ejecutadas correctamente'
      };
    } catch (error) {
      // Emitir evento de error
      this.emit("prueba_error", {
        tipo: 'orquestador_todo',
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
   * Ejecuta solo las pruebas de diagnóstico
   * @param {number} expedienteId - ID numérico del expediente
   * @param {string} namespaceId - ID del namespace (formato: ns-expediente-<id>)
   * @returns {Object} Resultado con estado
   */
  async ejecutarDiagnostico(expedienteId, namespaceId) {
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
        tipo: 'orquestador_diagnostico',
        expedienteId,
        namespaceId,
        timestamp: new Date().toISOString()
      });

      // Registrar inicio en AuditorInterno
      await this.auditorInterno.registrarEvento(expedienteId, 'prueba', {
        tipo: 'orquestador_diagnostico',
        namespaceId,
        accion: 'inicio'
      });

      // Ejecutar diagnóstico
      const resultado = await this.diagnostico.resumen(expedienteId);

      // Registrar finalización en AuditorInterno
      await this.auditorInterno.registrarEvento(expedienteId, 'prueba', {
        tipo: 'orquestador_diagnostico',
        namespaceId,
        accion: 'finalizacion',
        datos: resultado
      });

      // Emitir evento de prueba finalizada
      this.emit("prueba_finalizada", {
        tipo: 'orquestador_diagnostico',
        expedienteId,
        namespaceId,
        resultado,
        timestamp: new Date().toISOString()
      });

      return {
        estado: 'exitoso',
        resultado,
        mensaje: 'Diagnóstico ejecutado correctamente'
      };
    } catch (error) {
      // Emitir evento de error
      this.emit("prueba_error", {
        tipo: 'orquestador_diagnostico',
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
   * Ejecuta solo las pruebas de estrés
   * @param {number} expedienteId - ID numérico del expediente
   * @param {string} namespaceId - ID del namespace (formato: ns-expediente-<id>)
   * @returns {Object} Resultado con estado
   */
  async ejecutarEstres(expedienteId, namespaceId) {
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
        tipo: 'orquestador_estres',
        expedienteId,
        namespaceId,
        timestamp: new Date().toISOString()
      });

      // Registrar inicio en AuditorInterno
      await this.auditorInterno.registrarEvento(expedienteId, 'prueba', {
        tipo: 'orquestador_estres',
        namespaceId,
        accion: 'inicio'
      });

      // Ejecutar estrés
      const resultado = await this.estres.resumen(expedienteId);

      // Registrar finalización en AuditorInterno
      await this.auditorInterno.registrarEvento(expedienteId, 'prueba', {
        tipo: 'orquestador_estres',
        namespaceId,
        accion: 'finalizacion',
        datos: resultado
      });

      // Emitir evento de prueba finalizada
      this.emit("prueba_finalizada", {
        tipo: 'orquestador_estres',
        expedienteId,
        namespaceId,
        resultado,
        timestamp: new Date().toISOString()
      });

      return {
        estado: 'exitoso',
        resultado,
        mensaje: 'Estrés ejecutado correctamente'
      };
    } catch (error) {
      // Emitir evento de error
      this.emit("prueba_error", {
        tipo: 'orquestador_estres',
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
   * Obtiene el informe generado para un expediente
   * @param {number} expedienteId - ID numérico del expediente
   * @returns {Object} Resultado con estado y informe
   */
  async obtenerInforme(expedienteId) {
    try {
      // Validaciones
      if (typeof expedienteId !== 'number' || isNaN(expedienteId)) {
        throw new Error('expedienteId debe ser un número');
      }

      // Emitir evento de prueba iniciada
      this.emit("prueba_iniciada", {
        tipo: 'orquestador_informe',
        expedienteId,
        timestamp: new Date().toISOString()
      });

      // Registrar inicio en AuditorInterno
      await this.auditorInterno.registrarEvento(expedienteId, 'prueba', {
        tipo: 'orquestador_informe',
        accion: 'inicio'
      });

      // Obtener informe
      const resultado = await this.informe.obtener(expedienteId);

      // Registrar finalización en AuditorInterno
      await this.auditorInterno.registrarEvento(expedienteId, 'prueba', {
        tipo: 'orquestador_informe',
        accion: 'finalizacion',
        datos: resultado
      });

      // Emitir evento de prueba finalizada
      this.emit("prueba_finalizada", {
        tipo: 'orquestador_informe',
        expedienteId,
        resultado,
        timestamp: new Date().toISOString()
      });

      return {
        estado: 'exitoso',
        informe: resultado,
        mensaje: 'Informe obtenido correctamente'
      };
    } catch (error) {
      // Emitir evento de error
      this.emit("prueba_error", {
        tipo: 'orquestador_informe',
        expedienteId,
        error: error.message,
        timestamp: new Date().toISOString()
      });

      return {
        estado: 'error',
        mensaje: error.message
      };
    }
  }
}

module.exports = PruebasOrquestador;
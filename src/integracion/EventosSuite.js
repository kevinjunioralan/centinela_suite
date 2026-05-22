const axios = require('axios');
const { EventEmitter } = require('events');

class EventosSuite extends EventEmitter {
  constructor() {
    super();
    this.baseURL = process.env.AUDITOR_GENERAL_URL || 'http://localhost:3000/api';
    this.retries = 3;
    this.timeout = 5000;
  }

  /**
   * Envía un evento al Auditor General de la Suite
   * @param {number} expedienteId - ID numérico del expediente
   * @param {string} tipo - Tipo de evento (string válido)
   * @param {Object} datos - Objeto de datos asociados al evento
   */
  async enviarEvento(expedienteId, tipo, datos) {
    try {
      // Validaciones
      if (typeof expedienteId !== 'number' || !Number.isInteger(expedienteId) || expedienteId <= 0) {
        throw new Error('expedienteId debe ser un número entero positivo');
      }
      if (typeof tipo !== 'string' || tipo.trim() === '') {
        throw new Error('tipo debe ser una cadena no vacía');
      }
      if (typeof datos !== 'object' || datos === null || Array.isArray(datos)) {
        throw new Error('datos debe ser un objeto no nulo y no un array');
      }

      const eventData = {
        expedienteId,
        tipo,
        datos,
        timestamp: new Date().toISOString()
      };

      // Intentos de reintento
      for (let attempt = 1; attempt <= this.retries; attempt++) {
        try {
          const response = await axios.post(`${this.baseURL}/eventos`, eventData, {
            timeout: this.timeout
          });
          
          // Emitir evento de éxito
          this.emit('suite_evento_enviado', {
            expedienteId,
            tipo,
            datos,
            response: response.data,
            attempt
          });
          
          return response.data;
        } catch (error) {
          if (attempt === this.retries) {
            throw error;
          }
          // Esperar antes de reintentar (backoff exponencial simple)
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
        }
      }
    } catch (error) {
      // Emitir evento de error
      this.emit('suite_error', {
        expedienteId,
        tipo,
        datos,
        error: error.message,
        code: error.code
      });
      throw error;
    }
  }

  /**
   * Envía una anomalía al Auditor General de la Suite
   * @param {number} expedienteId - ID numérico del expediente
   * @param {Object} datos - Objeto de datos de la anomalía
   */
  async enviarAnomalia(expedienteId, datos) {
    // Reutilizar enviarEvento con tipo 'anomalia'
    return this.enviarEvento(expedienteId, 'anomalia', datos);
  }

  /**
   * Envía un informe al Auditor General de la Suite
   * @param {number} expedienteId - ID numérico del expediente
   * @param {Object} informe - Objeto de informe
   */
  async enviarInforme(expedienteId, informe) {
    // Reutilizar enviarEvento con tipo 'informe'
    return this.enviarEvento(expedienteId, 'informe', informe);
  }

  // Métodos de integración con AuditorInterno y MotorAprendizaje (placeholders)
  integrarConAuditorInterno(auditorInternoInstance) {
    // Aquí se integraría con el AuditorInterno
    // Por ejemplo, suscribirse a eventos o llamar a métodos
    this.auditorInterno = auditorInternoInstance;
  }

  integrarConMotorAprendizaje(motorAprendizajeInstance) {
    // Aquí se integraría con el MotorAprendizaje
    this.motorAprendizaje = motorAprendizajeInstance;
  }
}

module.exports = EventosSuite;
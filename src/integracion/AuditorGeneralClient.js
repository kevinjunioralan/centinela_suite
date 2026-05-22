const axios = require('axios');

class AuditorGeneralClient {
  constructor() {
    this.baseURL = process.env.AUDITOR_GENERAL_URL || 'http://localhost:3000/api';
    this.retries = 3;
    this.timeout = 5000;
  }

  /**
   * Notifica el inicio de pruebas para un expediente
   * @param {number} expedienteId - ID numérico del expediente
   */
  async notificarInicio(expedienteId) {
    try {
      // Validación
      if (typeof expedienteId !== 'number' || !Number.isInteger(expedienteId) || expedienteId <= 0) {
        throw new Error('expedienteId debe ser un número entero positivo');
      }

      const data = { expedienteId, timestamp: new Date().toISOString() };

      // Intentos de reintento
      for (let attempt = 1; attempt <= this.retries; attempt++) {
        try {
          const response = await axios.post(`${this.baseURL}/expediente/${expedienteId}/inicio`, data, {
            timeout: this.timeout
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
      throw error;
    }
  }

  /**
   * Notifica el fin de pruebas para un expediente
   * @param {number} expedienteId - ID numérico del expediente
   */
  async notificarFin(expedienteId) {
    try {
      // Validación
      if (typeof expedienteId !== 'number' || !Number.isInteger(expedienteId) || expedienteId <= 0) {
        throw new Error('expedienteId debe ser un número entero positivo');
      }

      const data = { expedienteId, timestamp: new Date().toISOString() };

      // Intentos de reintento
      for (let attempt = 1; attempt <= this.retries; attempt++) {
        try {
          const response = await axios.post(`${this.baseURL}/expediente/${expedienteId}/fin`, data, {
            timeout: this.timeout
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
      throw error;
    }
  }

  /**
   * Solicita una acción al Auditor General para un expediente
   * @param {number} expedienteId - ID numérico del expediente
   * @returns {Object} Acción requerida (detener pruebas, intensificar análisis, marcar como sospechoso)
   */
  async solicitarAccion(expedienteId) {
    try {
      // Validación
      if (typeof expedienteId !== 'number' || !Number.isInteger(expedienteId) || expedienteId <= 0) {
        throw new Error('expedienteId debe ser un número entero positivo');
      }

      // Intentos de reintento
      for (let attempt = 1; attempt <= this.retries; attempt++) {
        try {
          const response = await axios.get(`${this.baseURL}/expediente/${expedienteId}/accion`, {
            timeout: this.timeout
          });
          
          // La respuesta debería contener indicaciones como:
          // { detener: boolean, intensificar: boolean, sospechoso: boolean }
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
      throw error;
    }
  }

  /**
   * Obtiene el estado actual de un expediente en el Auditor General
   * @param {number} expedienteId - ID numérico del expediente
   * @returns {Object} Estado del expediente
   */
  async obtenerEstado(expedienteId) {
    try {
      // Validación
      if (typeof expedienteId !== 'number' || !Number.isInteger(expedienteId) || expedienteId <= 0) {
        throw new Error('expedienteId debe ser un número entero positivo');
      }

      // Intentos de reintento
      for (let attempt = 1; attempt <= this.retries; attempt++) {
        try {
          const response = await axios.get(`${this.baseURL}/expediente/${expedienteId}/estado`, {
            timeout: this.timeout
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
      throw error;
    }
  }

  // Método de integración con PruebasOrquestador (placeholder)
  integrarConPruebasOrquestador(pruebasOrquestadorInstance) {
    // Aquí se integraría con el PruebasOrquestador
    // Por ejemplo, suscribirse a eventos o llamar a métodos
    this.pruebasOrquestador = pruebasOrquestadorInstance;
  }
}

module.exports = AuditorGeneralClient;
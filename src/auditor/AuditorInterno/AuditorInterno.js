// AuditorInterno.js - Auditor interno del sistema
const EventEmitter = require('events');

class AuditorInterno extends EventEmitter {
  constructor() {
    super();
    this.historial = new Map(); // Map<expedienteId, Array<evento>>
  }

  /**
   * Valida que el expedienteId sea numérico
   * @param {number|string} expedienteId - ID del expediente
   * @returns {boolean} - True si es válido
   */
  _validarExpedienteId(expedienteId) {
    return !isNaN(expedienteId) && parseInt(expedienteId) > 0;
  }

  /**
   * Valida que el tipo sea un string válido
   * @param {string} tipo - Tipo de evento
   * @returns {boolean} - True si es válido
   */
  _validarTipo(tipo) {
    return typeof tipo === 'string' && tipo.trim().length > 0;
  }

  /**
   * Valida que los datos sean un objeto válido
   * @param {Object} datos - Datos del evento
   * @returns {boolean} - True si es válido
   */
  _validarDatos(datos) {
    return datos !== null && typeof datos === 'object' && !Array.isArray(datos);
  }

  /**
   * Registra un evento proveniente de diversos componentes
   * @param {number|string} expedienteId - ID del expediente
   * @param {string} tipo - Tipo de evento (namespace, veth, firewall, network, ssh, prueba)
   * @param {Object} datos - Datos del evento
   * @returns {Promise<Object>} Resultado de la operación
   */
  async registrarEvento(expedienteId, tipo, datos) {
    try {
      // Validaciones mínimas
      if (!this._validarExpedienteId(expedienteId)) {
        throw new Error('expedienteId debe ser numérico y positivo');
      }
      
      if (!this._validarTipo(tipo)) {
        throw new Error('tipo debe ser un string válido');
      }
      
      if (!this._validarDatos(datos)) {
        throw new Error('datos debe ser un objeto válido');
      }

      const evento = {
        expedienteId: parseInt(expedienteId),
        tipo,
        datos,
        timestamp: new Date().toISOString()
      };

      // Obtener o crear el historial para este expediente
      if (!this.historial.has(expedienteId.toString())) {
        this.historial.set(expedienteId.toString(), []);
      }
      
      const expedienteHistorial = this.historial.get(expedienteId.toString());
      expedienteHistorial.push(evento);

      // Emitir evento interno de auditoría
      this.emit("auditoria_evento", {
        expedienteId,
        tipo,
        datos,
        timestamp: new Date().toISOString()
      });

      // Placeholder para enviar eventos al Auditor General (EventosSuite)
      // En una implementación real, esto enviaría los eventos al auditor general
      console.log(`[AUDITOR_INTERNO] Evento registrado para expediente ${expedienteId}: ${tipo}`);

      return {
        success: true,
        expedienteId,
        evento,
        mensaje: 'Evento registrado exitosamente'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        expedienteId
      };
    }
  }

  /**
   * Obtiene el historial de eventos para un expediente
   * @param {number|string} expedienteId - ID del expediente
   * @returns {Promise<Object>} Historial de eventos
   */
  async obtenerHistorial(expedienteId) {
    try {
      // Validaciones mínimas
      if (!this._validarExpedienteId(expedienteId)) {
        throw new Error('expedienteId debe ser numérico y positivo');
      }

      const expedienteHistorial = this.historial.get(expedienteId.toString()) || [];

      return {
        success: true,
        expedienteId,
        historial: [...expedienteHistorial], // Devolver copia para evitar modificaciones externas
        total: expedienteHistorial.length,
        mensaje: 'Historial obtenido exitosamente'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        expedienteId
      };
    }
  }

  /**
   * Detecta anomalías en el historial de un expediente
   * @param {number|string} expedienteId - ID del expediente
   * @returns {Promise<Object>} Resultado de la detección de anomalías
   */
  async detectarAnomalia(expedienteId) {
    try {
      // Validaciones mínimas
      if (!this._validarExpedienteId(expedienteId)) {
        throw new Error('expedienteId debe ser numérico y positivo');
      }

      const expedienteHistorial = this.historial.get(expedienteId.toString()) || [];
      
      if (expedienteHistorial.length === 0) {
        return {
          success: true,
          expedienteId,
          anomaliaDetectada: false,
          mensaje: 'No hay eventos para analizar'
        };
      }

      // Placeholder para análisis de patrones sospechosos
      const anomaliaDetectada = this._analizarPatronesSospechosos(expedienteHistorial);
      
      const resultado = {
        success: true,
        expedienteId,
        anomaliaDetectada,
        eventosAnalizados: expedienteHistorial.length,
        timestamp: new Date().toISOString()
      };

      if (anomaliaDetectada) {
        // Emitir evento interno de anomalía detectada
        this.emit("auditoria_anomalia", {
          expedienteId,
          timestamp: new Date().toISOString(),
          detalle: 'Se detectaron patrones sospechosos en el historial'
        });
        
        resultado.mensaje = 'Se detectaron patrones sospechosos';
      } else {
        resultado.mensaje = 'No se detectaron anomalías';
      }

      return resultado;
    } catch (error) {
      return {
        success: false,
        error: error.message,
        expedienteId
      };
    }
  }

  /**
   * Analiza patrones sospechosos en el historial (placeholder)
   * @param {Array} historial - Historial de eventos
   * @returns {boolean} - True si se detecta anomalía
   */
  _analizarPatronesSospechosos(historial) {
    // Placeholder para detección de patrones sospechosos
    // En una implementación real, esto tendría lógica más sofisticada
    
    // Detectar intentos de fuga (ejemplo: muchos eventos de red en corto tiempo)
    const eventosDeRed = historial.filter(e => e.tipo === 'network' || e.tipo === 'ssh');
    if (eventosDeRed.length > 10) {
      return true;
    }
    
    // Detectar comandos no autorizados (ejemplo: eventos con tipo desconocido)
    const tiposValidos = ['namespace', 'veth', 'firewall', 'network', 'ssh', 'prueba'];
    const eventosConTipoInvalido = historial.filter(e => !tiposValidos.includes(e.tipo));
    if (eventosConTipoInvalido.length > 0) {
      return true;
    }
    
    // Detectar tráfico anómalo (ejemplo: muchos eventos en muy poco tiempo)
    if (historial.length > 5) {
      const timestamps = historial.map(e => new Date(e.timestamp).getTime());
      timestamps.sort((a, b) => a - b);
      const intervalos = [];
      for (let i = 1; i < timestamps.length; i++) {
        intervalos.push(timestamps[i] - timestamps[i-1]);
      }
      const intervaloPromedio = intervalos.reduce((a, b) => a + b, 0) / intervalos.length;
      if (intervaloPromedio < 1000) { // Menos de 1 segundo entre eventos en promedio
        return true;
      }
    }
    
    // Detectar errores repetidos (ejemplo: mismo tipo de error múltiples veces)
    const erroresPorTipo = {};
    historial.forEach(e => {
      if (!erroresPorTipo[e.tipo]) {
        erroresPorTipo[e.tipo] = 0;
      }
      erroresPorTipo[e.tipo]++;
    });
    
    for (const tipo in erroresPorTipo) {
      if (erroresPorTipo[tipo] > 5) { // Más de 5 eventos del mismo tipo
        return true;
      }
    }
    
    return false;
  }

  /**
   * Genera un resumen del expediente
   * @param {number|string} expedienteId - ID del expediente
   * @returns {Promise<Object>} Resumen del expediente
   */
  async resumen(expedienteId) {
    try {
      // Validaciones mínimas
      if (!this._validarExpedienteId(expedienteId)) {
        throw new Error('expedienteId debe ser numérico y positivo');
      }

      const expedienteHistorial = this.historial.get(expedienteId.toString()) || [];
      
      if (expedienteHistorial.length === 0) {
        return {
          success: true,
          expedienteId,
          resumen: {
            totalEventos: 0,
            eventosPorTipo: {},
            primerEvento: null,
            ultimoEvento: null,
            duracionSegundos: 0
          },
          mensaje: 'No hay eventos para resumir'
        };
      }

      // Contar eventos por tipo
      const eventosPorTipo = {};
      expedienteHistorial.forEach(evento => {
        if (!eventosPorTipo[evento.tipo]) {
          eventosPorTipo[evento.tipo] = 0;
        }
        eventosPorTipo[evento.tipo]++;
      });

      // Calcular duración
      const timestamps = expedienteHistorial.map(e => new Date(e.timestamp).getTime());
      const primerEvento = new Date(Math.min(...timestamps));
      const ultimoEvento = new Date(Math.max(...timestamps));
      const duracionSegundos = (ultimoEvento.getTime() - primerEvento.getTime()) / 1000;

      const resumen = {
        totalEventos: expedienteHistorial.length,
        eventosPorTipo,
        primerEvento: primerEvento.toISOString(),
        ultimoEvento: ultimoEvento.toISOString(),
        duracionSegundos: Math.round(duracionSegundos * 100) / 100 // Redondear a 2 decimales
      };

      return {
        success: true,
        expedienteId,
        resumen,
        mensaje: 'Resumen generado exitosamente'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        expedienteId
      };
    }
  }
}

module.exports = AuditorInterno;
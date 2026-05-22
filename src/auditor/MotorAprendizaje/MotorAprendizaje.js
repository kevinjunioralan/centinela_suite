const EventEmitter = require('events');

class MotorAprendizaje extends EventEmitter {
  constructor() {
    super();
    // Memoria interna por expediente: Map<expedienteId, { eventos: [] }>
    this.memoria = new Map();
  }

  /**
   * Procesa un evento proveniente del AuditorInterno
   * @param {number} expedienteId - ID numérico del expediente
   * @param {Object} evento - Objeto con tipo y datos
   * @returns {Object} Resultado con estado y datos
   */
  procesarEvento(expedienteId, evento) {
    try {
      // Validaciones mínimas
      if (typeof expedienteId !== 'number' || isNaN(expedienteId)) {
        throw new Error('expedienteId debe ser un número');
      }
      if (typeof evento !== 'object' || evento === null || 
          typeof evento.tipo !== 'string' || 
          typeof evento.datos !== 'object') {
        throw new Error('evento debe ser un objeto con tipo (string) y datos (object)');
      }

      // Inicializar memoria para el expediente si no existe
      if (!this.memoria.has(expedienteId)) {
        this.memoria.set(expedienteId, { eventos: [] });
      }

      const expediente = this.memoria.get(expedienteId);
      // Añadir evento con timestamp
      expediente.eventos.push({
        ...evento,
        timestamp: new Date().toISOString()
      });

      // Emitir evento de aprendizaje (placeholder)
      this.emit("aprendizaje_evento_procesado", {
        expedienteId,
        evento: { tipo: evento.tipo },
        timestamp: new Date().toISOString()
      });

      return {
        estado: 'exitoso',
        mensaje: 'Evento procesado correctamente',
        expedienteId,
        eventoProcesado: { tipo: evento.tipo }
      };
    } catch (error) {
      return {
        estado: 'error',
        mensaje: error.message
      };
    }
  }

  /**
   * Obtiene patrones identificados para un expediente
   * @param {number} expedienteId - ID numérico del expediente
   * @returns {Object} Resultado con estado y patrones
   */
  obtenerPatrones(expedienteId) {
    try {
      if (typeof expedienteId !== 'number' || isNaN(expedienteId)) {
        throw new Error('expedienteId debe ser un número');
      }

      if (!this.memoria.has(expedienteId)) {
        return {
          estado: 'exitoso',
          patrones: {},
          mensaje: 'No hay datos para este expediente'
        };
      }

      const expediente = this.memoria.get(expedienteId);
      const eventos = expediente.eventos;

      // Análisis básico de patrones
      const patrones = {
        repeticiones: this._detectarRepeticiones(eventos),
        secuenciasSospechosas: this._detectarSecuenciasSospechosas(eventos),
        erroresRecurrentes: this._detectarErroresRecurrentes(eventos),
        comandosInusuales: this._detectarComandosInusuales(eventos),
        traficoAnomalo: this._detectarTraficoAnomalo(eventos)
      };

      // Emitir evento de patrón detectado
      this.emit("aprendizaje_patron", {
        expedienteId,
        patrones,
        timestamp: new Date().toISOString()
      });

      return {
        estado: 'exitoso',
        patrones,
        mensaje: 'Patrones obtenidos correctamente'
      };
    } catch (error) {
      return {
        estado: 'error',
        mensaje: error.message
      };
    }
  }

  /**
   * Detecta anomalías en los eventos de un expediente
   * @param {number} expedienteId - ID numérico del expediente
   * @returns {Object} Resultado con estado y anomalías
   */
  detectarAnomalias(expedienteId) {
    try {
      if (typeof expedienteId !== 'number' || isNaN(expedienteId)) {
        throw new Error('expedienteId debe ser un número');
      }

      if (!this.memoria.has(expedienteId)) {
        return {
          estado: 'exitoso',
          anomalías: {},
          mensaje: 'No hay datos para este expediente'
        };
      }

      const expediente = this.memoria.get(expedienteId);
      const eventos = expediente.eventos;

      // Detección básica de anomalías
      const anomalías = {
        frecuenciaAnomala: this._detectarFrecuenciaAnomala(eventos),
        correlacionEventos: this._detectarCorrelacionEventos(eventos),
        datosAtipicos: this._detectarDatosAtipicos(eventos)
      };

      // Emitir evento de anomalía detectada
      this.emit("aprendizaje_anomalia", {
        expedienteId,
        anomalías,
        timestamp: new Date().toISOString()
      });

      // Placeholder para enviar anomalías al Auditor General (EventosSuite)
      // En una implementación real, se llamaría a un servicio de integración
      // this._enviarAnomalíasAOtorGeneral(expedienteId, anomalías);

      return {
        estado: 'exitoso',
        anomalías,
        mensaje: 'Anomalías detectadas correctamente'
      };
    } catch (error) {
      return {
        estado: 'error',
        mensaje: error.message
      };
    }
  }

  /**
   * Genera un resumen del aprendizaje acumulado para un expediente
   * @param {number} expedienteId - ID numérico del expediente
   * @returns {Object} Resultado con estado y resumen
   */
  resumenAprendizaje(expedienteId) {
    try {
      if (typeof expedienteId !== 'number' || isNaN(expedienteId)) {
        throw new Error('expedienteId debe ser un número');
      }

      if (!this.memoria.has(expedienteId)) {
        return {
          estado: 'exitoso',
          resumen: {
            totalEventos: 0,
            primerosEventos: 0,
            ultimoEvento: null,
            patronesIdentificados: 0,
            anomalíasDetectadas: 0
          },
          mensaje: 'No hay datos para este expediente'
        };
      }

      const expediente = this.memoria.get(expedienteId);
      const eventos = expediente.eventos;
      const totalEventos = eventos.length;

      // Obtener patrones y anomalías actuales (sin emitir eventos adicionales)
      const patrones = this.obtenerPatrones(expedienteId).patrones;
      const anomalías = this.detectarAnomalias(expedienteId).anomalías;

      const resumen = {
        totalEventos,
        primerEvento: eventos.length > 0 ? {
          tipo: eventos[0].tipo,
          timestamp: eventos[0].timestamp
        } : null,
        ultimoEvento: eventos.length > 0 ? {
          tipo: eventos[eventos.length - 1].tipo,
          timestamp: eventos[eventos.length - 1].timestamp
        } : null,
        tiposDeEventos: [...new Set(eventos.map(e => e.tipo))].length,
        patronesIdentificados: Object.values(patrones).flat().length,
        anomalíasDetectadas: Object.values(anomalías).flat().length
      };

      return {
        estado: 'exitoso',
        resumen,
        mensaje: 'Resumen de aprendizaje obtenido correctamente'
      };
    } catch (error) {
      return {
        estado: 'error',
        mensaje: error.message
      };
    }
  }

  // Métodos privados para detección de patrones

  _detectarRepeticiones(eventos) {
    const conteo = {};
    eventos.forEach(e => {
      conteo[e.tipo] = (conteo[e.tipo] || 0) + 1;
    });
    return Object.entries(conteo).map(([tipo, count]) => ({ tipo, count }));
  }

  _detectarSecuenciasSospechosas(eventos) {
    const secuencias = [];
    for (let i = 0; i < eventos.length - 2; i++) {
      if (eventos[i].tipo === eventos[i+1].tipo && 
          eventos[i+1].tipo === eventos[i+2].tipo) {
        secuencias.push({
          tipo: eventos[i].tipo,
          longitud: 3,
          posicionInicial: i
        });
        i += 2; // Saltar la secuencia detectada
      }
    }
    return secuencias;
  }

  _detectarErroresRecurrentes(eventos) {
    const errores = eventos.filter(e => 
      e.tipo.toLowerCase().includes('error') || 
      e.tipo.toLowerCase().includes('fail')
    );
    const conteo = {};
    errores.forEach(e => {
      conteo[e.tipo] = (conteo[e.tipo] || 0) + 1;
    });
    return Object.entries(conteo).map(([tipo, count]) => ({ tipo, count }));
  }

  _detectarComandosInusuales(eventos) {
    // Definir comandos comunes (placeholder)
    const comandosComunes = new Array('login', 'logout', 'query', 'update', 'delete');
    const comandos = eventos.map(e => e.tipo.toLowerCase());
    const inusuales = comandos.filter(cmd => 
      !comandosComunes.includes(cmd) && 
      comandos.indexOf(cmd) === comandos.lastIndexOf(cmd) // Aparece solo una vez
    );
    return [...new Set(inusuales)].map(tipo => ({ tipo }));
  }

  _detectarTraficoAnomalo(eventos) {
    // Placeholder: en un caso real, analizaría datos de red en evento.datos
    return [];
  }

  // Métodos privados para detección de anomalías

  _detectarFrecuenciaAnomala(eventos) {
    if (eventos.length < 5) return [];

    const conteoPorTipo = {};
    eventos.forEach(e => {
      conteoPorTipo[e.tipo] = (conteoPorTipo[e.tipo] || 0) + 1;
    });

    const valores = Object.values(conteoPorTipo);
    const media = valores.reduce((a, b) => a + b, 0) / valores.length;
    const varianza = valores.reduce((sum, val) => sum + Math.pow(val - media, 2), 0) / valores.length;
    const desviacion = Math.sqrt(varianza);

    const anomalías = [];
    for (const [tipo, count] of Object.entries(conteoPorTipo)) {
      if (count > media + 2 * desviacion) { // Más de 2 desviaciones estándar arriba
        anomalías.push({ tipo, count, media, desviacion });
      }
    }
    return anomalías;
  }

  _detectarCorrelacionEventos(eventos) {
    // Placeholder: análisis de correlación simple entre tipos de eventos secuenciales
    const correlaciones = [];
    for (let i = 0; i < eventos.length - 1; i++) {
      const par = `${eventos[i].tipo} -> ${eventos[i+1].tipo}`;
      // En una implementación real, contaríamos frecuencias de pares
    }
    return correlaciones;
  }

  _detectarDatosAtipicos(eventos) {
    // Placeholder: detección de valores atípicos en evento.datos
    // Requeriría conocer la estructura esperada de datos
    return [];
  }
}

module.exports = MotorAprendizaje;
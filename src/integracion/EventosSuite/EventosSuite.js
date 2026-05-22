// EventosSuite.js - Suite de eventos para integración con otros sistemas
class EventosSuite {
  constructor() {
    this.escuchadores = new Map();
    this.colaEventos = [];
    this.procesando = false;
  }

  /**
   * Publica un evento en la suite
   * @param {Object} evento - Evento a publicar
   * @returns {Promise<Object>} Resultado de la publicación
   */
  async publicarEvento(evento) {
    // Implementación pendiente
    const eventoConMetadatos = {
      id: `evt_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      ...evento
    };
    
    this.colaEventos.push(eventoConMetadatos);
    
    // Notificar a los escuchadores sincrónicamente
    this.notificarEscuchadores(eventoConMetadatos);
    
    // Procesar la cola asincrónicamente si no se está procesando ya
    if (!this.procesando) {
      this.procesarCola();
    }
    
    return { success: true, eventoId: eventoConMetadatos.id };
  }

  /**
   * Suscribe un escuchador a un tipo de evento específico
   * @param {string} tipoEvento - Tipo de evento a escuchar
   * @param {Function} callback - Función de callback
   * @returns {Promise<Object>} Resultado de la suscripción
   */
  async suscribirse(tipoEvento, callback) {
    // Implementación pendiente
    if (!this.escuchadores.has(tipoEvento)) {
      this.escuchadores.set(tipoEvento, []);
    }
    this.escuchadores.get(tipoEvento).push(callback);
    return { success: true, tipoEvento, escuchadores: this.escuchadores.get(tipoEvento).length };
  }

  /**
   * Desuscribe un escuchador de un tipo de evento específico
   * @param {string} tipoEvento - Tipo de evento
   * @param {Function} callback - Función de callback a eliminar
   * @returns {Promise<Object>} Resultado de la desuscripción
   */
  async desuscribirse(tipoEvento, callback) {
    // Implementación pendiente
    if (this.escuchadores.has(tipoEvento)) {
      const callbacks = this.escuchadores.get(tipoEvento);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
    return { success: true, tipoEvento };
  }

  /**
   * Obtiene todos los eventos en la cola
   * @returns {Promise<Array>} Copia de la cola de eventos
   */
  async obtenerColaEventos() {
    // Implementación pendiente
    return [...this.colaEventos];
  }

  /**
   * Limpia la cola de eventos
   * @returns {Promise<Object>} Resultado de la operación
   */
  async limpiarCola() {
    // Implementación pendiente
    const count = this.colaEventos.length;
    this.colaEventos = [];
    return { success: true, eventosEliminados: count };
  }

  /**
   * Obtiene estadísticas de la suite de eventos
   * @returns {Promise<Object>} Estadísticas de la suite
   */
  async obtenerEstadisticas() {
    // Implementación pendiente
    const eventosPorTipo = {};
    this.colaEventos.forEach(evento => {
      const tipo = evento.tipo || 'desconocido';
      eventosPorTipo[tipo] = (eventosPorTipo[tipo] || 0) + 1;
    });
    
    return {
      totalEventosEnCola: this.colaEventos.length,
      eventosPorTipo,
      escuchadoresTotales: Array.from(this.escuchadores.values()).reduce((sum, callbacks) => sum + callbacks.length, 0),
      tiposConEscuchadores: Array.from(this.escuchadores.keys()),
      procesando: this.procesando
    };
  }

  /**
   * Procesa la cola de eventos (método interno)
   * @private
   */
  async procesarCola() {
    if (this.procesando || this.colaEventos.length === 0) {
      return;
    }
    
    this.procesando = true;
    
    try {
      while (this.colaEventos.length > 0) {
        const evento = this.colaEventos.shift();
        if (evento) {
          await this.notificarEscuchadoresAsync(evento);
          // Pequeña pausa para evitar bloquear el event loop
          await new Promise(resolve => setTimeout(resolve, 1));
        }
      }
    } finally {
      this.procesando = false;
      
      // Si quedan eventos en la cola (añadidos durante el procesamiento), continuar
      if (this.colaEventos.length > 0) {
        setTimeout(() => this.procesarCola(), 0);
      }
    }
  }

  /**
   * Notifica a todos los escuchadores de un evento (versión síncrona)
   * @private
   * @param {Object} evento - Evento a notificar
   */
  notificarEscuchadores(evento) {
    // Implementación pendiente
    const escuchadores = this.escuchadores.get(evento.tipo);
    if (escuchadores) {
      escuchadores.slice().forEach(callback => {
        try {
          callback(evento);
        } catch (error) {
          console.error('Error en escuchador de evento:', error);
        }
      });
    }
  }

  /**
   * Notifica a todos los escuchadores de un evento (versión asíncrona)
   * @private
   * @param {Object} evento - Evento a notificar
   * @returns {Promise<void>}
   */
  async notificarEscuchadoresAsync(evento) {
    // Implementación pendiente
    const escuchadores = this.escuchadores.get(evento.tipo);
    if (escuchadores) {
      for (const callback of escuchadores.slice()) {
        try {
          if (callback.length > 0) { // Función asíncrona
            await callback(evento);
          } else { // Función síncrona
            callback(evento);
          }
        } catch (error) {
          console.error('Error en escuchador de evento asíncrono:', error);
        }
      }
    }
  }
}

module.exports = EventosSuite;
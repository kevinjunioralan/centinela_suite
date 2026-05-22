// backend/src/oraculo/AprendizajeService.js
const mongoose = require('mongoose');
const Prediccion = require('../expediente/models/Prediccion');
const LeccionAprendida = require('./models/LeccionAprendida');
const EventoAuditoria = require('../auditoria/models/EventoAuditoria');
const AlertasService = require('../alertas/AlertasService');

class AprendizajeService {
  
  constructor() {
    this.factoresPeso = {
      cpu: { peso: 0.35, historial: [] },
      ram: { peso: 0.25, historial: [] },
      disco: { peso: 0.20, historial: [] },
      alertas: { peso: 0.20, historial: [] }
    };
    this.alertasService = new AlertasService();
    this.totalLeccionesProcesadas = 0;
    this.totalAjustesRealizados = 0;
  }
  
  // ============ REGISTRAR RESULTADO DE PREDICCIÓN ============
  
  async registrarResultado(prediccionId, resultadoReal, datosReales = {}) {
    console.log(`🧠 [APRENDIZAJE] Procesando resultado de predicción ${prediccionId}`);
    
    const prediccion = await Prediccion.findById(prediccionId);
    if (!prediccion) {
      const error = `Predicción ${prediccionId} no encontrada`;
      await this.alertasService.alertaAprendizaje(
        'critica',
        '❌ Error al registrar resultado',
        error,
        { prediccionId, resultadoReal }
      );
      throw new Error(error);
    }
    
    // Calcular desviación
    const predicho = prediccion.probabilidad;
    const real = datosReales.probabilidadReal || (resultadoReal === 'acertada' ? predicho : predicho * 0.5);
    const diferencia = Math.abs(predicho - real);
    const porcentajeError = (diferencia / predicho) * 100;
    
    // Generar lección basada en el resultado
    const leccion = this._generarLeccion(prediccion, resultadoReal, porcentajeError);
    
    // Calcular mejora a aplicar
    const mejora = this._calcularMejora(prediccion, resultadoReal, porcentajeError);
    
    // Guardar lección aprendida
    const leccionAprendida = await LeccionAprendida.create({
      prediccionId,
      resultadoReal,
      desviacion: {
        predicho,
        real,
        diferencia,
        porcentajeError
      },
      leccion: leccion.texto,
      mejoraAplicada: mejora,
      createdAt: new Date()
    });
    
    this.totalLeccionesProcesadas++;
    
    // Actualizar la predicción original
    prediccion.acertada = resultadoReal === 'acertada';
    prediccion.resultadoReal = real;
    prediccion.leccionAprendida = leccion.texto;
    await prediccion.save();
    
    // Ajustar pesos del modelo
    await this._ajustarPesos(prediccion, resultadoReal, porcentajeError);
    
    // Registrar en auditoría
    await EventoAuditoria.create({
      tipo: 'aprendizaje_procesado',
      modulo: 'oraculo',
      usuario: 'aprendizaje',
      detalles: {
        prediccionId,
        resultadoReal,
        leccion: leccion.texto,
        mejora: mejora.descripcion
      },
      fecha: new Date()
    });
    
    console.log(`🧠 [APRENDIZAJE] Lección registrada: ${leccion.texto.substring(0, 100)}...`);
    
    // Crear alerta según el resultado
    if (resultadoReal === 'fallida') {
      await this.alertasService.alertaAprendizaje(
        'atencion',
        `🧠 Predicción fallida (${porcentajeError.toFixed(1)}% error)`,
        `La predicción ${prediccion.tipo} para ${prediccion.entidad || 'N/A'} falló. Se ajustarán los pesos.`,
        { prediccionId, tipo: prediccion.tipo, error: porcentajeError, mejora: mejora.descripcion }
      );
    } else if (resultadoReal === 'parcial') {
      await this.alertasService.alertaAprendizaje(
        'info',
        `🧠 Predicción parcial (${porcentajeError.toFixed(1)}% error)`,
        `La predicción ${prediccion.tipo} fue parcialmente acertada.`,
        { prediccionId, tipo: prediccion.tipo, error: porcentajeError }
      );
    } else {
      await this.alertasService.alertaAprendizaje(
        'exito',
        `✅ Predicción acertada (${porcentajeError.toFixed(1)}% error)`,
        `La predicción ${prediccion.tipo} fue correcta.`,
        { prediccionId, tipo: prediccion.tipo, error: porcentajeError }
      );
    }
    
    return {
      success: true,
      leccionAprendida,
      nuevosPesos: this.factoresPeso,
      estadisticas: {
        totalLecciones: this.totalLeccionesProcesadas,
        totalAjustes: this.totalAjustesRealizados
      }
    };
  }
  
  // ============ GENERAR LECCIÓN ============
  
  _generarLeccion(prediccion, resultadoReal, porcentajeError) {
    const tipo = prediccion.tipo;
    const entidad = prediccion.entidad || 'sistema';
    
    if (resultadoReal === 'acertada') {
      return {
        texto: `✅ Predicción de ${tipo} para ${entidad} acertada con ${porcentajeError.toFixed(1)}% de error.`,
        tipo: 'acierto'
      };
    } else if (resultadoReal === 'parcial') {
      return {
        texto: `⚠️ Predicción de ${tipo} para ${entidad} parcialmente acertada. Error: ${porcentajeError.toFixed(1)}%. Causa: ${this._analizarCausaFallo(prediccion)}`,
        tipo: 'parcial'
      };
    } else {
      return {
        texto: `❌ Predicción de ${tipo} para ${entidad} fallida. Error: ${porcentajeError.toFixed(1)}%. Causa: ${this._analizarCausaFallo(prediccion)}`,
        tipo: 'fallo'
      };
    }
  }
  
  _analizarCausaFallo(prediccion) {
    if (prediccion.tipo === 'tendencia_cpu') {
      return 'pico inesperado por proceso externo';
    }
    if (prediccion.tipo === 'alertas_recurrentes') {
      return 'nuevo patrón de alertas no considerado';
    }
    if (prediccion.tipo === 'score_bajo') {
      return 'múltiples factores concurrentes';
    }
    return 'factor imprevisto en el entorno';
  }
  
  // ============ CALCULAR MEJORA ============
  
  _calcularMejora(prediccion, resultadoReal, porcentajeError) {
    if (resultadoReal === 'acertada') {
      return {
        tipo: 'ajuste_peso',
        descripcion: 'Mantener pesos actuales',
        valorAnterior: null,
        valorNuevo: null
      };
    }
    
    const factor = prediccion.tipo.includes('cpu') ? 'cpu' : 
                   prediccion.tipo.includes('ram') ? 'ram' : 
                   prediccion.tipo.includes('disco') ? 'disco' : 'alertas';
    
    const ajuste = porcentajeError > 50 ? 0.1 : 0.05;
    const valorAnterior = this.factoresPeso[factor].peso;
    let valorNuevo = valorAnterior;
    
    if (resultadoReal === 'fallida') {
      valorNuevo = Math.max(0.1, valorAnterior - ajuste);
    } else if (resultadoReal === 'parcial') {
      valorNuevo = Math.min(0.5, valorAnterior + ajuste * 0.5);
    }
    
    this.totalAjustesRealizados++;
    
    return {
      tipo: 'ajuste_peso',
      descripcion: `Ajustando factor ${factor} de ${valorAnterior.toFixed(2)} a ${valorNuevo.toFixed(2)}`,
      valorAnterior,
      valorNuevo,
      factor,
      ajusteAplicado: ajuste
    };
  }
  
  // ============ AJUSTAR PESOS DEL MODELO ============
  
  async _ajustarPesos(prediccion, resultadoReal, porcentajeError) {
    const factor = prediccion.tipo.includes('cpu') ? 'cpu' : 
                   prediccion.tipo.includes('ram') ? 'ram' : 
                   prediccion.tipo.includes('disco') ? 'disco' : 'alertas';
    
    this.factoresPeso[factor].historial.push({
      fecha: new Date(),
      resultado: resultadoReal,
      error: porcentajeError,
      peso: this.factoresPeso[factor].peso,
      prediccionId: prediccion._id,
      tipo: prediccion.tipo
    });
    
    if (this.factoresPeso[factor].historial.length > 20) {
      this.factoresPeso[factor].historial.shift();
    }
    
    if (resultadoReal !== 'acertada') {
      const ajuste = porcentajeError > 50 ? 0.1 : 0.05;
      if (resultadoReal === 'fallida') {
        this.factoresPeso[factor].peso = Math.max(0.1, this.factoresPeso[factor].peso - ajuste);
      } else if (resultadoReal === 'parcial') {
        this.factoresPeso[factor].peso = Math.min(0.5, this.factoresPeso[factor].peso + ajuste * 0.5);
      }
    }
    
    console.log(`🧠 [APRENDIZAJE] Nuevo peso para ${factor}: ${this.factoresPeso[factor].peso}`);
    
    await this._persistirConfiguracion();
  }
  
  async _persistirConfiguracion() {
    try {
      const ConfiguracionAprendizaje = mongoose.models.ConfiguracionAprendizaje || 
        mongoose.model('ConfiguracionAprendizaje', new mongoose.Schema({
          factoresPeso: Object,
          estadisticas: {
            totalLecciones: Number,
            totalAjustes: Number,
            ultimaActualizacion: Date
          },
          updatedAt: Date
        }));
      
      await ConfiguracionAprendizaje.findOneAndUpdate(
        {},
        { 
          factoresPeso: this.factoresPeso,
          estadisticas: {
            totalLecciones: this.totalLeccionesProcesadas,
            totalAjustes: this.totalAjustesRealizados,
            ultimaActualizacion: new Date()
          },
          updatedAt: new Date() 
        },
        { upsert: true }
      );
    } catch (error) {
      console.log('⚠️ [APRENDIZAJE] No se pudo persistir configuración:', error.message);
    }
  }
  
  // ============ OBTENER ESTADÍSTICAS ============
  
  async obtenerEstadisticas() {
    const totalLecciones = await LeccionAprendida.countDocuments();
    const aciertos = await LeccionAprendida.countDocuments({ resultadoReal: 'acertada' });
    const fallos = await LeccionAprendida.countDocuments({ resultadoReal: 'fallida' });
    const parciales = await LeccionAprendida.countDocuments({ resultadoReal: 'parcial' });
    
    const precision = totalLecciones > 0 ? (aciertos / totalLecciones) * 100 : 0;
    
    const ultimasLecciones = await LeccionAprendida.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('prediccionId', 'tipo probabilidad entidad');
    
    return {
      totalLecciones,
      aciertos,
      fallos,
      parciales,
      precision: precision.toFixed(1) + '%',
      factoresPesoActuales: this.factoresPeso,
      ultimasLecciones,
      metricasInternas: {
        totalLeccionesProcesadas: this.totalLeccionesProcesadas,
        totalAjustesRealizados: this.totalAjustesRealizados
      }
    };
  }
  
  async obtenerFactoresPeso() {
    return this.factoresPeso;
  }
  
  async obtenerHistorialAjustes(factor = null, limit = 50) {
    if (factor && this.factoresPeso[factor]) {
      return this.factoresPeso[factor].historial.slice(-limit);
    }
    
    const historial = {};
    for (const [key, value] of Object.entries(this.factoresPeso)) {
      historial[key] = value.historial.slice(-limit);
    }
    return historial;
  }
  
  // ============ MEJORAR PREDICCIÓN POR TIPO ============
  
  mejorarPrediccionPorTipo(tipo, probabilidadOriginal) {
    let factor = null;
    
    if (tipo === 'tendencia_cpu') {
      factor = this.factoresPeso.cpu;
    } else if (tipo === 'alertas_recurrentes') {
      factor = this.factoresPeso.alertas;
    } else if (tipo === 'score_bajo') {
      const pesos = [this.factoresPeso.cpu.peso, this.factoresPeso.ram.peso, this.factoresPeso.disco.peso];
      const pesoPromedio = pesos.reduce((a, b) => a + b, 0) / pesos.length;
      factor = { peso: pesoPromedio };
    } else {
      factor = { peso: 0.5 };
    }
    
    const factorAjuste = 0.7 + (factor.peso * 0.6);
    let probabilidadMejorada = probabilidadOriginal * factorAjuste;
    probabilidadMejorada = Math.min(100, Math.max(0, probabilidadMejorada));
    
    return {
      probabilidadOriginal,
      probabilidadMejorada,
      mejora: (probabilidadMejorada - probabilidadOriginal).toFixed(1),
      factorAplicado: factor.peso,
      tipoFactor: tipo.includes('cpu') ? 'cpu' : (tipo.includes('alertas') ? 'alertas' : 'mixto')
    };
  }
  
  // ============ MEJORAR PREDICCIÓN EXISTENTE ============
  
  async mejorarPrediccion(prediccionId) {
    const prediccion = await Prediccion.findById(prediccionId);
    if (!prediccion) return null;
    
    let nuevaProbabilidad = prediccion.probabilidad;
    
    if (prediccion.tipo === 'tendencia_cpu') {
      nuevaProbabilidad = nuevaProbabilidad * (1 + (this.factoresPeso.cpu.peso - 0.35));
    } else if (prediccion.tipo === 'alertas_recurrentes') {
      nuevaProbabilidad = nuevaProbabilidad * (1 + (this.factoresPeso.alertas.peso - 0.20));
    }
    
    nuevaProbabilidad = Math.min(100, Math.max(0, nuevaProbabilidad));
    
    prediccion.probabilidadMejorada = nuevaProbabilidad;
    prediccion.mejoradaPorAprendizaje = true;
    await prediccion.save();
    
    return {
      prediccionId,
      probabilidadOriginal: prediccion.probabilidad,
      probabilidadMejorada: nuevaProbabilidad,
      mejora: (nuevaProbabilidad - prediccion.probabilidad).toFixed(1)
    };
  }
  
  // ============ REENTRENAR MODELO ============
  
  async reentrenarModelo() {
    console.log('🧠 [APRENDIZAJE] Reentrenando modelo...');
    
    await this.alertasService.alertaAprendizaje(
      'info',
      '🔄 Reentrenando modelo',
      'El modelo de aprendizaje está siendo reentrenado',
      {}
    );
    
    const pesosAnteriores = JSON.parse(JSON.stringify(this.factoresPeso));
    
    // Resetear pesos a valores base
    this.factoresPeso = {
      cpu: { peso: 0.35, historial: [] },
      ram: { peso: 0.25, historial: [] },
      disco: { peso: 0.20, historial: [] },
      alertas: { peso: 0.20, historial: [] }
    };
    
    // Si hay lecciones, recalcular pesos
    const lecciones = await LeccionAprendida.find({ resultadoReal: { $ne: 'acertada' } })
      .sort({ createdAt: -1 })
      .limit(50);
    
    if (lecciones.length > 0) {
      let ajustes = { cpu: 0, ram: 0, disco: 0, alertas: 0 };
      let total = 0;
      
      for (const leccion of lecciones) {
        const factor = this._determinarFactorPorLeccion(leccion);
        if (factor && leccion.desviacion?.porcentajeError) {
          ajustes[factor] += leccion.desviacion.porcentajeError;
          total++;
        }
      }
      
      if (total > 0) {
        for (const factor of ['cpu', 'ram', 'disco', 'alertas']) {
          const ajustePromedio = ajustes[factor] / total;
          let nuevoPeso = 0.35 - (ajustePromedio / 200);
          nuevoPeso = Math.max(0.1, Math.min(0.5, nuevoPeso));
          this.factoresPeso[factor].peso = nuevoPeso;
        }
      }
    }
    
    await this._persistirConfiguracion();
    
    await this.alertasService.alertaAprendizaje(
      'exito',
      '✅ Modelo reentrenado',
      'El modelo ha sido reentrenado exitosamente',
      { pesosNuevos: this.factoresPeso }
    );
    
    return { 
      success: true, 
      mensaje: 'Modelo reentrenado exitosamente',
      pesos: this.factoresPeso
    };
  }
  
  _determinarFactorPorLeccion(leccion) {
    const texto = leccion.leccion?.toLowerCase() || '';
    if (texto.includes('cpu')) return 'cpu';
    if (texto.includes('ram')) return 'ram';
    if (texto.includes('disco')) return 'disco';
    if (texto.includes('alertas')) return 'alertas';
    return 'cpu';
  }
  
  // ============ RESETEAR MODELO ============
  
  async resetearModelo() {
    console.log('🧠 [APRENDIZAJE] Reseteando modelo...');
    
    this.factoresPeso = {
      cpu: { peso: 0.35, historial: [] },
      ram: { peso: 0.25, historial: [] },
      disco: { peso: 0.20, historial: [] },
      alertas: { peso: 0.20, historial: [] }
    };
    
    this.totalLeccionesProcesadas = 0;
    this.totalAjustesRealizados = 0;
    
    await this._persistirConfiguracion();
    
    await this.alertasService.alertaAprendizaje(
      'atencion',
      '🔄 Modelo resetear',
      'El modelo ha sido reseteado a sus valores iniciales',
      {}
    );
    
    return { 
      success: true, 
      mensaje: 'Modelo reseteado exitosamente',
      pesos: this.factoresPeso
    };
  }
}

module.exports = AprendizajeService;
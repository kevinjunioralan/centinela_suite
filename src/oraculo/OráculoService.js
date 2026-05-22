// backend/src/oraculo/OráculoService.js
const Metrica = require('../expediente/models/Metrica');
const Alerta = require('../expediente/models/Alerta');
const Prediccion = require('../expediente/models/Prediccion');
const Expediente = require('../expediente/models/Expediente');
const EventoAuditoria = require('../auditoria/models/EventoAuditoria');
const OráculoActions = require('./OráculoActions');
const AccionOráculo = require('./models/AccionOráculo');
const EspejoService = require('./EspejoService');
const AprendizajeService = require('./AprendizajeService');
const AlertasService = require('../alertas/AlertasService');

const oraculoActions = new OráculoActions();

class OráculoService {
  
  constructor() {
    // Configuración de URLs de módulos
    this.modulosUrls = {
      mantenimiento: process.env.MANTENIMIENTO_URL || 'http://localhost:3012/api/mantenimiento',
      instalacion: process.env.INSTALACION_URL || 'http://localhost:3012/api/instalacion',
      robot: process.env.ROBOT_URL || 'http://localhost:3012/api/robot',
      aprendizaje: process.env.APRENDIZAJE_URL || 'http://localhost:3012/api/aprendizaje',
      auditor: process.env.AUDITOR_URL || 'http://localhost:3012/api/auditoria'
    };
    
    // Inicializar servicios
    this.espejoService = new EspejoService();
    this.aprendizajeService = new AprendizajeService();
    this.alertasService = new AlertasService();
  }

  // ============ 0. INICIALIZACIÓN ============
  
  async inicializar() {
    await this.espejoService.inicializar();
    console.log('🪞 [ORÁCULO] Sistema espejo integrado y listo');
    console.log('🧠 [ORÁCULO] Sistema de aprendizaje activo');
    console.log('🔔 [ORÁCULO] Sistema de alertas activo');
    return { success: true };
  }

  // ============ 1. SALUD GLOBAL DEL SISTEMA ============
  
  async analizarSaludGlobal() {
    console.log('🔮 [ORÁCULO] Analizando salud global...');
    
    const servidores = await Expediente.find({ origen: 'mantenimiento' });
    const totalServidores = servidores.length;
    const alertasNoResueltas = await Alerta.countDocuments({ resuelta: false });
    
    const prediccionesPendientes = await Prediccion.countDocuments({ acertada: null });
    const prediccionesAcertadas = await Prediccion.countDocuments({ acertada: true });
    const prediccionesFallidas = await Prediccion.countDocuments({ acertada: false });
    
    const totalPrediccionesEvaluadas = prediccionesAcertadas + prediccionesFallidas;
    const precisionGlobal = totalPrediccionesEvaluadas > 0 
      ? Math.round((prediccionesAcertadas / totalPrediccionesEvaluadas) * 100) 
      : 0;
    
    const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const metricasRecientes = await Metrica.find({ timestamp: { $gte: hace24h } });
    
    let sumaCPU = 0, sumaRAM = 0, sumaDISCO = 0;
    let countCPU = 0, countRAM = 0, countDISCO = 0;
    
    for (const m of metricasRecientes) {
      if (m.tipo === 'cpu') { sumaCPU += m.valor; countCPU++; }
      if (m.tipo === 'ram') { sumaRAM += m.valor; countRAM++; }
      if (m.tipo === 'disco') { sumaDISCO += m.valor; countDISCO++; }
    }
    
    let saludGeneral = 'ESTABLE';
    if (alertasNoResueltas > 10) saludGeneral = 'ATENCIÓN';
    if (alertasNoResueltas > 20) saludGeneral = 'CRÍTICA';
    if (totalServidores === 0) saludGeneral = 'SIN DATOS';
    
    return {
      timestamp: new Date().toISOString(),
      saludGeneral,
      metricas: {
        servidores: { total: totalServidores, conAlertas: alertasNoResueltas },
        cpu: { promedio: countCPU > 0 ? Math.round(sumaCPU / countCPU) : 0, unidad: '%' },
        ram: { promedio: countRAM > 0 ? Math.round(sumaRAM / countRAM) : 0, unidad: '%' },
        disco: { promedio: countDISCO > 0 ? Math.round(sumaDISCO / countDISCO) : 0, unidad: '%' }
      },
      predicciones: {
        pendientes: prediccionesPendientes,
        acertadas: prediccionesAcertadas,
        fallidas: prediccionesFallidas,
        precisionGlobal: precisionGlobal + '%'
      },
      alertas: {
        totalNoResueltas: alertasNoResueltas,
        criticidad: alertasNoResueltas > 20 ? 'CRÍTICA' : (alertasNoResueltas > 10 ? 'ALTA' : 'NORMAL')
      }
    };
  }
  
  // ============ 2. DETECCIÓN DE ANOMALÍAS ============
  
  async detectarAnomalias() {
    console.log('🔮 [ORÁCULO] Detectando anomalías...');
    
    const anomalias = [];
    const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    // 1. Servidores con muchas alertas en 24h
    const servidoresConAlertas = await Alerta.aggregate([
      { $match: { timestamp: { $gte: hace24h }, resuelta: false } },
      { $group: { _id: '$expedienteId', count: { $sum: 1 } } },
      { $match: { count: { $gt: 5 } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);
    
    for (const item of servidoresConAlertas) {
      const expediente = await Expediente.findById(item._id).select('nombre');
      const anomalia = {
        tipo: 'alertas_excesivas',
        gravedad: item.count > 10 ? 'ALTA' : 'MEDIA',
        entidad: expediente?.nombre || 'Desconocido',
        entidadId: item._id,
        mensaje: `${item.count} alertas no resueltas en las últimas 24h`,
        timestamp: new Date()
      };
      anomalias.push(anomalia);
      
      // Generar alerta si es grave
      if (anomalia.gravedad === 'ALTA') {
        await this.alertasService.alertaOráculo(
          'atencion',
          `⚠️ Alertas excesivas en ${anomalia.entidad}`,
          anomalia.mensaje,
          { entidadId: item._id, count: item.count }
        );
      }
    }
    
    // 2. Picos anómalos de CPU
    const picosCPU = await Metrica.aggregate([
      { $match: { tipo: 'cpu', valor: { $gt: 90 }, timestamp: { $gte: hace24h } } },
      { $group: { _id: '$expedienteId', max: { $max: '$valor' }, count: { $sum: 1 } } },
      { $sort: { max: -1 } },
      { $limit: 5 }
    ]);
    
    for (const pico of picosCPU) {
      const expediente = await Expediente.findById(pico._id).select('nombre');
      const anomalia = {
        tipo: 'pico_cpu',
        gravedad: pico.max > 95 ? 'ALTA' : 'MEDIA',
        entidad: expediente?.nombre || 'Desconocido',
        entidadId: pico._id,
        mensaje: `CPU al ${pico.max}% (${pico.count} mediciones altas)`,
        timestamp: new Date()
      };
      anomalias.push(anomalia);
      
      if (anomalia.gravedad === 'ALTA') {
        await this.alertasService.alertaOráculo(
          'critica',
          `🔥 Pico de CPU en ${anomalia.entidad}`,
          anomalia.mensaje,
          { entidadId: pico._id, max: pico.max, count: pico.count }
        );
      }
    }
    
    // 3. Módulos sin actividad reciente
    const modulos = ['instalacion', 'mantenimiento', 'robot', 'aprendizaje'];
    for (const modulo of modulos) {
      const actividad = await EventoAuditoria.countDocuments({
        modulo,
        fecha: { $gte: hace24h }
      });
      
      if (actividad === 0) {
        const anomalia = {
          tipo: 'modulo_inactivo',
          gravedad: 'MEDIA',
          entidad: modulo,
          mensaje: `Módulo ${modulo} sin actividad en las últimas 24h`,
          timestamp: new Date()
        };
        anomalias.push(anomalia);
        
        await this.alertasService.alertaOráculo(
          'atencion',
          `⚠️ Módulo ${modulo} inactivo`,
          anomalia.mensaje,
          { modulo, horas: 24 }
        );
      }
    }
    
    // 4. Servidores sin métricas recientes
    const servidoresSinMetricas = await Expediente.aggregate([
      { $match: { origen: 'mantenimiento' } },
      { $lookup: {
          from: 'metricas',
          localField: '_id',
          foreignField: 'expedienteId',
          as: 'metricasRecientes'
        }
      },
      { $addFields: {
          tieneMetricasRecientes: {
            $gt: [{ $size: { $filter: { input: '$metricasRecientes', as: 'm', cond: { $gte: ['$$m.timestamp', hace24h] } } } }, 0]
          }
        }
      },
      { $match: { tieneMetricasRecientes: false } },
      { $limit: 5 }
    ]);
    
    for (const servidor of servidoresSinMetricas) {
      const anomalia = {
        tipo: 'sin_metricas',
        gravedad: 'ALTA',
        entidad: servidor.nombre,
        entidadId: servidor._id,
        mensaje: 'No se han recibido métricas en las últimas 24h',
        timestamp: new Date()
      };
      anomalias.push(anomalia);
      
      await this.alertasService.alertaOráculo(
        'critica',
        `📊 Servidor sin métricas: ${servidor.nombre}`,
        anomalia.mensaje,
        { entidadId: servidor._id, servidor: servidor.nombre }
      );
    }
    
    return anomalias;
  }
  
  // ============ 3. PREDICCIONES CON APRENDIZAJE ============
  
  async predecirRiesgos() {
    console.log('🔮 [ORÁCULO] Prediciendo riesgos...');
    
    const riesgos = [];
    const hace7dias = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    // 1. Tendencia creciente de CPU
    const tendenciasCPU = await Metrica.aggregate([
      { $match: { tipo: 'cpu', timestamp: { $gte: hace7dias } } },
      { $group: {
          _id: '$expedienteId',
          valores: { $push: '$valor' },
          fechas: { $push: '$timestamp' }
        }
      },
      { $addFields: {
          tendencia: { $subtract: [{ $arrayElemAt: ['$valores', -1] }, { $arrayElemAt: ['$valores', 0] }] }
        }
      },
      { $match: { tendencia: { $gt: 20 } } },
      { $sort: { tendencia: -1 } },
      { $limit: 5 }
    ]);
    
    for (const tendencia of tendenciasCPU) {
      const expediente = await Expediente.findById(tendencia._id).select('nombre');
      const probabilidadBase = Math.min(95, 50 + Math.abs(tendencia.tendencia));
      
      riesgos.push({
        tipo: 'tendencia_cpu',
        probabilidadOriginal: probabilidadBase,
        probabilidad: probabilidadBase,
        entidad: expediente?.nombre || 'Desconocido',
        entidadId: tendencia._id,
        mensaje: `Tendencia creciente de CPU: +${tendencia.tendencia}% en 7 días`,
        recomendacion: 'Revisar procesos y considerar escalado',
        horizonte: '3-5 días'
      });
    }
    
    // 2. Servidores con muchas alertas recurrentes
    const alertasRecurrentes = await Alerta.aggregate([
      { $match: { timestamp: { $gte: hace7dias }, resuelta: false } },
      { $group: { _id: '$expedienteId', count: { $sum: 1 }, tipos: { $addToSet: '$tipo' } } },
      { $match: { count: { $gt: 3 } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);
    
    for (const alerta of alertasRecurrentes) {
      const expediente = await Expediente.findById(alerta._id).select('nombre');
      const probabilidadBase = Math.min(90, 30 + alerta.count * 5);
      
      riesgos.push({
        tipo: 'alertas_recurrentes',
        probabilidadOriginal: probabilidadBase,
        probabilidad: probabilidadBase,
        entidad: expediente?.nombre || 'Desconocido',
        entidadId: alerta._id,
        mensaje: `${alerta.count} alertas recurrentes (${alerta.tipos.slice(0, 3).join(', ')})`,
        recomendacion: 'Investigar causa raíz de las alertas',
        horizonte: '7 días'
      });
    }
    
    // 3. Servidores con bajo score de salud
    const servidoresCriticos = await Expediente.find({
      origen: 'mantenimiento',
      'instalacion.resumen.scoreFinal': { $lt: 60 }
    }).limit(5);
    
    for (const servidor of servidoresCriticos) {
      riesgos.push({
        tipo: 'score_bajo',
        probabilidadOriginal: 70,
        probabilidad: 70,
        entidad: servidor.nombre,
        entidadId: servidor._id,
        mensaje: `Score de salud: ${servidor.instalacion?.resumen?.scoreFinal || 0}%`,
        recomendacion: 'Revisar estado general del servidor',
        horizonte: 'Inmediato'
      });
    }
    
    // Aplicar mejora de aprendizaje a cada riesgo
    for (const riesgo of riesgos) {
      if (riesgo.entidadId) {
        const mejora = await this.aprendizajeService.mejorarPrediccionPorTipo(riesgo.tipo, riesgo.probabilidadOriginal);
        if (mejora) {
          riesgo.probabilidad = mejora.probabilidadMejorada;
          riesgo.mejoradoPorIA = true;
          riesgo.factorAjuste = mejora.factorAplicado;
        }
      }
    }
    
    return riesgos;
  }
  
  // ============ 4. RECOMENDACIONES ============
  
  async generarRecomendaciones() {
    console.log('🔮 [ORÁCULO] Generando recomendaciones...');
    
    const recomendaciones = [];
    const anomalias = await this.detectarAnomalias();
    const riesgos = await this.predecirRiesgos();
    const salud = await this.analizarSaludGlobal();
    
    const anomaliasCriticas = anomalias.filter(a => a.gravedad === 'ALTA');
    for (const anom of anomaliasCriticas.slice(0, 3)) {
      recomendaciones.push({
        prioridad: 'ALTA',
        accion: `Revisar ${anom.tipo} en ${anom.entidad}`,
        motivo: anom.mensaje,
        plazo: '24 horas',
        origen: 'anomalia'
      });
    }
    
    const riesgosAltos = riesgos.filter(r => r.probabilidad > 70);
    for (const riesgo of riesgosAltos.slice(0, 3)) {
      recomendaciones.push({
        prioridad: 'ALTA',
        accion: riesgo.recomendacion,
        motivo: riesgo.mensaje,
        plazo: riesgo.horizonte,
        origen: 'prediccion',
        mejoraIA: riesgo.mejoradoPorIA || false
      });
    }
    
    if (salud.metricas.cpu.promedio > 80) {
      recomendaciones.push({
        prioridad: 'MEDIA',
        accion: 'Optimizar uso de CPU',
        motivo: `CPU promedio del sistema: ${salud.metricas.cpu.promedio}%`,
        plazo: '7 días',
        origen: 'salud'
      });
    }
    
    if (salud.alertas.totalNoResueltas > 5) {
      recomendaciones.push({
        prioridad: 'MEDIA',
        accion: 'Revisar alertas pendientes',
        motivo: `${salud.alertas.totalNoResueltas} alertas sin resolver`,
        plazo: '3 días',
        origen: 'salud'
      });
    }
    
    if (recomendaciones.length === 0) {
      recomendaciones.push({
        prioridad: 'INFO',
        accion: 'Mantenimiento preventivo',
        motivo: 'Sistema estable, continuar con monitoreo normal',
        plazo: '30 días',
        origen: 'sistema'
      });
    }
    
    return recomendaciones;
  }
  
  // ============ 5. ESTADO COMPLETO DEL ORÁCULO ============
  
  async obtenerEstadoCompleto() {
    const [salud, anomalias, riesgos, recomendaciones, estadisticasAprendizaje] = await Promise.all([
      this.analizarSaludGlobal(),
      this.detectarAnomalias(),
      this.predecirRiesgos(),
      this.generarRecomendaciones(),
      this.aprendizajeService.obtenerEstadisticas()
    ]);
    
    return {
      timestamp: new Date().toISOString(),
      version: '3.0.0',
      modo: oraculoActions.getModoSoloObservacion() ? 'solo_observacion' : 'activo',
      salud,
      anomalias: anomalias.slice(0, 20),
      riesgos: riesgos.slice(0, 10),
      recomendaciones: recomendaciones.slice(0, 10),
      aprendizaje: estadisticasAprendizaje,
      metricaGeneral: {
        totalAnalisis: await EventoAuditoria.countDocuments({ modulo: 'oraculo' }),
        ultimoAnalisis: await EventoAuditoria.findOne({ modulo: 'oraculo' }).sort({ fecha: -1 })
      }
    };
  }
  
  // ============ 6. SIMULADOR DE FALLOS ============
  
  async simularFallo(tipo, entidadId, detalles = {}) {
    console.log(`🔮 [ORÁCULO] Simulando fallo: ${tipo} en ${entidadId}`);
    
    let expedienteRealId = entidadId;
    if (entidadId === 'ID_DEL_EXPEDIENTE' || !entidadId.match(/^[0-9a-fA-F]{24}$/)) {
      const expediente = await Expediente.findOne({ origen: 'mantenimiento' });
      if (!expediente) {
        return { success: false, mensaje: 'No hay expedientes reales para simular fallos' };
      }
      expedienteRealId = expediente._id.toString();
      console.log(`🔮 [ORÁCULO] Usando expediente real: ${expediente.nombre}`);
    }
    
    await EventoAuditoria.create({
      tipo: 'fallo_simulado',
      modulo: 'oraculo',
      usuario: 'sistema',
      detalles: {
        tipoFallo: tipo,
        entidadId: expedienteRealId,
        ...detalles,
        simulado: true,
        timestamp: new Date()
      },
      fecha: new Date()
    });
    
    // Crear alerta informativa de la simulación
    await this.alertasService.alertaOráculo(
      'info',
      `🎯 Fallo simulado: ${tipo}`,
      `Se ha simulado un fallo de tipo ${tipo} para entrenamiento`,
      { tipo, entidadId: expedienteRealId, detalles }
    );
    
    if (detalles.clienteId) {
      try {
        await Alerta.create({
          expedienteId: expedienteRealId,
          clienteId: detalles.clienteId,
          timestamp: new Date(),
          tipo: tipo === 'cpu_alta' ? 'error' : 'critico',
          mensaje: `[SIMULADO] ${tipo === 'cpu_alta' ? `Pico de CPU: ${detalles.valor || 95}%` : `Servicio ${detalles.servicio || 'desconocido'} no responde`}`,
          origen: 'sistema',
          resuelta: false
        });
        console.log(`✅ [ORÁCULO] Alerta simulada creada`);
      } catch (error) {
        console.log(`⚠️ [ORÁCULO] No se pudo crear alerta: ${error.message}`);
      }
    }
    
    return { success: true, mensaje: `Fallo simulado: ${tipo}` };
  }
  
  // ============ 7. ACCIONES DEL ORÁCULO ============
  
  async getModoObservacion() {
    return { modoSoloObservacion: oraculoActions.getModoSoloObservacion() };
  }
  
  async setModoObservacion(activo) {
    oraculoActions.setModoSoloObservacion(activo);
    return { modoSoloObservacion: activo };
  }
  
  async ejecutarAccion(tipo, entidadId, detalles = {}) {
    // 🧠 RECORDATORIO: EL ORÁCULO ORDENA, NO EJECUTA
    if (oraculoActions.getModoSoloObservacion()) {
      return { 
        success: false, 
        mensaje: '🔮 Modo solo observación activo. El Oráculo ordena acciones pero está en modo simulación.' 
      };
    }
    
    let resultado;
    switch (tipo) {
      case 'reintentar_mantenimiento':
        resultado = await oraculoActions.reintentarMantenimiento(entidadId);
        break;
      case 'ejecutar_prueba_robot':
        resultado = await oraculoActions.ejecutarPruebaRobot(entidadId, detalles.tipoPrueba);
        break;
      case 'reanudar_instalacion':
        resultado = await oraculoActions.reanudarInstalacion(entidadId);
        break;
      case 'cadena_acciones':
        resultado = await oraculoActions.ejecutarCadenaAcciones(entidadId, detalles.problema);
        break;
      default:
        throw new Error(`Acción desconocida: ${tipo}`);
    }
    
    // Crear alerta según el resultado
    if (resultado.success) {
      await this.alertasService.alertaOráculo(
        'exito',
        `✅ Acción ejecutada: ${tipo}`,
        `La acción ${tipo} se completó exitosamente en ${entidadId}`,
        { tipo, entidadId, resultado }
      );
    } else {
      await this.alertasService.alertaOráculo(
        'atencion',
        `⚠️ Acción fallida: ${tipo}`,
        `La acción ${tipo} falló en ${entidadId}: ${resultado.error}`,
        { tipo, entidadId, error: resultado.error }
      );
    }
    
    return resultado;
  }
  
  async obtenerHistorialAcciones(limit = 50) {
    return await AccionOráculo.find()
      .sort({ fecha: -1 })
      .limit(limit)
      .populate('entidadId', 'nombre');
  }
  
  // ============ 8. UMBRALES CONFIGURABLES ============
  
  getUmbralesModulo(modulo) {
    const umbrales = {
      mantenimiento: {
        maxReintentosFallidos: 3,
        tiempoEsperaRecuperacion: 30000,
        saludMinima: 'warning'
      },
      instalacion: {
        maxReintentosFallidos: 2,
        tiempoEsperaRecuperacion: 60000,
        saludMinima: 'ok'
      },
      robot: {
        maxReintentosFallidos: 5,
        tiempoEsperaRecuperacion: 15000,
        saludMinima: 'warning'
      },
      aprendizaje: {
        maxReintentosFallidos: 2,
        tiempoEsperaRecuperacion: 120000,
        saludMinima: 'ok'
      }
    };
    
    return umbrales[modulo] || umbrales.mantenimiento;
  }
  
  // ============ 9. EVALUACIÓN Y FORZADO DE SOLUCIONES ============
  
  async evaluarSaludModulo(modulo, entidadId) {
    console.log(`🔮 [ORÁCULO] Evaluando salud del módulo ${modulo}`);
    
    const umbrales = this.getUmbralesModulo(modulo);
    const reintentosPrevios = await this.contarReintentosFallidos(modulo, entidadId);
    
    try {
      const baseUrl = this.modulosUrls[modulo];
      if (!baseUrl) {
        return this.generarRespuestaSalud('DESCONOCIDO', false, {
          motivo: `Módulo ${modulo} no tiene URL configurada`,
          reintentosPrevios,
          umbral: umbrales.maxReintentosFallidos,
          necesitaForzar: reintentosPrevios >= umbrales.maxReintentosFallidos
        });
      }
      
      const fetch = require('node-fetch');
      const response = await fetch(`${baseUrl}/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) {
        return this.generarRespuestaSalud('INACCESIBLE', false, {
          motivo: `Módulo no responde (HTTP ${response.status})`,
          reintentosPrevios,
          umbral: umbrales.maxReintentosFallidos,
          necesitaForzar: reintentosPrevios >= umbrales.maxReintentosFallidos
        });
      }
      
      const estado = await response.json();
      
      const nivelesSalud = { ok: 3, warning: 2, crítico: 1, inaccesible: 0 };
      let puedeAutosanarse = true;
      let motivo = 'Módulo operativo';
      let necesitaForzar = false;
      
      if (nivelesSalud[estado.health] < nivelesSalud[umbrales.saludMinima]) {
        puedeAutosanarse = false;
        motivo = `Salud del módulo: ${estado.health} (mínimo: ${umbrales.saludMinima})`;
        necesitaForzar = true;
      }
      
      if (reintentosPrevios >= umbrales.maxReintentosFallidos) {
        puedeAutosanarse = false;
        motivo = `${reintentosPrevios} reintentos fallidos (límite: ${umbrales.maxReintentosFallidos})`;
        necesitaForzar = true;
      }
      
      if (estado.carga && estado.carga > 90) {
        puedeAutosanarse = false;
        motivo = `Módulo sobrecargado: ${estado.carga}%`;
        necesitaForzar = true;
      }
      
      return {
        salud: estado.health || 'DESCONOCIDO',
        puedeAutosanarse,
        necesitaForzar,
        motivo,
        reintentosPrevios,
        umbral: umbrales.maxReintentosFallidos,
        detalles: estado,
        timestamp: new Date()
      };
      
    } catch (error) {
      return this.generarRespuestaSalud('INACCESIBLE', false, {
        motivo: `Error al contactar módulo: ${error.message}`,
        reintentosPrevios,
        umbral: umbrales.maxReintentosFallidos,
        necesitaForzar: reintentosPrevios >= umbrales.maxReintentosFallidos
      });
    }
  }
  
  generarRespuestaSalud(salud, puedeAutosanarse, datos) {
    return {
      salud,
      puedeAutosanarse,
      necesitaForzar: datos.necesitaForzar || false,
      motivo: datos.motivo,
      reintentosPrevios: datos.reintentosPrevios,
      umbral: datos.umbral,
      timestamp: new Date()
    };
  }
  
  async contarReintentosFallidos(modulo, entidadId) {
    const acciones = await AccionOráculo.find({
      tipo: { $regex: modulo, $options: 'i' },
      entidadId,
      resultado: 'fallo',
      fecha: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });
    
    return acciones.length;
  }
  
  async forzarSolucion(modulo, entidadId, problema) {
    console.log(`🔮 [ORÁCULO] FORZANDO solución en módulo ${modulo}`);
    
    await EventoAuditoria.create({
      tipo: 'forzando_solucion',
      modulo: 'oraculo',
      usuario: 'oraculo',
      detalles: { modulo, entidadId, problema, timestamp: new Date() },
      fecha: new Date()
    });
    
    let accion = null;
    
    switch (modulo) {
      case 'mantenimiento':
        accion = await oraculoActions.reintentarMantenimiento(entidadId, 'ALTA');
        break;
      case 'instalacion':
        accion = await oraculoActions.reanudarInstalacion(entidadId, 'ALTA');
        break;
      case 'robot':
        accion = await oraculoActions.ejecutarPruebaRobot(entidadId, 'diagnostico', 'ALTA');
        break;
      default:
        return { success: false, error: `Módulo ${modulo} no soporta forzado` };
    }
    
    await EventoAuditoria.create({
      tipo: 'solucion_forzada',
      modulo: 'oraculo',
      usuario: 'oraculo',
      detalles: { modulo, entidadId, accionId: accion.accionId, resultado: accion.success },
      fecha: new Date()
    });
    
    // Crear alerta por forzado
    if (accion.success) {
      await this.alertasService.alertaOráculo(
        'exito',
        `🔧 Solución forzada en ${modulo}`,
        `Se ha forzado una solución para ${entidadId}. El módulo ${modulo} ha respondido correctamente.`,
        { modulo, entidadId, problema }
      );
    } else {
      await this.alertasService.alertaOráculo(
        'critica',
        `❌ Fallo al forzar solución en ${modulo}`,
        `No se pudo forzar una solución para ${entidadId}. Error: ${accion.error}`,
        { modulo, entidadId, problema, error: accion.error }
      );
    }
    
    return accion;
  }
  
  async evaluarYForzarSiNecesario(problema) {
    const { modulo, entidadId, tipoProblema } = problema;
    
    console.log(`🔮 [ORÁCULO] Evaluando problema: ${tipoProblema} en ${modulo}`);
    
    const saludModulo = await this.evaluarSaludModulo(modulo, entidadId);
    
    if (!saludModulo.necesitaForzar && saludModulo.puedeAutosanarse) {
      console.log(`✅ [ORÁCULO] Módulo ${modulo} puede autosanarse. Delegando...`);
      
      await EventoAuditoria.create({
        tipo: 'delegacion_modulo',
        modulo: 'oraculo',
        usuario: 'oraculo',
        detalles: { modulo, entidadId, tipoProblema, decision: 'delegar', motivo: saludModulo.motivo },
        fecha: new Date()
      });
      
      return {
        success: true,
        decision: 'delegar',
        mensaje: `El módulo ${modulo} se autosanará`,
        saludModulo
      };
      
    } else {
      console.log(`⚠️ [ORÁCULO] Módulo ${modulo} NO puede autosanarse. FORZANDO...`);
      
      const resultado = await this.forzarSolucion(modulo, entidadId, tipoProblema);
      
      return {
        success: resultado.success,
        decision: 'forzar',
        mensaje: `Oráculo ha forzado solución en ${modulo}`,
        saludModulo,
        accion: resultado
      };
    }
  }
  
  // ============ 10. EVALUACIÓN AUTOMÁTICA DE ANOMALÍAS ============
  
  async evaluarAnomaliaYActuar(anomalia) {
    console.log(`🔮 [ORÁCULO] Evaluando anomalía: ${anomalia.tipo}`);
    
    const moduloMap = {
      'pico_cpu': 'mantenimiento',
      'alertas_excesivas': 'mantenimiento',
      'sin_metricas': 'mantenimiento',
      'fallo_instalacion': 'instalacion',
      'error_conexion': 'robot',
      'modulo_inactivo': 'aprendizaje'
    };
    
    const modulo = moduloMap[anomalia.tipo] || 'mantenimiento';
    const entidadId = anomalia.entidadId;
    
    const saludModulo = await this.evaluarSaludModulo(modulo, entidadId);
    
    await EventoAuditoria.create({
      tipo: 'evaluacion_anomalia',
      modulo: 'oraculo',
      usuario: 'oraculo',
      detalles: {
        anomalia: anomalia.tipo,
        modulo,
        entidadId,
        decision: saludModulo.necesitaForzar ? 'forzar' : 'delegar',
        motivo: saludModulo.motivo,
        reintentosPrevios: saludModulo.reintentosPrevios
      },
      fecha: new Date()
    });
    
    if (saludModulo.necesitaForzar) {
      console.log(`⚠️ [ORÁCULO] Anomalía requiere FORZAR: ${anomalia.tipo}`);
      const resultado = await this.forzarSolucion(modulo, entidadId, anomalia.tipo);
      return { actuado: true, decision: 'forzar', resultado, saludModulo };
    } else {
      console.log(`✅ [ORÁCULO] Anomalía delegada al módulo: ${anomalia.tipo}`);
      return { actuado: false, decision: 'delegar', mensaje: `El módulo ${modulo} resolverá`, saludModulo };
    }
  }
  
  async evaluarTodasLasAnomalias() {
    console.log(`🔮 [ORÁCULO] Evaluando todas las anomalías activas...`);
    
    const anomalias = await this.detectarAnomalias();
    const anomaliasGraves = anomalias.filter(a => a.gravedad === 'ALTA');
    
    console.log(`🔮 [ORÁCULO] Encontradas ${anomalias.length} anomalías, ${anomaliasGraves.length} graves`);
    
    const resultados = [];
    
    for (const anomalia of anomaliasGraves.slice(0, 5)) {
      const resultado = await this.evaluarAnomaliaYActuar(anomalia);
      resultados.push({
        anomalia: anomalia.tipo,
        entidad: anomalia.entidad,
        ...resultado
      });
    }
    
    const forzados = resultados.filter(r => r.decision === 'forzar').length;
    if (forzados > 0) {
      console.log(`🔮 [ORÁCULO] Se forzaron ${forzados} soluciones en este ciclo`);
    }
    
    return {
      totalAnomalias: anomalias.length,
      gravesProcesadas: anomaliasGraves.length,
      forzados,
      resultados
    };
  }
  
  // ============ 11. MÉTRICAS DE FORZADO ============
  
  async obtenerMetricasForzado() {
    const metricas = await AccionOráculo.aggregate([
      { 
        $match: { 
          tipo: { $in: ['reintentar_mantenimiento', 'reanudar_instalacion', 'ejecutar_prueba_robot'] }
        } 
      },
      {
        $group: {
          _id: { tipo: '$tipo', resultado: '$resultado' },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: '$_id.tipo',
          exitos: { $sum: { $cond: [{ $eq: ['$_id.resultado', 'exito'] }, '$count', 0] } },
          fallos: { $sum: { $cond: [{ $eq: ['$_id.resultado', 'fallo'] }, '$count', 0] } }
        }
      }
    ]);
    
    return {
      timestamp: new Date(),
      metricas,
      totalForzados: metricas.reduce((acc, m) => acc + m.exitos + m.fallos, 0)
    };
  }
  
  // ============ 12. INTEGRACIÓN CON APRENDIZAJE ============
  
  async registrarResultadoPrediccion(prediccionId, resultadoReal, datosReales = {}) {
    const resultado = await this.aprendizajeService.registrarResultado(prediccionId, resultadoReal, datosReales);
    
    // Crear alerta del aprendizaje
    if (resultadoReal === 'fallida') {
      await this.alertasService.alertaAprendizaje(
        'atencion',
        `🧠 Predicción fallida`,
        `La predicción ${prediccionId} falló con un error significativo`,
        { prediccionId, resultadoReal }
      );
    } else if (resultadoReal === 'acertada') {
      await this.alertasService.alertaAprendizaje(
        'exito',
        `🧠 Predicción acertada`,
        `La predicción ${prediccionId} fue correcta`,
        { prediccionId, resultadoReal }
      );
    }
    
    return resultado;
  }
  
  async obtenerEstadisticasAprendizaje() {
    return await this.aprendizajeService.obtenerEstadisticas();
  }
  
  async mejorarPrediccion(prediccionId) {
    return await this.aprendizajeService.mejorarPrediccion(prediccionId);
  }
  
  async obtenerFactoresPeso() {
    return this.aprendizajeService.obtenerFactoresPeso();
  }
  
  async reentrenarModelo() {
    const resultado = await this.aprendizajeService.reentrenarModelo();
    
    await this.alertasService.alertaAprendizaje(
      'exito',
      `🧠 Modelo reentrenado`,
      `El modelo de aprendizaje ha sido reentrenado con nuevos pesos`,
      { pesos: resultado.pesos }
    );
    
    return resultado;
  }
  
  // ============ 13. INTEGRACIÓN CON ESPEJO ============
  
  async obtenerEstadoEspejo() {
    return await this.espejoService.obtenerEstadoCompleto();
  }
  
  async generarCheckpointEspejo(origen, descripcion) {
    const resultado = await this.espejoService.generarCheckpoint(origen, { descripcion });
    
    await this.alertasService.alertaEspejo(
      'exito',
      `✅ Checkpoint generado en ${origen}`,
      descripcion || `Checkpoint automático en ${origen}`,
      { origen, checkpointId: resultado.checkpointId }
    );
    
    return resultado;
  }
  
  async restaurarCheckpointEspejo(checkpointId, destino) {
    const resultado = await this.espejoService.restaurarCheckpoint(checkpointId, destino);
    
    await this.alertasService.alertaEspejo(
      'atencion',
      `🔄 Checkpoint restaurado en ${destino}`,
      `Se ha restaurado el checkpoint ${checkpointId} en el sistema ${destino}`,
      { checkpointId, destino }
    );
    
    return resultado;
  }
  
  async ejecutarSwitchover(motivo, desde) {
    const resultado = await this.espejoService.switchover(motivo, desde);
    
    if (resultado.success) {
      await this.alertasService.alertaEspejo(
        'critica',
        `🪞 Switchover ejecutado`,
        `Cambio de sistema ${resultado.sistemaActivo === 'real' ? 'espejo → real' : 'real → espejo'}. Motivo: ${motivo}`,
        { motivo, desde, hacia: resultado.sistemaActivo }
      );
    } else {
      await this.alertasService.alertaEspejo(
        'critica',
        `❌ Fallo en switchover`,
        `No se pudo completar el switchover. Motivo: ${resultado.mensaje}`,
        { motivo, desde, error: resultado.mensaje }
      );
    }
    
    return resultado;
  }
  
  async prepararHotUpdate(version, codigo) {
    const resultado = await this.espejoService.prepararHotUpdate(version, codigo);
    
    if (resultado.success) {
      await this.alertasService.alertaEspejo(
        'info',
        `📦 Hot update preparado: versión ${version}`,
        `La versión ${version} está lista para pruebas en el espejo`,
        { version }
      );
    }
    
    return resultado;
  }
  
  async probarHotUpdate() {
    const resultado = await this.espejoService.probarHotUpdate();
    
    if (resultado.success) {
      await this.alertasService.alertaEspejo(
        'exito',
        `✅ Hot update probado exitosamente`,
        resultado.mensaje,
        { nuevaVersion: resultado.nuevaVersion }
      );
    } else {
      await this.alertasService.alertaEspejo(
        'critica',
        `❌ Hot update falló en pruebas`,
        resultado.mensaje,
        {}
      );
    }
    
    return resultado;
  }
  
  async desplegarHotUpdate() {
    const resultado = await this.espejoService.desplegarHotUpdateReal();
    
    if (resultado.success) {
      await this.alertasService.alertaEspejo(
        'exito',
        `🚀 Hot update desplegado: versión ${resultado.nuevaVersion}`,
        `La nueva versión ${resultado.nuevaVersion} está activa en el sistema REAL`,
        { nuevaVersion: resultado.nuevaVersion }
      );
    }
    
    return resultado;
  }
  
  async evaluarConEspejo(problema) {
    const saludReal = await this.espejoService.verificarSaludSistema('real');
    
    if (!saludReal.saludable && saludReal.gravedad === 'CRÍTICA') {
      console.log('⚠️ [ORÁCULO] Sistema real en fallo. Activando espejo...');
      const switchover = await this.espejoService.switchover('Fallo detectado por Oráculo', 'real');
      
      await this.alertasService.alertaEspejo(
        'critica',
        `🪞 Switchover automático activado`,
        `El sistema real falló. El espejo ha tomado el control.`,
        { problema, switchover }
      );
      
      return { espejoActivado: true, switchover };
    }
    
    return await this.evaluarYForzarSiNecesario(problema);
  }
  
  // ============ 14. ALERTAS DEL SISTEMA ============
  
  async obtenerResumenAlertas() {
    return await this.alertasService.obtenerResumen();
  }
  
  async obtenerAlertas(filtros) {
    return await this.alertasService.obtenerAlertas(filtros);
  }
  
  async marcarAlertaLeida(alertaId) {
    return await this.alertasService.marcarLeida(alertaId);
  }
  
  async marcarTodasAlertasLeidas() {
    return await this.alertasService.marcarTodasLeidas();
  }
  
  async archivarAlerta(alertaId) {
    return await this.alertasService.archivar(alertaId);
  }
  
  async archivarTodasAlertas() {
    return await this.alertasService.archivarTodas();
  }
  
  async eliminarAlerta(alertaId) {
    return await this.alertasService.eliminarAlerta(alertaId);
  }
  
  async limpiarAlertasAntiguas(dias = 30) {
    return await this.alertasService.limpiarAlertasAntiguas(dias);
  }
  
  async obtenerEstadisticasAlertas(dias = 7) {
    return await this.alertasService.obtenerEstadisticas(dias);
  }
}

module.exports = OráculoService;
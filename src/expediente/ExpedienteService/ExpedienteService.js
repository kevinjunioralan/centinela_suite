const mongoose = require('mongoose');
const AuditoriaService = require('../../auditoria/AuditoriaService');
const Metrica = require('../models/Metrica');
const Alerta = require('../models/Alerta');
const Prediccion = require('../models/Prediccion');

class ExpedienteService {
  constructor() {
    this.repository = null;
  }

  setRepository(repository) {
    this.repository = repository;
  }

  async getAllExpedientes(filtros = {}) {
    console.log('🔍 [SERVICE] getAllExpedientes - Filtros:', filtros);
    return await this.repository.getAllExpedientes(filtros);
  }

  async getExpedienteById(id) {
    return await this.repository.getExpedienteById(id);
  }

  async createExpediente(datos) {
    console.log('📦 [SERVICE] createExpediente - Solicitud recibida');
    
    // Convertir clienteId a ObjectId si es necesario
    let clienteId = null;
    if (datos.clienteId) {
      try {
        clienteId = new mongoose.Types.ObjectId(datos.clienteId);
      } catch (error) {
        throw new Error('clienteId invalido');
      }
    }
    
    // Crear el expediente (SIN métricas, alertas, predicciones)
    const expedienteData = {
      nombre: datos.nombre || "",
      descripcion: datos.descripcion || "",
      origen: datos.origen || "manual",
      clienteId: clienteId,
      estado: "pendiente",
      historialEstados: [{
        estado: "pendiente",
        fecha: new Date().toISOString(),
        observacion: "Expediente creado"
      }],
      servidor: {
        ip: datos.servidor?.ip || null,
        puerto: datos.servidor?.puerto || 22,
        usuario: datos.servidor?.usuario || "root",
        password: datos.servidor?.password || null,
        hostname: datos.servidor?.hostname || null
      },
      instalacion: datos.instalacion || {}
    };
    
    return await this.repository.createExpediente(expedienteData);
  }

  // ============ NUEVOS MÉTODOS PARA MÉTRICAS ============
  
  async registrarMetrica(expedienteId, clienteId, tipo, valor, origen = 'monitorizacion', detalles = {}) {
    console.log(`📊 [SERVICE] Registrando métrica - Expediente: ${expedienteId}, Tipo: ${tipo}, Valor: ${valor}`);
    
    const metrica = new Metrica({
      expedienteId: new mongoose.Types.ObjectId(expedienteId),
      clienteId: new mongoose.Types.ObjectId(clienteId),
      timestamp: new Date(),
      tipo,
      valor,
      origen,
      detalles
    });
    
    return await metrica.save();
  }
  
  async obtenerMetricas(expedienteId, tipo = null, limite = 100) {
    const query = { expedienteId: new mongoose.Types.ObjectId(expedienteId) };
    if (tipo) query.tipo = tipo;
    
    return await Metrica.find(query)
      .sort({ timestamp: -1 })
      .limit(limite)
      .lean();
  }
  
  async obtenerUltimaMetrica(expedienteId, tipo) {
    return await Metrica.findOne({
      expedienteId: new mongoose.Types.ObjectId(expedienteId),
      tipo
    }).sort({ timestamp: -1 }).lean();
  }
  
  // ============ NUEVOS MÉTODOS PARA ALERTAS ============
  
  async registrarAlerta(expedienteId, clienteId, tipo, mensaje, origen = 'sistema', valor = null, umbral = null) {
    console.log(`⚠️ [SERVICE] Registrando alerta - Expediente: ${expedienteId}, Tipo: ${tipo}, Mensaje: ${mensaje}`);
    
    const alerta = new Alerta({
      expedienteId: new mongoose.Types.ObjectId(expedienteId),
      clienteId: new mongoose.Types.ObjectId(clienteId),
      timestamp: new Date(),
      tipo,
      mensaje,
      origen,
      valor,
      umbral,
      resuelta: false
    });
    
    return await alerta.save();
  }
  
  async obtenerAlertas(expedienteId, soloNoResueltas = false, limite = 50) {
    const query = { expedienteId: new mongoose.Types.ObjectId(expedienteId) };
    if (soloNoResueltas) query.resuelta = false;
    
    return await Alerta.find(query)
      .sort({ timestamp: -1 })
      .limit(limite)
      .lean();
  }
  
  async resolverAlerta(alertaId, resueltaPor = 'sistema') {
    return await Alerta.findByIdAndUpdate(alertaId, {
      resuelta: true,
      resueltaEn: new Date(),
      resueltaPor
    }, { new: true });
  }
  
  // ============ NUEVOS MÉTODOS PARA PREDICCIONES ============
  
  async registrarPrediccion(expedienteId, clienteId, tipoFallo, probabilidad, fechaEstimadaFallo, recomendacion = '', origen = 'aprendizaje') {
    console.log(`🔮 [SERVICE] Registrando predicción - Expediente: ${expedienteId}, Tipo: ${tipoFallo}, Prob: ${probabilidad}%`);
    
    const prediccion = new Prediccion({
      expedienteId: new mongoose.Types.ObjectId(expedienteId),
      clienteId: new mongoose.Types.ObjectId(clienteId),
      fechaPrediccion: new Date(),
      tipoFallo,
      probabilidad,
      fechaEstimadaFallo,
      recomendacion,
      origen,
      acertada: null
    });
    
    return await prediccion.save();
  }
  
  async obtenerPrediccionesActivas(expedienteId) {
    return await Prediccion.find({
      expedienteId: new mongoose.Types.ObjectId(expedienteId),
      acertada: null,
      fechaEstimadaFallo: { $gt: new Date() }
    }).sort({ probabilidad: -1 }).lean();
  }
  
  async evaluarPredicciones() {
    // Buscar predicciones vencidas no evaluadas
    const predicciones = await Prediccion.find({
      acertada: null,
      fechaEstimadaFallo: { $lt: new Date() }
    });
    
    for (const pred of predicciones) {
      // Buscar si hubo alerta del tipo predicho después de la predicción
      const alertaRelacionada = await Alerta.findOne({
        expedienteId: pred.expedienteId,
        tipo: pred.tipoFallo === 'cpu' ? 'error' : 'advertencia',
        timestamp: { $gt: pred.fechaPrediccion }
      }).sort({ timestamp: 1 });
      
      const acertada = !!alertaRelacionada;
      pred.acertada = acertada;
      pred.fechaEvaluacion = new Date();
      pred.precision = acertada ? pred.probabilidad : 100 - pred.probabilidad;
      await pred.save();
    }
    
    return predicciones.length;
  }

  // ============ MÉTODOS EXISTENTES (sin cambios) ============
  
  async cambiarOrigen(id, nuevoOrigen) {
    const expediente = await this.repository.getExpedienteById(id);
    if (!expediente) throw new Error('Expediente no encontrado');
    
    const origenAnterior = expediente.origen;
    const nuevoEstado = nuevoOrigen === 'mantenimiento' ? 'en_mantenimiento' : 'pendiente';
    
    const resultado = await this.repository.updateExpediente(id, {
      origen: nuevoOrigen,
      estado: nuevoEstado,
      mantenimiento: nuevoOrigen === 'mantenimiento' ? {
        fechaIngreso: new Date()
      } : undefined
    });
    
    const auditoria = new AuditoriaService();
    await auditoria.registrarEvento('cambio_origen', 'sistema', {
      modulo: 'expediente',
      expedienteId: id,
      detalles: { de: origenAnterior, a: nuevoOrigen }
    });
    
    return resultado;
  }

  async updateExpediente(id, data) {
    console.log("🛠 [SERVICE] updateExpediente ejecutado");
    console.log("📦 Datos:", data);
    return await this.repository.updateExpediente(id, data);
  }

  async deleteExpediente(id) {
    // También eliminar métricas, alertas y predicciones asociadas
    await Metrica.deleteMany({ expedienteId: new mongoose.Types.ObjectId(id) });
    await Alerta.deleteMany({ expedienteId: new mongoose.Types.ObjectId(id) });
    await Prediccion.deleteMany({ expedienteId: new mongoose.Types.ObjectId(id) });
    
    return await this.repository.deleteExpediente(id);
  }

  async searchExpedientes(filtros) {
    return await this.repository.searchExpedientes(filtros);
  }

  async asignarHabitacion(expedienteId, habitacionId) {
    console.log(`🔗 Asignando habitación ${habitacionId} al expediente ${expedienteId}`);
    
    const expediente = await this.repository.getExpedienteById(expedienteId);
    if (!expediente) throw new Error(`Expediente ${expedienteId} no encontrado`);
    
    const historialEstados = expediente.historialEstados || [];
    historialEstados.push({
      estado: "en_cuarentena",
      fecha: new Date().toISOString(),
      observacion: `Asignado a habitación ${habitacionId}`,
      habitacionId: habitacionId
    });
    
    const resultado = await this.repository.updateExpediente(expedienteId, {
      habitacionId: habitacionId,
      estado: "en_cuarentena",
      fechaAsignacion: new Date().toISOString(),
      historialEstados: historialEstados
    });
    
    return resultado;
  }

  async cambiarEstado(expedienteId, nuevoEstado, detalles = {}) {
    console.log(`🔄 Cambiando estado del expediente ${expedienteId} a: ${nuevoEstado}`);
    
    const expediente = await this.repository.getExpedienteById(expedienteId);
    if (!expediente) throw new Error(`Expediente ${expedienteId} no encontrado`);
    
    const estadosValidos = ["pendiente", "en_cuarentena", "en_pruebas", "diagnosticado", "en_mantenimiento"];
    if (!estadosValidos.includes(nuevoEstado)) {
      throw new Error(`Estado inválido: ${nuevoEstado}`);
    }

    const estadoActual = expediente.estado || 'pendiente';
    const transicionesPermitidas = {
      pendiente: ['en_cuarentena', 'en_mantenimiento'],
      en_cuarentena: ['en_pruebas', 'pendiente'],
      en_pruebas: ['diagnosticado', 'en_cuarentena'],
      diagnosticado: ['en_mantenimiento', 'pendiente'],
      en_mantenimiento: ['pendiente']
    };

    if (nuevoEstado !== estadoActual) {
      const permitidas = transicionesPermitidas[estadoActual] || [];
      if (!permitidas.includes(nuevoEstado)) {
        throw new Error(`Transición de estado no permitida: ${estadoActual} -> ${nuevoEstado}`);
      }
    }
    
    const historialEstados = expediente.historialEstados || [];
    historialEstados.push({
      estado: nuevoEstado,
      fecha: new Date().toISOString(),
      observacion: detalles.observacion || `Cambio de estado a ${nuevoEstado}`,
      ...detalles
    });
    
    const updateData = {
      estado: nuevoEstado,
      historialEstados: historialEstados
    };
    
    if (nuevoEstado === "diagnosticado" || nuevoEstado === "en_mantenimiento") {
      updateData.habitacionId = null;
      updateData.fechaLiberacion = new Date().toISOString();
    }
    
    return await this.repository.updateExpediente(expedienteId, updateData);
  }

  async obtenerPorEstado(estado) {
    const filtrados = await this.repository.getExpedientesPorEstado(estado);
    return filtrados;
  }

  async liberarHabitacion(expedienteId) {
    console.log(`🔓 Liberando habitación del expediente ${expedienteId}`);
    
    const expediente = await this.repository.getExpedienteById(expedienteId);
    if (!expediente) throw new Error(`Expediente ${expedienteId} no encontrado`);
    
    const historialEstados = expediente.historialEstados || [];
    historialEstados.push({
      estado: expediente.estado,
      fecha: new Date().toISOString(),
      observacion: `Habitación ${expediente.habitacionId} liberada`,
      habitacionId: expediente.habitacionId,
      accion: "liberar_habitacion"
    });
    
    return await this.repository.updateExpediente(expedienteId, {
      habitacionId: null,
      fechaLiberacion: new Date().toISOString(),
      historialEstados: historialEstados
    });
  }
}

module.exports = ExpedienteService;
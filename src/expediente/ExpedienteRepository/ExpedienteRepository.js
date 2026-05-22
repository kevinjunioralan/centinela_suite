// ExpedienteRepository.js - Acceso a datos con MongoDB
const Expediente = require('../models/Expediente');

class ExpedienteRepository {

  async getAllExpedientes(filtros = {}) {
    console.log('📋 [REPOSITORY] getAllExpedientes - Filtros:', filtros);
    const result = await Expediente.find(filtros).select('-servidor.password').lean();
    console.log(`📋 [REPOSITORY] Encontrados ${result.length} expedientes`);
    return result;
  }

  async getExpedienteById(id) {
    console.log(`🔍 [REPOSITORY] getExpedienteById - Buscando expediente con ID: ${id}`);
    const result = await Expediente.findById(id).select('-servidor.password').lean();
    if (result) {
      console.log(`✅ [REPOSITORY] Expediente encontrado: ${result.nombre}`);
    } else {
      console.log(`❌ [REPOSITORY] Expediente no encontrado: ${id}`);
    }
    return result;
  }

  async createExpediente(expedienteData) {
    console.log('📝 [REPOSITORY] createExpediente - Creando nuevo expediente');
    console.log('📦 Datos recibidos: [sanitized]');
    
    const expediente = new Expediente({
      nombre: expedienteData.nombre || "",
      descripcion: expedienteData.descripcion || "",
      origen: expedienteData.origen || "manual",
      clienteId: expedienteData.clienteId || null,
      estado: expedienteData.estado || "pendiente",
      habitacionId: expedienteData.habitacionId || null,
      fechaAsignacion: expedienteData.fechaAsignacion || null,
      historialEstados: expedienteData.historialEstados || [],
      servidor: {
        ip: expedienteData.servidor?.ip || null,
        puerto: expedienteData.servidor?.puerto || 22,
        usuario: expedienteData.servidor?.usuario || "root",
        password: expedienteData.servidor?.password || null,
        hostname: expedienteData.servidor?.hostname || null
      },
      instalacion: expedienteData.instalacion || {},
      mantenimiento: expedienteData.mantenimiento || {
        umbrales: { cpuMax: 80, memoriaMax: 85, discoMax: 90 }
      }
      // ❌ NOTA: Ya NO se guardan metricasHistoricas, alertas, predicciones aquí
    });

    const result = await expediente.save();
    console.log(`✅ [REPOSITORY] Expediente creado con ID: ${result._id}`);
    const resultObject = result.toObject();
    if (resultObject.servidor) delete resultObject.servidor.password;
    return resultObject;
  }

  async updateExpediente(id, expedienteData) {
    console.log(`🔄 [REPOSITORY] updateExpediente - Actualizando expediente ${id}`);
    console.log("📦 Datos a actualizar:", JSON.stringify(expedienteData, null, 2));

    const updateFields = {};
    
    if (expedienteData.nombre !== undefined) updateFields.nombre = expedienteData.nombre;
    if (expedienteData.descripcion !== undefined) updateFields.descripcion = expedienteData.descripcion;
    if (expedienteData.estado !== undefined) updateFields.estado = expedienteData.estado;
    if (expedienteData.origen !== undefined) updateFields.origen = expedienteData.origen;
    if (expedienteData.habitacionId !== undefined) updateFields.habitacionId = expedienteData.habitacionId;
    if (expedienteData.fechaAsignacion !== undefined) updateFields.fechaAsignacion = expedienteData.fechaAsignacion;
    if (expedienteData.fechaLiberacion !== undefined) updateFields.fechaLiberacion = expedienteData.fechaLiberacion;
    if (expedienteData.historialEstados !== undefined) updateFields.historialEstados = expedienteData.historialEstados;
    
    // Datos del servidor
    if (expedienteData.servidor !== undefined) {
      if (expedienteData.servidor.ip !== undefined) updateFields['servidor.ip'] = expedienteData.servidor.ip || null;
      if (expedienteData.servidor.puerto !== undefined) updateFields['servidor.puerto'] = expedienteData.servidor.puerto || 22;
      if (expedienteData.servidor.usuario !== undefined) updateFields['servidor.usuario'] = expedienteData.servidor.usuario || 'root';
      if (expedienteData.servidor.hostname !== undefined) updateFields['servidor.hostname'] = expedienteData.servidor.hostname || null;
      if (expedienteData.servidor.password !== undefined && expedienteData.servidor.password !== '') {
        updateFields['servidor.password'] = expedienteData.servidor.password;
      }
    }
    
    // Datos de instalación
    if (expedienteData.instalacion !== undefined) {
      updateFields.instalacion = expedienteData.instalacion;
    }
    
    // Datos de mantenimiento
    if (expedienteData.mantenimiento !== undefined) {
      updateFields.mantenimiento = expedienteData.mantenimiento;
    }

    const result = await Expediente.findByIdAndUpdate(
      id,
      updateFields,
      { new: true }
    ).select('-servidor.password').lean();
    
    if (result) {
      console.log(`✅ [REPOSITORY] Expediente ${id} actualizado correctamente`);
    } else {
      console.log(`❌ [REPOSITORY] Expediente ${id} no encontrado para actualizar`);
    }
    
    return result;
  }

  async deleteExpediente(id) {
    console.log(`🗑️ [REPOSITORY] deleteExpediente - Eliminando expediente ${id}`);
    const result = await Expediente.findByIdAndDelete(id);
    if (result) {
      console.log(`✅ [REPOSITORY] Expediente ${id} eliminado`);
    } else {
      console.log(`❌ [REPOSITORY] Expediente ${id} no encontrado para eliminar`);
    }
    return !!result;
  }

  async searchExpedientes(filtros) {
    console.log('🔍 [REPOSITORY] searchExpedientes - Filtros:', filtros);
    const query = {};

    if (filtros.nombre) {
      query.nombre = { $regex: filtros.nombre, $options: "i" };
    }

    if (filtros.descripcion) {
      query.descripcion = { $regex: filtros.descripcion, $options: "i" };
    }

    if (filtros.estado) {
      query.estado = filtros.estado;
    }
    
    if (filtros.origen) {
      query.origen = filtros.origen;
    }
    
    if (filtros.clienteId) {
      query.clienteId = filtros.clienteId;
    }

    const result = await Expediente.find(query).select('-servidor.password').lean();
    console.log(`📋 [REPOSITORY] Encontrados ${result.length} expedientes`);
    return result;
  }

  async getTotalExpedientes() {
    const result = await Expediente.countDocuments();
    console.log(`📊 [REPOSITORY] Total expedientes: ${result}`);
    return result;
  }

  async getExpedientesPorEstado(estado) {
    console.log(`🔍 [REPOSITORY] getExpedientesPorEstado - Estado: ${estado}`);
    const result = await Expediente.find({ estado: estado }).lean();
    console.log(`📋 [REPOSITORY] Encontrados ${result.length} expedientes con estado ${estado}`);
    return result;
  }

  async getExpedientesConHabitacion() {
    console.log('🔍 [REPOSITORY] getExpedientesConHabitacion - Buscando expedientes con habitación asignada');
    const result = await Expediente.find({ habitacionId: { $ne: null, $ne: "" } }).lean();
    console.log(`📋 [REPOSITORY] Encontrados ${result.length} expedientes con habitación`);
    return result;
  }
}

module.exports = ExpedienteRepository;
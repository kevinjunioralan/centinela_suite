// backend/src/alertas/AlertasService.js
const mongoose = require('mongoose');
const AlertaSistema = require('./models/AlertaSistema');
const EventoAuditoria = require('../auditoria/models/EventoAuditoria');

class AlertasService {
  
  constructor() {
    this.eventosCallbacks = [];
  }
  
  // ============ EVENTOS EN TIEMPO REAL ============
  
  onAlertaCreada(callback) {
    this.eventosCallbacks.push(callback);
  }
  
  async emitirEvento(alerta) {
    for (const callback of this.eventosCallbacks) {
      try {
        await callback(alerta);
      } catch (error) {
        console.error('Error en callback de alerta:', error);
      }
    }
  }
  
  // ============ CREAR ALERTA ============
  
  async crearAlerta(tipo, origen, titulo, mensaje, detalles = {}, accionSugerida = null) {
    const alerta = await AlertaSistema.create({
      tipo,
      origen,
      modulo: detalles.modulo || origen,
      titulo,
      mensaje,
      detalles,
      accionSugerida: accionSugerida || null,
      creadaPor: 'sistema',
      createdAt: new Date()
    });
    
    await EventoAuditoria.create({
      tipo: `alerta_${tipo}`,
      modulo: 'alertas',
      usuario: 'sistema',
      detalles: { alertaId: alerta._id, titulo, mensaje },
      fecha: new Date()
    });
    
    console.log(`🔔 [ALERTAS] ${tipo.toUpperCase()}: ${titulo}`);
    
    await this.emitirEvento(alerta);
    
    return alerta;
  }
  
  // ============ MÉTODOS POR TIPO ============
  
  async critica(origen, titulo, mensaje, detalles = {}) {
    return this.crearAlerta('critica', origen, titulo, mensaje, detalles, {
      tipo: 'ver',
      destino: '/dashboard',
      parametros: { severity: 'high' }
    });
  }
  
  async atencion(origen, titulo, mensaje, detalles = {}) {
    return this.crearAlerta('atencion', origen, titulo, mensaje, detalles, {
      tipo: 'ver',
      destino: '/dashboard'
    });
  }
  
  async info(origen, titulo, mensaje, detalles = {}) {
    return this.crearAlerta('info', origen, titulo, mensaje, detalles);
  }
  
  async exito(origen, titulo, mensaje, detalles = {}) {
    return this.crearAlerta('exito', origen, titulo, mensaje, detalles);
  }
  
  // ============ ALERTAS POR ORIGEN ============
  
  alertaOráculo(tipo, titulo, mensaje, detalles = {}) {
    return this.crearAlerta(tipo, 'oraculo', titulo, mensaje, detalles);
  }
  
  alertaEspejo(tipo, titulo, mensaje, detalles = {}) {
    return this.crearAlerta(tipo, 'espejo', titulo, mensaje, detalles);
  }
  
  alertaAprendizaje(tipo, titulo, mensaje, detalles = {}) {
    return this.crearAlerta(tipo, 'aprendizaje', titulo, mensaje, detalles);
  }
  
  alertaSistema(tipo, titulo, mensaje, detalles = {}) {
    return this.crearAlerta(tipo, 'sistema', titulo, mensaje, detalles);
  }
  
  // ============ OBTENER ALERTAS ============
  
  async obtenerAlertas(filtros = {}) {
    const query = { archivada: false };
    
    if (filtros.tipo) query.tipo = filtros.tipo;
    if (filtros.origen) query.origen = filtros.origen;
    if (filtros.modulo) query.modulo = filtros.modulo;
    if (filtros.noLeidas) query.leida = false;
    if (filtros.desde) query.createdAt = { $gte: new Date(filtros.desde) };
    if (filtros.hasta) query.createdAt = { ...query.createdAt, $lte: new Date(filtros.hasta) };
    
    const alertas = await AlertaSistema.find(query)
      .sort({ createdAt: -1 })
      .limit(filtros.limit || 100)
      .skip(filtros.skip || 0);
    
    const total = await AlertaSistema.countDocuments(query);
    
    return { alertas, total };
  }
  
  async obtenerAlertasNoLeidas() {
    return await AlertaSistema.find({ leida: false, archivada: false })
      .sort({ createdAt: -1 });
  }
  
  async obtenerResumen() {
    const [criticas, atencion, info, exito, noLeidas] = await Promise.all([
      AlertaSistema.countDocuments({ tipo: 'critica', archivada: false }),
      AlertaSistema.countDocuments({ tipo: 'atencion', archivada: false }),
      AlertaSistema.countDocuments({ tipo: 'info', archivada: false }),
      AlertaSistema.countDocuments({ tipo: 'exito', archivada: false }),
      AlertaSistema.countDocuments({ leida: false, archivada: false })
    ]);
    
    const porOrigen = await AlertaSistema.aggregate([
      { $match: { archivada: false } },
      { $group: { _id: '$origen', count: { $sum: 1 } } }
    ]);
    
    const ultimas = await AlertaSistema.find({ archivada: false })
      .sort({ createdAt: -1 })
      .limit(10);
    
    return {
      criticas,
      atencion,
      info,
      exito,
      total: criticas + atencion + info + exito,
      noLeidas,
      porOrigen: porOrigen.reduce((acc, o) => ({ ...acc, [o._id]: o.count }), {}),
      ultimas
    };
  }
  
  // ============ MARCAR ALERTAS ============
  
  async marcarLeida(alertaId) {
    const alerta = await AlertaSistema.findByIdAndUpdate(
      alertaId,
      { leida: true, leidaEn: new Date() },
      { new: true }
    );
    return alerta;
  }
  
  async marcarTodasLeidas() {
    const result = await AlertaSistema.updateMany(
      { leida: false, archivada: false },
      { leida: true, leidaEn: new Date() }
    );
    return { modificadas: result.modifiedCount };
  }
  
  async archivar(alertaId) {
    const alerta = await AlertaSistema.findByIdAndUpdate(
      alertaId,
      { archivada: true },
      { new: true }
    );
    return alerta;
  }
  
  async archivarTodas() {
    const result = await AlertaSistema.updateMany(
      { archivada: false },
      { archivada: true }
    );
    return { archivadas: result.modifiedCount };
  }
  
  async eliminarAlerta(alertaId) {
    await AlertaSistema.findByIdAndDelete(alertaId);
    return { success: true };
  }
  
  // ============ ESTADÍSTICAS ============
  
  async obtenerEstadisticas(dias = 7) {
    const fechaLimite = new Date();
    fechaLimite.setDate(fechaLimite.getDate() - dias);
    
    const porDia = await AlertaSistema.aggregate([
      { $match: { createdAt: { $gte: fechaLimite } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          criticas: { $sum: { $cond: [{ $eq: ['$tipo', 'critica'] }, 1, 0] } },
          atencion: { $sum: { $cond: [{ $eq: ['$tipo', 'atencion'] }, 1, 0] } },
          info: { $sum: { $cond: [{ $eq: ['$tipo', 'info'] }, 1, 0] } },
          exito: { $sum: { $cond: [{ $eq: ['$tipo', 'exito'] }, 1, 0] } },
          total: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    const porOrigen = await AlertaSistema.aggregate([
      { $match: { createdAt: { $gte: fechaLimite } } },
      { $group: { _id: '$origen', count: { $sum: 1 } } }
    ]);
    
    return { porDia, porOrigen };
  }
  
  // ============ LIMPIEZA ============
  
  async limpiarAlertasAntiguas(dias = 30) {
    const fechaLimite = new Date();
    fechaLimite.setDate(fechaLimite.getDate() - dias);
    
    const result = await AlertaSistema.deleteMany({
      archivada: true,
      createdAt: { $lt: fechaLimite }
    });
    
    return { eliminadas: result.deletedCount };
  }
}

module.exports = AlertasService;
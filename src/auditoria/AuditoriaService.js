// AuditoriaService.js - Servicio de registro de eventos
const EventoAuditoria = require('./models/EventoAuditoria');

class AuditoriaService {
  
  async registrarEvento(tipo, usuario, datos = {}) {
    try {
      console.log(`📝 Intentando registrar evento: ${tipo} - ${usuario}`);
      
      const evento = new EventoAuditoria({
        tipo,
        modulo: datos.modulo || 'sistema',           // ← NUEVO: campo módulo
        usuario,
        expedienteId: datos.expedienteId || null,
        habitacionId: datos.habitacionId || null,
        detalles: datos.detalles || {},
        ip: datos.ip || null
      });
      
      await evento.save();
      console.log(`✅ Evento registrado: ${tipo} - ${usuario} - Módulo: ${evento.modulo}`);
      return evento;
    } catch (error) {
      console.error('❌ Error registrando evento:', error);
      return null;
    }
  }
  
  async obtenerEventos(filtros = {}) {
    const query = {};
    const limit = Number.isInteger(filtros.limit) ? Math.min(Math.max(filtros.limit, 1), 500) : 100;
    const offset = Number.isInteger(filtros.offset) ? Math.max(filtros.offset, 0) : 0;
    
    if (filtros.tipo) query.tipo = filtros.tipo;
    if (filtros.usuario) query.usuario = filtros.usuario;
    if (filtros.expedienteId) query.expedienteId = filtros.expedienteId;
    if (filtros.modulo && filtros.modulo !== 'todos') query.modulo = filtros.modulo;  // ← NUEVO: filtro por módulo
    if (filtros.fechaInicio || filtros.fechaFin) {
      query.fecha = {};
      if (filtros.fechaInicio) query.fecha.$gte = new Date(filtros.fechaInicio);
      if (filtros.fechaFin) query.fecha.$lte = new Date(filtros.fechaFin);
    }
    
    const [eventos, total] = await Promise.all([
      EventoAuditoria.find(query)
      .populate('expedienteId', 'nombre')
      .sort({ fecha: -1 })
      .skip(offset)
      .limit(limit),
      EventoAuditoria.countDocuments(query)
    ]);

    return {
      total,
      limit,
      offset,
      hasMore: offset + eventos.length < total,
      items: eventos
    };
  }
  
  async obtenerEstadisticas() {
    const total = await EventoAuditoria.countDocuments();
    
    const porTipo = await EventoAuditoria.aggregate([
      { $group: { _id: '$tipo', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    // 🔥 NUEVO: Estadísticas por módulo
    const porModulo = await EventoAuditoria.aggregate([
      { $group: { _id: '$modulo', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    const ultimos30Dias = await EventoAuditoria.aggregate([
      { $match: { fecha: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$fecha' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    
    return { total, porTipo, porModulo, ultimos30Dias };  // ← NUEVO: incluir porModulo
  }
  
  // 🔥 NUEVO: Resumen rápido para dashboard
  async obtenerResumen() {
    const total = await EventoAuditoria.countDocuments();
    
    const porModulo = await EventoAuditoria.aggregate([
      { $group: { _id: '$modulo', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    const ultimas24h = await EventoAuditoria.countDocuments({
      fecha: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });
    
    const ultimos7dias = await EventoAuditoria.countDocuments({
      fecha: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    });
    
    const porTipo = await EventoAuditoria.aggregate([
      { $group: { _id: '$tipo', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);
    
    const ultimosEventos = await EventoAuditoria.find()
      .sort({ fecha: -1 })
      .limit(10)
      .populate('expedienteId', 'nombre')
      .lean();
    
    return { 
      total, 
      porModulo, 
      ultimas24h,
      ultimos7dias,
      topTipos: porTipo,
      ultimosEventos
    };
  }
}

module.exports = AuditoriaService;
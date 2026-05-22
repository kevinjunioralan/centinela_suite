// HabitacionBuilder.service.js
const Habitacion = require('../models/Habitacion');

class HabitacionBuilderService {
  constructor() {
    this.habitacionesCreadas = new Map();
  }

  async construirHabitacion(configuracion) {
    const habitacionId = `hab_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    
    // Guardar en MongoDB
    const nuevaHabitacion = new Habitacion({
      habitacionId: habitacionId,
      expedienteId: configuracion.expedienteId,
      nombre: configuracion.nombre || `Habitación ${habitacionId}`,
      tipo: configuracion.tipo || 'aislamiento',
      estado: 'activa',
      configuracion: {
        namespaceId: `ns-expediente-${configuracion.expedienteId}`,
        ipInterna: `10.0.${configuracion.expedienteId}.1`,
        vethHostId: `veth-host-${configuracion.expedienteId}`,
        vethNsId: `veth-ns-${configuracion.expedienteId}`
      },
      historialAcciones: [{
        accion: 'creacion',
        detalles: configuracion
      }]
    });
    
    await nuevaHabitacion.save();
    
    // También mantener en memoria para acceso rápido
    this.habitacionesCreadas.set(habitacionId, nuevaHabitacion);
    
    return { 
      success: true, 
      habitacion: {
        id: habitacionId,
        nombre: nuevaHabitacion.nombre,
        tipo: nuevaHabitacion.tipo,
        estado: nuevaHabitacion.estado,
        fechaCreacion: nuevaHabitacion.fechaCreacion,
        configuracion: nuevaHabitacion.configuracion
      }
    };
  }

  async listarHabitaciones() {
    // Buscar en MongoDB solo habitaciones activas
    const habitaciones = await Habitacion.find({ estado: 'activa' })
      .populate('expedienteId', 'nombre')
      .sort({ fechaCreacion: -1 });
    
    return habitaciones.map(h => ({
      id: h.habitacionId,
      nombre: h.nombre,
      tipo: h.tipo,
      estado: h.estado,
      fechaCreacion: h.fechaCreacion,
      configuracion: h.configuracion,
      expediente: h.expedienteId
    }));
  }

  async obtenerHabitacion(habitacionId) {
    return await Habitacion.findOne({ habitacionId: habitacionId })
      .populate('expedienteId', 'nombre');
  }

  async eliminarHabitacion(habitacionId) {
    // Marcar como destruida en MongoDB
    const habitacion = await Habitacion.findOne({ habitacionId: habitacionId });
    
    if (habitacion) {
      habitacion.estado = 'destruida';
      habitacion.fechaDestruccion = new Date();
      habitacion.historialAcciones.push({
        accion: 'destruccion',
        fecha: new Date()
      });
      await habitacion.save();
    }
    
    // Eliminar de memoria
    this.habitacionesCreadas.delete(habitacionId);
    
    return { success: true, mensaje: 'Habitación destruida' };
  }
}

module.exports = HabitacionBuilderService;
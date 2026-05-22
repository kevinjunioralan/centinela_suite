const RobotConfig = require('./models/RobotConfig');
const RobotExecutor = require('./RobotExecutor');

// 🔥 IMPORTAR SERVICIO DE AUDITORÍA
const AuditoriaService = require('../auditoria/AuditoriaService');
const auditoria = new AuditoriaService();

class RobotManager {
  constructor() {
    this.robotsActivos = new Map(); // id -> { executor, intervalId }
  }

  async listarRobots() {
    return await RobotConfig.find().sort({ creado: -1 });
  }

  async crearRobot(data) {
    const robot = new RobotConfig({
      nombre: data.nombre,
      descripcion: data.descripcion || '',
      servidor: {
        ip: data.ip,
        puerto: data.puerto || 22,
        usuario: data.usuario,
        password: data.password,
        hostname: data.hostname || null
      },
      configuracion: {
        intervalo: data.intervalo || 30000,
        maxCiclos: data.maxCiclos || 0,
        acciones: {
          crearExpediente: data.acciones?.crearExpediente !== false,
          crearHabitacion: data.acciones?.crearHabitacion !== false,
          cerrarPuerta: data.acciones?.cerrarPuerta !== false,
          ejecutarDiagnostico: data.acciones?.ejecutarDiagnostico !== false,
          destruirHabitacion: data.acciones?.destruirHabitacion !== false
        }
      }
    });
    
    await robot.save();
    return robot;
  }

  async actualizarRobot(id, data) {
    const robot = await RobotConfig.findById(id);
    if (!robot) throw new Error('Robot no encontrado');
    
    if (robot.activo) {
      await this.detenerRobot(id);
    }
    
    robot.nombre = data.nombre || robot.nombre;
    robot.descripcion = data.descripcion || robot.descripcion;
    robot.servidor = {
      ip: data.ip || robot.servidor.ip,
      puerto: data.puerto || robot.servidor.puerto,
      usuario: data.usuario || robot.servidor.usuario,
      password: data.password || robot.servidor.password,
      hostname: data.hostname || robot.servidor.hostname
    };
    robot.configuracion = {
      intervalo: data.intervalo || robot.configuracion.intervalo,
      maxCiclos: data.maxCiclos !== undefined ? data.maxCiclos : robot.configuracion.maxCiclos,
      acciones: {
        crearExpediente: data.acciones?.crearExpediente !== undefined ? data.acciones.crearExpediente : robot.configuracion.acciones.crearExpediente,
        crearHabitacion: data.acciones?.crearHabitacion !== undefined ? data.acciones.crearHabitacion : robot.configuracion.acciones.crearHabitacion,
        cerrarPuerta: data.acciones?.cerrarPuerta !== undefined ? data.acciones.cerrarPuerta : robot.configuracion.acciones.cerrarPuerta,
        ejecutarDiagnostico: data.acciones?.ejecutarDiagnostico !== undefined ? data.acciones.ejecutarDiagnostico : robot.configuracion.acciones.ejecutarDiagnostico,
        destruirHabitacion: data.acciones?.destruirHabitacion !== undefined ? data.acciones.destruirHabitacion : robot.configuracion.acciones.destruirHabitacion
      }
    };
    robot.actualizado = new Date();
    
    await robot.save();
    return robot;
  }

  async eliminarRobot(id) {
    const robot = await RobotConfig.findById(id);
    if (!robot) throw new Error('Robot no encontrado');
    
    if (robot.activo) {
      await this.detenerRobot(id);
    }
    
    await RobotConfig.findByIdAndDelete(id);
    return { success: true };
  }

  // 🔥 MÉTODO INICIAR ROBOT
  async iniciarRobot(id) {
  console.log(`🔧 [RobotManager] Iniciando robot ${id}`);
  
  try {
    const robot = await RobotConfig.findById(id);
    console.log(`🔧 [RobotManager] Robot encontrado:`, robot?.nombre);
    
    if (!robot) throw new Error('Robot no encontrado');
    
    if (this.robotsActivos.has(id.toString())) {
      throw new Error('Robot ya está activo');
    }
    
    robot.activo = true;
    await robot.save();
    console.log(`✅ [RobotManager] Robot guardado como activo`);
    
    const executor = new RobotExecutor(robot);
    console.log(`✅ [RobotManager] Executor creado`);
    
    const intervalId = await executor.iniciar();
    console.log(`✅ [RobotManager] Executor iniciado, intervalId: ${intervalId}`);
    
    this.robotsActivos.set(id.toString(), { executor, intervalId });
    
    return { success: true, mensaje: 'Robot iniciado' };
  } catch (error) {
    console.error(`❌ [RobotManager] Error:`, error.message);
    console.error(error.stack);
    throw error;
  }
}

  // 🔥 MÉTODO DETENER ROBOT
  async detenerRobot(id) {
    const robot = await RobotConfig.findById(id);
    if (!robot) throw new Error('Robot no encontrado');
    
    const activo = this.robotsActivos.get(id.toString());
    if (activo) {
      if (activo.executor) {
        activo.executor.detener();
      }
      if (activo.intervalId) {
        clearInterval(activo.intervalId);
      }
      this.robotsActivos.delete(id.toString());
    }
    
    robot.activo = false;
    await robot.save();
    
    return { success: true, mensaje: 'Robot detenido' };
  }

  async obtenerEstado(id) {
    const robot = await RobotConfig.findById(id);
    if (!robot) throw new Error('Robot no encontrado');
    
    const activo = this.robotsActivos.has(id.toString());
    
    return {
      id: robot._id,
      nombre: robot.nombre,
      activo,
      estadisticas: robot.estadisticas,
      servidor: {
        ip: robot.servidor.ip,
        puerto: robot.servidor.puerto,
        usuario: robot.servidor.usuario
      }
    };
  }

  async obtenerTodosEstados() {
    const robots = await this.listarRobots();
    const estados = [];
    
    for (const robot of robots) {
      estados.push({
        id: robot._id,
        nombre: robot.nombre,
        activo: this.robotsActivos.has(robot._id.toString()),
        estadisticas: robot.estadisticas,
        servidor: {
          ip: robot.servidor.ip,
          puerto: robot.servidor.puerto,
          usuario: robot.servidor.usuario
        }
      });
    }
    
    return estados;
  }

  async actualizarEstadisticas(id, nuevasEstadisticas) {
    const robot = await RobotConfig.findById(id);
    if (robot) {
      robot.estadisticas = { ...robot.estadisticas, ...nuevasEstadisticas };
      await robot.save();
    }
  }
}

module.exports = RobotManager;
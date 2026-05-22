// RobotExecutor.js - Ejecutor de ciclos de robot
const ExpedienteService = require('../expediente/ExpedienteService/ExpedienteService');
const ExpedienteRepository = require('../expediente/ExpedienteRepository/ExpedienteRepository');
const Habitacion = require('../aislamiento/models/Habitacion');
const Expediente = require('../expediente/models/Expediente');
const SSHManager = require('../ssh/SSHManager/SSHManager');
const DiagnosticoService = require('../diagnostico/DiagnosticoService');

// 🔥 IMPORTAR SERVICIO DE AUDITORÍA
const AuditoriaService = require('../auditoria/AuditoriaService');
const auditoria = new AuditoriaService();

class RobotExecutor {
  constructor(robotConfig) {
    this.robotConfig = robotConfig;
    this.expedienteService = new ExpedienteService();
    this.expedienteRepository = new ExpedienteRepository();
    this.expedienteService.setRepository(this.expedienteRepository);
    this.sshManager = new SSHManager();
    this.diagnosticoService = new DiagnosticoService(this.sshManager);
    this.activo = false;
    this.ciclosCompletados = 0;
  }

  async ejecutarCiclo() {
    const robotId = this.robotConfig._id;
    console.log(`🤖 [Robot ${this.robotConfig.nombre}] Iniciando ciclo...`);
    
    try {
      // 1. Crear expediente
      let expediente = null;
      if (this.robotConfig.configuracion.acciones.crearExpediente) {
        const expedienteData = {
          nombre: `${this.robotConfig.nombre} - Ciclo ${this.ciclosCompletados + 1}`,
          descripcion: `Creado automáticamente por robot ${this.robotConfig.nombre}`,
          servidor: this.robotConfig.servidor,
          origen: 'robot',
          creadoPor: 'robot',
          robotId: this.robotConfig._id
        };
        expediente = await this.expedienteService.createExpediente(expedienteData);
        console.log(`📋 [Robot ${this.robotConfig.nombre}] Expediente creado: ${expediente.nombre}`);
      } else {
        throw new Error('Creación de expediente deshabilitada');
      }
      
      // 2. Crear habitación
      let habitacionId = null;
      if (this.robotConfig.configuracion.acciones.crearHabitacion) {
        habitacionId = `hab_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const nuevaHabitacion = new Habitacion({
          habitacionId: habitacionId,
          expedienteId: expediente._id,
          nombre: `Robot-${this.robotConfig.nombre}`,
          tipo: 'aislamiento',
          estado: 'activa',
          configuracion: {
            namespaceId: `ns-expediente-${expediente._id}`,
            ipInterna: `10.0.${expediente._id}.1`
          },
          historialAcciones: [{
            accion: 'creacion_robot',
            fecha: new Date(),
            detalles: { origen: 'robot', robotNombre: this.robotConfig.nombre }
          }]
        });
        await nuevaHabitacion.save();
        console.log(`🚪 [Robot ${this.robotConfig.nombre}] Habitación creada: ${habitacionId}`);
      }
      
      // 3. Actualizar expediente
      await Expediente.findByIdAndUpdate(expediente._id, {
        estado: 'en_cuarentena',
        habitacionId: habitacionId,
        fechaAsignacion: new Date()
      });
      
      // 4. Cerrar puerta (SSH)
      let sshResult = null;
      if (this.robotConfig.configuracion.acciones.cerrarPuerta) {
        sshResult = await this.sshManager.iniciarSesion(
          expediente._id.toString(),
          `ns-expediente-${expediente._id}`,
          this.robotConfig.servidor.ip,
          this.robotConfig.servidor.usuario,
          this.robotConfig.servidor.puerto,
          this.robotConfig.servidor.password
        );
        
        if (!sshResult.success) {
          throw new Error(`Error SSH: ${sshResult.error}`);
        }
        console.log(`🔐 [Robot ${this.robotConfig.nombre}] Conexión SSH establecida`);
      }
      
      // 5. Ejecutar diagnóstico
      let diagnostico = null;
      if (this.robotConfig.configuracion.acciones.ejecutarDiagnostico) {
        diagnostico = await this.diagnosticoService.ejecutarDiagnostico(expediente._id.toString());
        await Expediente.findByIdAndUpdate(expediente._id, { diagnostico });
        console.log(`🔬 [Robot ${this.robotConfig.nombre}] Diagnóstico completado. Score: ${diagnostico.score}%`);
      }
      
      // 6. Esperar
      await this.sleep(2000);
      
      // 7. Cerrar SSH
      await this.sshManager.cerrarSesion(expediente._id.toString());
      
      // 8. Destruir habitación
      if (this.robotConfig.configuracion.acciones.destruirHabitacion && habitacionId) {
        await Habitacion.findOneAndUpdate(
          { habitacionId: habitacionId },
          { estado: 'destruida', fechaDestruccion: new Date() }
        );
        console.log(`💥 [Robot ${this.robotConfig.nombre}] Habitación destruida`);
      }
      
      // 9. Liberar expediente
      await Expediente.findByIdAndUpdate(expediente._id, {
        estado: 'diagnosticado',
        habitacionId: null,
        fechaLiberacion: new Date()
      });
      
      // Actualizar estadísticas
      this.ciclosCompletados++;
      const nuevasEstadisticas = {
        totalCiclos: (this.robotConfig.estadisticas.totalCiclos || 0) + 1,
        exitosos: (this.robotConfig.estadisticas.exitosos || 0) + 1,
        ultimoCiclo: new Date(),
        scorePromedio: diagnostico ? 
          ((this.robotConfig.estadisticas.scorePromedio || 0) + diagnostico.score) / 2 : 
          this.robotConfig.estadisticas.scorePromedio || 0
      };
      
      await this.actualizarEstadisticas(nuevasEstadisticas);
      
      console.log(`✅ [Robot ${this.robotConfig.nombre}] Ciclo completado. Score: ${diagnostico?.score || 'N/A'}%`);
      
      // 🔥 REGISTRAR EVENTO DE RESULTADO DE SIMULACIÓN
      try {
        await auditoria.registrarEvento(
          'resultado_simulacion_robot',
          'sistema',
          { 
            modulo: 'robot',
            expedienteId: expediente?._id || null,
            detalles: { 
              robotId: this.robotConfig._id,
              robotNombre: this.robotConfig.nombre,
              cicloNumero: this.ciclosCompletados + 1,
              duracionCiclo: '2 segundos',
              score: diagnostico?.score || null,
              accionesCompletadas: 6,
              estado: 'exitoso'
            }
          }
        );
      } catch (auditErr) {
        console.warn('⚠️ Error registrando auditoría de resultado robot:', auditErr.message);
      }
      
      return { success: true, score: diagnostico?.score };
      
    } catch (error) {
      console.error(`❌ [Robot ${this.robotConfig.nombre}] Error en ciclo:`, error.message);
      
      // 🔥 REGISTRAR EVENTO DE ERROR DE SIMULACIÓN
      try {
        await auditoria.registrarEvento(
          'error_simulacion_robot',
          'sistema',
          { 
            modulo: 'robot',
            expedienteId: expediente?._id || null,
            detalles: { 
              robotId: this.robotConfig._id,
              robotNombre: this.robotConfig.nombre,
              cicloNumero: this.ciclosCompletados + 1,
              error: error.message,
              paso: 'ejecucion_ciclo',
              estado: 'fallido'
            }
          }
        );
      } catch (auditErr) {
        console.warn('⚠️ Error registrando auditoría de error robot:', auditErr.message);
      }
      
      const nuevasEstadisticas = {
        totalCiclos: (this.robotConfig.estadisticas.totalCiclos || 0) + 1,
        fallidos: (this.robotConfig.estadisticas.fallidos || 0) + 1,
        ultimoCiclo: new Date(),
        ultimoError: error.message
      };
      
      await this.actualizarEstadisticas(nuevasEstadisticas);
      
      return { success: false, error: error.message };
    }
  }

  async actualizarEstadisticas(nuevasEstadisticas) {
    const RobotConfig = require('./models/RobotConfig');
    await RobotConfig.findByIdAndUpdate(this.robotConfig._id, {
      estadisticas: nuevasEstadisticas
    });
    this.robotConfig.estadisticas = nuevasEstadisticas;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

 async iniciar() {
  console.log(`🤖 [RobotExecutor] Iniciando ejecutor para ${this.robotConfig.nombre}`);
  this.activo = true;
  this.ciclosCompletados = this.robotConfig.estadisticas.totalCiclos || 0;
  
  const maxCiclos = this.robotConfig.configuracion.maxCiclos;
  const intervalo = this.robotConfig.configuracion.intervalo;
  
  console.log(`🤖 [RobotExecutor] Configuración: maxCiclos=${maxCiclos}, intervalo=${intervalo}`);
  
  const ejecutar = async () => {
    if (!this.activo) return;
    
    if (maxCiclos > 0 && this.ciclosCompletados >= maxCiclos) {
      console.log(`🤖 [RobotExecutor] Máximo de ciclos alcanzado (${maxCiclos})`);
      this.activo = false;
      return;
    }
    
    await this.ejecutarCiclo();
    
    if (this.activo) {
      setTimeout(ejecutar, intervalo);
    }
  };
  
  setTimeout(ejecutar, 0);
  
  return setInterval(() => {}, 1000);
}
}

module.exports = RobotExecutor;
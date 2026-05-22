// RobotService.js - Robot automático de pruebas
const ExpedienteService = require('../expediente/expediente.service');
const ExpedienteRepository = require('../expediente/expediente.repository');
const Habitacion = require('../aislamiento/models/Habitacion');
const Expediente = require('../expediente/models/Expediente');
const SSHManager = require('../ssh/SSHManager/SSHManager');

class RobotService {
  constructor() {
    this.expedienteService = new ExpedienteService();
    this.expedienteRepository = new ExpedienteRepository();
    this.expedienteService.setRepository(this.expedienteRepository);
    this.sshManager = new SSHManager();
    this.activo = false;
    this.estadisticas = {
      total: 0,
      exitosos: 0,
      fallidos: 0,
      ultimoCiclo: null
    };
  }

  getRandomNombre() {
    const nombres = [
      'Servidor Web', 'Base de Datos', 'Servidor Mail', 'Servidor DNS',
      'Servidor FTP', 'Servidor Proxy', 'Servidor Backup', 'Servidor Monitor',
      'Servidor Test', 'Servidor Desarrollo', 'Servidor Producción', 'Servidor QA'
    ];
    const adjetivos = [
      'Rápido', 'Seguro', 'Estable', 'Nuevo', 'Antiguo', 'Crítico', 'Secundario'
    ];
    const randNom = nombres[Math.floor(Math.random() * nombres.length)];
    const randAdj = adjetivos[Math.floor(Math.random() * adjetivos.length)];
    return `${randAdj} ${randNom} ${Math.floor(Math.random() * 1000)}`;
  }

  getRandomIp() {
    const ipsReales = ['192.168.1.142'];  // Metasploitable
    return ipsReales[Math.floor(Math.random() * ipsReales.length)];
  }

  async ejecutarCiclo() {
    try {
      console.log('🤖 [ROBOT] Iniciando nuevo ciclo...');
      
      const expedienteData = {
        nombre: this.getRandomNombre(),
        descripcion: `Creado automáticamente por Robot el ${new Date().toLocaleString()}`,
        servidor: {
          ip: this.getRandomIp(),
          puerto: 22,
          usuario: 'msfadmin',
          password: 'msfadmin',
          hostname: null
        }
      };
      
      console.log(`📋 [ROBOT] Creando expediente: ${expedienteData.nombre}`);
      const expediente = await this.expedienteService.createExpediente(expedienteData);
      
      const habitacionId = `hab_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      const nuevaHabitacion = new Habitacion({
        habitacionId: habitacionId,
        expedienteId: expediente._id,
        nombre: `Robot-${expediente.nombre}`,
        tipo: 'aislamiento',
        estado: 'activa',
        configuracion: {
          namespaceId: `ns-expediente-${expediente._id}`,
          ipInterna: `10.0.${expediente._id}.1`,
        },
        historialAcciones: [{
          accion: 'creacion_robot',
          fecha: new Date(),
          detalles: { origen: 'Robot' }
        }]
      });
      
      await nuevaHabitacion.save();
      console.log(`🚪 [ROBOT] Habitación creada: ${habitacionId}`);
      
      await Expediente.findByIdAndUpdate(expediente._id, {
        estado: 'en_cuarentena',
        habitacionId: habitacionId,
        fechaAsignacion: new Date()
      });
      
      console.log(`🔐 [ROBOT] Conectando SSH a ${expedienteData.servidor.ip}...`);
      const sshResult = await this.sshManager.iniciarSesion(
        expediente._id.toString(),
        `ns-expediente-${expediente._id}`,
        expedienteData.servidor.ip,
        expedienteData.servidor.usuario,
        expedienteData.servidor.puerto,
        expedienteData.servidor.password
      );
      
      if (!sshResult.success) {
        throw new Error(`Error SSH: ${sshResult.error}`);
      }
      
      console.log(`🔬 [ROBOT] Ejecutando diagnóstico...`);
      const DiagnosticoService = require('../diagnostico/DiagnosticoService');
      const diagnosticoService = new DiagnosticoService(this.sshManager);
      const diagnostico = await diagnosticoService.ejecutarDiagnostico(expediente._id.toString());
      
      await Expediente.findByIdAndUpdate(expediente._id, { diagnostico });
      
      await this.sleep(3000);
      await this.sshManager.cerrarSesion(expediente._id.toString());
      
      await Habitacion.findOneAndUpdate(
        { habitacionId: habitacionId },
        { estado: 'destruida', fechaDestruccion: new Date() }
      );
      
      await Expediente.findByIdAndUpdate(expediente._id, {
        estado: 'diagnosticado',
        habitacionId: null,
        fechaLiberacion: new Date()
      });
      
      console.log(`✅ [ROBOT] Ciclo completado. Score: ${diagnostico.score}%`);
      
      this.estadisticas.total++;
      this.estadisticas.exitosos++;
      this.estadisticas.ultimoCiclo = new Date();
      
      return { success: true, expediente, score: diagnostico.score };
      
    } catch (error) {
      console.error('❌ [ROBOT] Error en ciclo:', error);
      this.estadisticas.total++;
      this.estadisticas.fallidos++;
      return { success: false, error: error.message };
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async iniciar(intervaloMs = 30000, maxCiclos = null) {
    if (this.activo) {
      console.log('🤖 [ROBOT] Ya está en ejecución');
      return;
    }
    
    this.activo = true;
    let ciclos = 0;
    
    console.log(`🤖 [ROBOT] Iniciando robot. Intervalo: ${intervaloMs}ms`);
    
    while (this.activo && (maxCiclos === null || ciclos < maxCiclos)) {
      await this.ejecutarCiclo();
      ciclos++;
      
      if (this.activo && (maxCiclos === null || ciclos < maxCiclos)) {
        console.log(`⏳ [ROBOT] Esperando ${intervaloMs}ms para próximo ciclo...`);
        await this.sleep(intervaloMs);
      }
    }
    
    this.activo = false;
    console.log(`🤖 [ROBOT] Detenido. Total ciclos: ${ciclos}`);
  }

  detener() {
    this.activo = false;
    console.log('🤖 [ROBOT] Deteniendo...');
  }

  getEstadisticas() {
    return this.estadisticas;
  }
}

module.exports = RobotService;
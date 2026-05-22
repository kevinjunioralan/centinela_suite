// backend/src/scheduler/NocturnoScheduler.js
const RobotSimulacionService = require('../robot/RobotSimulacionService');
const EventoAuditoria = require('../auditoria/models/EventoAuditoria');

class NocturnoScheduler {
  constructor() {
    this.robotSimulacion = new RobotSimulacionService();
    this.simulacionNocturnaId = null;
    this.activo = false;
    this.configuracionNocturna = null;
  }
  
  async iniciar(configuracion = {}) {
    this.configuracionNocturna = {
      servidor: {
        ip: configuracion.servidorIp || process.env.SERVIDOR_PRUEBAS_IP,
        usuario: configuracion.servidorUsuario || process.env.SERVIDOR_PRUEBAS_USUARIO,
        password: configuracion.servidorPassword || process.env.SERVIDOR_PRUEBAS_PASSWORD
      },
      pack: configuracion.pack || 'pack_web',
      intensidad: configuracion.intensidad || 'media',
      fallosActivos: configuracion.fallosActivos !== false,
      horaInicio: configuracion.horaInicio || 20, // 20:00
      horaFin: configuracion.horaFin || 8,        // 08:00
      duracionTotal: configuracion.duracionTotal || 43200 // 12 horas
    };
    
    console.log('🌙 [SCHEDULER] Programador nocturno iniciado');
    console.log(`   Hora inicio: ${this.configuracionNocturna.horaInicio}:00`);
    console.log(`   Hora fin: ${this.configuracionNocturna.horaFin}:00`);
    console.log(`   Pack: ${this.configuracionNocturna.pack}`);
    console.log(`   Intensidad: ${this.configuracionNocturna.intensidad}`);
    
    this.programarInicio();
    
    // Verificar cada hora
    setInterval(() => {
      this.verificarYEjecutar();
    }, 3600000);
  }
  
  programarInicio() {
    const ahora = new Date();
    const inicioNoche = new Date();
    inicioNoche.setHours(this.configuracionNocturna.horaInicio, 0, 0, 0);
    
    if (ahora >= inicioNoche) {
      inicioNoche.setDate(inicioNoche.getDate() + 1);
    }
    
    const msHastaInicio = inicioNoche - ahora;
    
    setTimeout(() => {
      this.iniciarSimulacionNocturna();
    }, msHastaInicio);
    
    console.log(`🌙 [SCHEDULER] Próxima simulación nocturna: ${inicioNoche.toLocaleString()}`);
  }
  
  async iniciarSimulacionNocturna() {
    if (this.activo) {
      console.log('🌙 [SCHEDULER] Ya hay una simulación nocturna activa');
      return;
    }
    
    console.log('🌙 [SCHEDULER] Iniciando simulación nocturna...');
    
    if (!this.configuracionNocturna.servidor?.ip) {
      console.error('❌ [SCHEDULER] No hay servidor configurado para simulaciones nocturnas');
      return;
    }
    
    const config = {
      servidor: this.configuracionNocturna.servidor,
      pack: this.configuracionNocturna.pack,
      duracion: this.configuracionNocturna.duracionTotal,
      intensidad: this.configuracionNocturna.intensidad,
      fallos: {
        activados: this.configuracionNocturna.fallosActivos,
        probabilidad: 0.35,
        tiposPermitidos: ['cpu_alta', 'memoria_alta', 'disco_lleno', 'caida_servicio']
      }
    };
    
    const resultado = await this.robotSimulacion.iniciarSimulacion(config);
    
    if (resultado.success) {
      this.simulacionNocturnaId = resultado.simulacionId;
      this.activo = true;
      
      await EventoAuditoria.create({
        tipo: 'simulacion_nocturna_iniciada',
        modulo: 'scheduler',
        usuario: 'sistema',
        detalles: {
          simulacionId: this.simulacionNocturnaId,
          config
        },
        fecha: new Date()
      });
      
      console.log(`🌙 [SCHEDULER] Simulación nocturna iniciada: ${this.simulacionNocturnaId}`);
      
      this.programarFin();
    } else {
      console.error('❌ [SCHEDULER] Error iniciando simulación nocturna:', resultado.error);
    }
  }
  
  programarFin() {
    const ahora = new Date();
    const finNoche = new Date();
    finNoche.setHours(this.configuracionNocturna.horaFin, 0, 0, 0);
    
    if (ahora >= finNoche) {
      finNoche.setDate(finNoche.getDate() + 1);
    }
    
    const msHastaFin = finNoche - ahora;
    
    setTimeout(() => {
      this.finalizarSimulacionNocturna();
    }, msHastaFin);
    
    console.log(`🌙 [SCHEDULER] Fin de simulación nocturna: ${finNoche.toLocaleString()}`);
  }
  
  async finalizarSimulacionNocturna() {
    if (!this.activo || !this.simulacionNocturnaId) {
      return;
    }
    
    console.log('🌙 [SCHEDULER] Finalizando simulación nocturna...');
    
    await this.robotSimulacion.detenerSimulacion(this.simulacionNocturnaId, 'completado');
    
    await EventoAuditoria.create({
      tipo: 'simulacion_nocturna_finalizada',
      modulo: 'scheduler',
      usuario: 'sistema',
      detalles: {
        simulacionId: this.simulacionNocturnaId
      },
      fecha: new Date()
    });
    
    await this.generarReporteMatutino();
    
    this.activo = false;
    this.simulacionNocturnaId = null;
    
    // Programar próxima noche
    this.programarInicio();
  }
  
  async generarReporteMatutino() {
    const estadisticas = await this.robotSimulacion.obtenerEstadisticas();
    
    const reporte = `
╔══════════════════════════════════════════════════════════════════╗
║                    📋 REPORTE MATUTINO                           ║
╠══════════════════════════════════════════════════════════════════╣
║  🌙 Noche de entrenamiento finalizada                           ║
║                                                                  ║
║  📊 ESTADÍSTICAS GENERALES:                                      ║
║     • Simulaciones completadas: ${estadisticas.completadas}                                    ║
║     • Métricas generadas: ${estadisticas.totalMetricasGeneradas}                                      ║
║     • Precisión general: ${estadisticas.precisionGeneral}                                        ║
║                                                                  ║
║  🎯 PRECISIÓN POR TIPO DE FALLO:                                 ║
${estadisticas.precisionPorFallo.map(f => 
      `║     • ${f._id}: ${f.detectados}/${f.count} (${(f.detectados/f.count*100).toFixed(1)}%)`
    ).join('\n')}
║                                                                  ║
║  🧠 EL ORÁCULO HA MEJORADO                                       ║
║  💪 SIGUE ENTRENANDO CADA DÍA                                    ║
╚══════════════════════════════════════════════════════════════════╝
    `;
    
    console.log(reporte);
    
    // Aquí se puede enviar email, notificación, etc.
    return { reporte, estadisticas };
  }
  
  async verificarYEjecutar() {
    const ahora = new Date();
    const horaActual = ahora.getHours();
    
    // Si es hora de inicio y no hay simulación activa
    if (horaActual === this.configuracionNocturna.horaInicio && !this.activo) {
      console.log('🌙 [SCHEDULER] Verificación: hora de inicio alcanzada');
      await this.iniciarSimulacionNocturna();
    }
    
    // Si es hora de fin y hay simulación activa
    if (horaActual === this.configuracionNocturna.horaFin && this.activo) {
      console.log('🌙 [SCHEDULER] Verificación: hora de fin alcanzada');
      await this.finalizarSimulacionNocturna();
    }
  }
  
  // Configuración dinámica
  async actualizarConfiguracion(config) {
    this.configuracionNocturna = {
      ...this.configuracionNocturna,
      ...config
    };
    
    console.log('🌙 [SCHEDULER] Configuración actualizada:', this.configuracionNocturna);
    
    return { success: true, configuracion: this.configuracionNocturna };
  }
  
  async obtenerEstado() {
    return {
      activo: this.activo,
      simulacionActivaId: this.simulacionNocturnaId,
      configuracion: this.configuracionNocturna,
      proximaInicio: this.calcularProximaInicio(),
      proximoFin: this.calcularProximoFin()
    };
  }
  
  calcularProximaInicio() {
    const ahora = new Date();
    const inicio = new Date();
    inicio.setHours(this.configuracionNocturna.horaInicio, 0, 0, 0);
    if (ahora >= inicio) inicio.setDate(inicio.getDate() + 1);
    return inicio;
  }
  
  calcularProximoFin() {
    if (!this.activo) return null;
    const fin = new Date();
    fin.setHours(this.configuracionNocturna.horaFin, 0, 0, 0);
    if (fin <= new Date()) fin.setDate(fin.getDate() + 1);
    return fin;
  }
}

module.exports = NocturnoScheduler;
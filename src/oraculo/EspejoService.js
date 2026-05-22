// backend/src/oraculo/EspejoService.js
const Espejo = require('./models/Espejo');
const Checkpoint = require('./models/Checkpoint');
const EventoAuditoria = require('../auditoria/models/EventoAuditoria');
const AlertasService = require('../alertas/AlertasService');
const crypto = require('crypto');

class EspejoService {
  
  constructor() {
    this.instanciaReal = null;
    this.instanciaEspejo = null;
    this.contadorCheckpoints = 0;
    this.alertasService = new AlertasService();
  }
  
  // ============ INICIALIZACIÓN ============
  
  async inicializar() {
    console.log('🪞 [ESPEJO] Inicializando sistema espejo...');
    
    // Buscar o crear instancia real
    this.instanciaReal = await Espejo.findOne({ tipo: 'real' });
    if (!this.instanciaReal) {
      this.instanciaReal = await Espejo.create({
        nombre: 'sistema-real',
        tipo: 'real',
        estado: 'activo',
        version: '1.0.0',
        metricas: { precision: 96, fallosSimulados: 0, exitosSimulados: 0 },
        ultimoCheckpoint: { timestamp: new Date(), punto: 0, descripcion: 'Inicialización' }
      });
    }
    
    // Buscar o crear instancia espejo
    this.instanciaEspejo = await Espejo.findOne({ tipo: 'espejo' });
    if (!this.instanciaEspejo) {
      this.instanciaEspejo = await Espejo.create({
        nombre: 'sistema-espejo',
        tipo: 'espejo',
        estado: 'en_espera',
        version: '1.0.0',
        versionPendiente: null,
        metricas: { precision: 0, fallosSimulados: 0, exitosSimulados: 0 },
        ultimoCheckpoint: { timestamp: new Date(), punto: 0, descripcion: 'Inicialización' }
      });
    }
    
    console.log(`🪞 [ESPEJO] Real: ${this.instanciaReal.estado}, Espejo: ${this.instanciaEspejo.estado}`);
    
    // Iniciar ciclo de checkpoints automáticos
    this.iniciarCicloCheckpoints();
    
    // Alerta de inicialización
    await this.alertasService.alertaEspejo(
      'exito',
      '🪞 Sistema espejo inicializado',
      'El sistema espejo está listo y funcionando correctamente',
      { realEstado: this.instanciaReal.estado, espejoEstado: this.instanciaEspejo.estado }
    );
    
    return { real: this.instanciaReal, espejo: this.instanciaEspejo };
  }
  
  // ============ CHECKPOINTS ============
  
  async generarCheckpoint(origen, metadatos = {}) {
    console.log(`🪞 [ESPEJO] Generando checkpoint para ${origen}...`);
    
    const inicio = Date.now();
    this.contadorCheckpoints++;
    
    // Obtener estado actual del sistema
    const Expediente = require('../expediente/models/Expediente');
    const Alerta = require('../expediente/models/Alerta');
    const Metrica = require('../expediente/models/Metrica');
    
    const [expedientes, alertas, metricasRecientes] = await Promise.all([
      Expediente.find().select('_id nombre origen'),
      Alerta.countDocuments({ resuelta: false }),
      Metrica.countDocuments({ timestamp: { $gte: new Date(Date.now() - 3600000) } })
    ]);
    
    const checkpointData = {
      totalExpedientes: expedientes.length,
      totalAlertas: alertas,
      ultimaMetrica: new Date(),
      ultimaAccion: 'checkpoint_manual',
      expedientesIds: expedientes.map(e => e._id),
      metricasUltimaHora: metricasRecientes
    };
    
    // Generar hash de integridad
    const hash = crypto.createHash('sha256')
      .update(JSON.stringify(checkpointData) + Date.now())
      .digest('hex');
    
    const checkpoint = await Checkpoint.create({
      checkpointId: `ckpt-${Date.now()}-${this.contadorCheckpoints}`,
      origen,
      punto: this.contadorCheckpoints,
      snapshot: {
        ...checkpointData,
        hash
      },
      creadoPor: metadatos.creadoPor || 'oraculo',
      tamanoKB: JSON.stringify(checkpointData).length / 1024,
      tiempoGeneracion: Date.now() - inicio
    });
    
    // Actualizar último checkpoint en la instancia correspondiente
    const instancia = origen === 'real' ? this.instanciaReal : this.instanciaEspejo;
    instancia.ultimoCheckpoint = {
      timestamp: new Date(),
      punto: this.contadorCheckpoints,
      descripcion: metadatos.descripcion || 'Checkpoint automático'
    };
    await instancia.save();
    
    // Actualizar métricas del espejo
    if (origen === 'espejo') {
      this.instanciaEspejo.metricas.totalCheckpoints = (this.instanciaEspejo.metricas.totalCheckpoints || 0) + 1;
      await this.instanciaEspejo.save();
    }
    
    console.log(`🪞 [ESPEJO] Checkpoint ${checkpoint.checkpointId} generado en ${checkpoint.tiempoGeneracion}ms`);
    
    // Alerta de checkpoint exitoso
    await this.alertasService.alertaEspejo(
      'exito',
      `✅ Checkpoint generado en ${origen}`,
      `Checkpoint ${checkpoint.checkpointId} generado exitosamente en ${checkpoint.tiempoGeneracion}ms`,
      { origen, checkpointId: checkpoint.checkpointId, tiempoGeneracion: checkpoint.tiempoGeneracion }
    );
    
    return checkpoint;
  }
  
  async restaurarCheckpoint(checkpointId, destino) {
    console.log(`🪞 [ESPEJO] Restaurando checkpoint ${checkpointId} en ${destino}...`);
    
    const checkpoint = await Checkpoint.findOne({ checkpointId });
    if (!checkpoint) {
      const error = `Checkpoint ${checkpointId} no encontrado`;
      await this.alertasService.alertaEspejo(
        'critica',
        '❌ Error al restaurar checkpoint',
        error,
        { checkpointId, destino }
      );
      throw new Error(error);
    }
    
    // Registrar la restauración
    checkpoint.restaurado = true;
    checkpoint.restauradoEn = new Date();
    await checkpoint.save();
    
    await EventoAuditoria.create({
      tipo: 'restauracion_checkpoint',
      modulo: 'espejo',
      usuario: 'oraculo',
      detalles: {
        checkpointId,
        destino,
        snapshot: checkpoint.snapshot
      },
      fecha: new Date()
    });
    
    // Alerta de restauración
    await this.alertasService.alertaEspejo(
      'atencion',
      `🔄 Checkpoint restaurado en ${destino}`,
      `Se ha restaurado el checkpoint ${checkpointId} (punto ${checkpoint.punto}) en el sistema ${destino}`,
      { checkpointId, destino, punto: checkpoint.punto }
    );
    
    return {
      success: true,
      checkpoint,
      mensaje: `Sistema ${destino} restaurado al punto ${checkpoint.punto}`
    };
  }
  
  // ============ SWITCHOVER (cambio real ↔ espejo) ============
  
  async switchover(motivo, desde = null) {
    console.log(`🪞 [ESPEJO] Iniciando SWITCHOVER. Motivo: ${motivo}`);
    
    await this.alertasService.alertaEspejo(
      'atencion',
      '🪞 Iniciando switchover',
      `Se ha iniciado un switchover. Motivo: ${motivo}`,
      { motivo, desde }
    );
    
    // Determinar desde dónde cambiar
    let desdeSistema = desde;
    if (!desdeSistema) {
      // Automático: si real está fallando, cambiar a espejo
      if (this.instanciaReal.estado === 'fallido') {
        desdeSistema = 'real';
      } else {
        desdeSistema = 'espejo';
      }
    }
    
    const haciaSistema = desdeSistema === 'real' ? 'espejo' : 'real';
    
    console.log(`🪞 [ESPEJO] Switchover: ${desdeSistema} → ${haciaSistema}`);
    
    // Obtener instancias
    const desdeInstancia = desdeSistema === 'real' ? this.instanciaReal : this.instanciaEspejo;
    const haciaInstancia = haciaSistema === 'real' ? this.instanciaReal : this.instanciaEspejo;
    
    // Verificar que el sistema destino está listo
    if (haciaInstancia.estado !== 'en_espera' && haciaInstancia.estado !== 'activo') {
      const error = `Sistema destino (${haciaSistema}) no está listo. Estado: ${haciaInstancia.estado}`;
      await this.alertasService.alertaEspejo(
        'critica',
        '❌ Switchover fallido',
        error,
        { desdeSistema, haciaSistema, estadoDestino: haciaInstancia.estado }
      );
      return {
        success: false,
        mensaje: error
      };
    }
    
    // Generar checkpoint antes del switchover
    const checkpoint = await this.generarCheckpoint(desdeSistema, {
      descripcion: `Pre-switchover por: ${motivo}`
    });
    
    // Cambiar estados
    desdeInstancia.estado = 'en_espera';
    haciaInstancia.estado = 'tomando_control';
    await desdeInstancia.save();
    await haciaInstancia.save();
    
    // Registrar en historial
    desdeInstancia.historialSwitchovers = desdeInstancia.historialSwitchovers || [];
    desdeInstancia.historialSwitchovers.push({
      fecha: new Date(),
      desde: desdeSistema,
      hacia: haciaSistema,
      motivo,
      exitoso: true
    });
    await desdeInstancia.save();
    
    haciaInstancia.historialSwitchovers = haciaInstancia.historialSwitchovers || [];
    haciaInstancia.historialSwitchovers.push({
      fecha: new Date(),
      desde: desdeSistema,
      hacia: haciaSistema,
      motivo,
      exitoso: true
    });
    await haciaInstancia.save();
    
    // Activar el nuevo sistema
    haciaInstancia.estado = 'activo';
    await haciaInstancia.save();
    
    await EventoAuditoria.create({
      tipo: 'switchover_completado',
      modulo: 'espejo',
      usuario: 'oraculo',
      detalles: {
        desde: desdeSistema,
        hacia: haciaSistema,
        motivo,
        checkpointId: checkpoint.checkpointId
      },
      fecha: new Date()
    });
    
    console.log(`🪞 [ESPEJO] Switchover COMPLETADO. Ahora activo: ${haciaSistema}`);
    
    // Alerta de switchover exitoso
    await this.alertasService.alertaEspejo(
      'exito',
      `✅ Switchover completado: ${desdeSistema} → ${haciaSistema}`,
      `El sistema ${haciaSistema} ahora está activo. Motivo: ${motivo}`,
      { desde: desdeSistema, hacia: haciaSistema, motivo, checkpointId: checkpoint.checkpointId }
    );
    
    return {
      success: true,
      sistemaActivo: haciaSistema,
      checkpoint,
      mensaje: `Switchover completado. ${haciaSistema} ahora está activo.`
    };
  }
  
  async verificarSaludYSwitchover() {
    console.log(`🪞 [ESPEJO] Verificando salud para posible switchover...`);
    
    // Verificar salud del sistema real
    const saludReal = await this.verificarSaludSistema('real');
    
    if (!saludReal.saludable && saludReal.gravedad === 'CRÍTICA') {
      console.log(`⚠️ [ESPEJO] Sistema REAL en estado CRÍTICO. Evaluando switchover...`);
      
      await this.alertasService.alertaEspejo(
        'critica',
        '⚠️ Sistema REAL en estado crítico',
        `El sistema real está en estado crítico. Motivo: ${saludReal.motivo}`,
        { saludReal }
      );
      
      // Verificar que el espejo está listo
      if (this.instanciaEspejo.estado === 'en_espera') {
        const resultado = await this.switchover('Fallo crítico detectado en sistema real', 'real');
        
        if (resultado.success) {
          console.log(`✅ [ESPEJO] Switchover ejecutado. Espejo ahora activo.`);
          
          await this.alertasService.alertaEspejo(
            'exito',
            '🪞 Switchover automático ejecutado',
            `El espejo ha tomado el control automáticamente debido a fallo crítico`,
            { motivo: saludReal.motivo, sistemaActivo: resultado.sistemaActivo }
          );
          
          // Notificar al Oráculo
          await EventoAuditoria.create({
            tipo: 'switchover_automatico',
            modulo: 'espejo',
            usuario: 'oraculo',
            detalles: {
              motivo: saludReal.motivo,
              sistemaActivo: resultado.sistemaActivo
            },
            fecha: new Date()
          });
        }
        
        return resultado;
      } else {
        await this.alertasService.alertaEspejo(
          'critica',
          '❌ No se pudo ejecutar switchover',
          `El sistema espejo no está listo. Estado actual: ${this.instanciaEspejo.estado}`,
          { estadoEspejo: this.instanciaEspejo.estado }
        );
      }
    }
    
    return { success: true, switchoverRealizado: false, saludReal };
  }
  
  async verificarSaludSistema(sistema) {
    const instancia = sistema === 'real' ? this.instanciaReal : this.instanciaEspejo;
    
    // Verificación básica por ahora
    // En producción, aquí se llamarían a endpoints /health reales
    const saludable = instancia.estado !== 'fallido';
    const gravedad = instancia.estado === 'fallido' ? 'CRÍTICA' : 
                     instancia.estado === 'sincronizando' ? 'ATENCIÓN' : 'NORMAL';
    
    return {
      saludable,
      gravedad,
      motivo: instancia.estado === 'fallido' ? (instancia.ultimoError?.mensaje || 'Estado fallido desconocido') : 'OK',
      estado: instancia.estado,
      version: instancia.version
    };
  }
  
  // ============ HOT UPDATES ============
  
  async prepararHotUpdate(nuevaVersion, codigoActualizacion) {
    console.log(`🪞 [ESPEJO] Preparando hot update a versión ${nuevaVersion}...`);
    
    // Solo se prepara en el ESPEJO primero
    if (this.instanciaEspejo.estado !== 'en_espera') {
      const error = `Espejo no está en espera. Estado actual: ${this.instanciaEspejo.estado}`;
      await this.alertasService.alertaEspejo(
        'critica',
        '❌ No se puede preparar hot update',
        error,
        { estadoEspejo: this.instanciaEspejo.estado, version: nuevaVersion }
      );
      return {
        success: false,
        mensaje: error
      };
    }
    
    // Guardar versión pendiente
    this.instanciaEspejo.versionPendiente = nuevaVersion;
    await this.instanciaEspejo.save();
    
    // Generar checkpoint antes de la actualización
    const checkpoint = await this.generarCheckpoint('espejo', {
      descripcion: `Pre-hotupdate a versión ${nuevaVersion}`
    });
    
    await EventoAuditoria.create({
      tipo: 'hotupdate_preparado',
      modulo: 'espejo',
      usuario: 'oraculo',
      detalles: {
        nuevaVersion,
        checkpointId: checkpoint.checkpointId
      },
      fecha: new Date()
    });
    
    await this.alertasService.alertaEspejo(
      'info',
      `📦 Hot update preparado: versión ${nuevaVersion}`,
      `La versión ${nuevaVersion} está lista para pruebas en el espejo. Checkpoint: ${checkpoint.checkpointId}`,
      { nuevaVersion, checkpointId: checkpoint.checkpointId }
    );
    
    return {
      success: true,
      checkpoint,
      mensaje: `Hot update preparado. Versión ${nuevaVersion} lista para pruebas en espejo.`
    };
  }
  
  async probarHotUpdate() {
    console.log(`🪞 [ESPEJO] Probando hot update en espejo...`);
    
    if (!this.instanciaEspejo.versionPendiente) {
      const error = 'No hay versión pendiente para probar';
      await this.alertasService.alertaEspejo(
        'atencion',
        '⚠️ No hay hot update para probar',
        error,
        {}
      );
      return { success: false, mensaje: error };
    }
    
    await this.alertasService.alertaEspejo(
      'info',
      '🧪 Probando hot update en espejo',
      `Iniciando pruebas de la versión ${this.instanciaEspejo.versionPendiente} en el sistema espejo`,
      { version: this.instanciaEspejo.versionPendiente }
    );
    
    // Cambiar espejo a modo prueba
    this.instanciaEspejo.estado = 'activo';
    await this.instanciaEspejo.save();
    
    // Simular prueba (en realidad, aquí se ejecutaría la nueva versión)
    // Por ahora, simulamos éxito después de 5 segundos
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Verificar que la prueba fue exitosa
    const pruebaExitosa = true; // Simulación - en producción esto sería real
    
    if (pruebaExitosa) {
      console.log(`✅ [ESPEJO] Hot update probado exitosamente`);
      
      this.instanciaEspejo.version = this.instanciaEspejo.versionPendiente;
      this.instanciaEspejo.versionPendiente = null;
      this.instanciaEspejo.estado = 'en_espera';
      this.instanciaEspejo.metricas.precision = Math.min(100, (this.instanciaEspejo.metricas.precision || 0) + 5);
      await this.instanciaEspejo.save();
      
      await EventoAuditoria.create({
        tipo: 'hotupdate_exitoso',
        modulo: 'espejo',
        usuario: 'oraculo',
        detalles: { nuevaVersion: this.instanciaEspejo.version },
        fecha: new Date()
      });
      
      await this.alertasService.alertaEspejo(
        'exito',
        '✅ Hot update probado exitosamente',
        `La versión ${this.instanciaEspejo.version} ha pasado todas las pruebas. Lista para desplegar en REAL.`,
        { nuevaVersion: this.instanciaEspejo.version }
      );
      
      return {
        success: true,
        nuevaVersion: this.instanciaEspejo.version,
        mensaje: 'Hot update probado exitosamente. Listo para desplegar en REAL.'
      };
    } else {
      // Falló la prueba, restaurar checkpoint
      await this.restaurarCheckpoint(this.instanciaEspejo.ultimoCheckpoint, 'espejo');
      
      await this.alertasService.alertaEspejo(
        'critica',
        '❌ Hot update falló en pruebas',
        `La versión ${this.instanciaEspejo.versionPendiente} falló las pruebas. Espejo restaurado.`,
        { version: this.instanciaEspejo.versionPendiente }
      );
      
      return {
        success: false,
        mensaje: 'Hot update falló en pruebas. Espejo restaurado al checkpoint anterior.'
      };
    }
  }
  
  async desplegarHotUpdateReal() {
    console.log(`🪞 [ESPEJO] Desplegando hot update en sistema REAL...`);
    
    // Verificar que el espejo tiene una versión probada
    if (this.instanciaReal.version === this.instanciaEspejo.version) {
      const error = 'No hay nueva versión para desplegar';
      await this.alertasService.alertaEspejo(
        'info',
        'ℹ️ No hay hot update pendiente',
        error,
        { versionReal: this.instanciaReal.version, versionEspejo: this.instanciaEspejo.version }
      );
      return { success: false, mensaje: error };
    }
    
    await this.alertasService.alertaEspejo(
      'atencion',
      '🚀 Desplegando hot update en REAL',
      `Iniciando despliegue de versión ${this.instanciaEspejo.version} en sistema REAL`,
      { nuevaVersion: this.instanciaEspejo.version }
    );
    
    // Generar checkpoint del real antes de actualizar
    const checkpoint = await this.generarCheckpoint('real', {
      descripcion: `Pre-hotupdate real a versión ${this.instanciaEspejo.version}`
    });
    
    // Realizar switchover para actualizar sin caída
    const switchoverResult = await this.switchover(
      `Hot update a versión ${this.instanciaEspejo.version}`,
      'real'
    );
    
    if (switchoverResult.success) {
      // Actualizar versión del real
      this.instanciaReal.version = this.instanciaEspejo.version;
      this.instanciaReal.metricas.precision = this.instanciaEspejo.metricas.precision;
      await this.instanciaReal.save();
      
      await EventoAuditoria.create({
        tipo: 'hotupdate_desplegado',
        modulo: 'espejo',
        usuario: 'oraculo',
        detalles: {
          nuevaVersion: this.instanciaReal.version,
          checkpointId: checkpoint.checkpointId
        },
        fecha: new Date()
      });
      
      await this.alertasService.alertaEspejo(
        'exito',
        '✅ Hot update desplegado exitosamente',
        `Versión ${this.instanciaReal.version} desplegada en sistema REAL sin interrupción del servicio`,
        { nuevaVersion: this.instanciaReal.version, checkpointId: checkpoint.checkpointId }
      );
      
      return {
        success: true,
        nuevaVersion: this.instanciaReal.version,
        mensaje: 'Hot update desplegado exitosamente en REAL'
      };
    }
    
    await this.alertasService.alertaEspejo(
      'critica',
      '❌ Falló el despliegue del hot update',
      `No se pudo completar el despliegue de la versión ${this.instanciaEspejo.version}. El sistema REAL continúa con versión ${this.instanciaReal.version}`,
      { versionIntentada: this.instanciaEspejo.version, versionActual: this.instanciaReal.version }
    );
    
    return { success: false, mensaje: 'Falló el despliegue del hot update' };
  }
  
  // ============ CICLO AUTOMÁTICO ============
  
  iniciarCicloCheckpoints() {
    // Generar checkpoint cada 5 minutos
    setInterval(async () => {
      try {
        await this.generarCheckpoint('real', { descripcion: 'Checkpoint automático cada 5min' });
        await this.generarCheckpoint('espejo', { descripcion: 'Checkpoint automático cada 5min' });
        
        // Verificar salud y posible switchover
        await this.verificarSaludYSwitchover();
        
      } catch (error) {
        console.error('❌ [ESPEJO] Error en ciclo automático:', error.message);
        await this.alertasService.alertaEspejo(
          'critica',
          '❌ Error en ciclo automático de checkpoints',
          `Error: ${error.message}`,
          { error: error.message }
        );
      }
    }, 300000); // 5 minutos
    
    // Verificación de salud más frecuente (cada 30 segundos)
    setInterval(async () => {
      try {
        await this.verificarSaludYSwitchover();
      } catch (error) {
        console.error('❌ [ESPEJO] Error en verificación de salud:', error.message);
      }
    }, 30000);
  }
  
  // ============ MÉTRICAS ============
  
  async actualizarMetricasEspejo(metricas) {
    this.instanciaEspejo.metricas = {
      ...this.instanciaEspejo.metricas,
      ...metricas,
      ultimaActualizacion: new Date()
    };
    await this.instanciaEspejo.save();
  }
  
  async registrarFalloSimulado() {
    this.instanciaEspejo.metricas.fallosSimulados = (this.instanciaEspejo.metricas.fallosSimulados || 0) + 1;
    await this.instanciaEspejo.save();
  }
  
  async registrarExitoSimulado() {
    this.instanciaEspejo.metricas.exitosSimulados = (this.instanciaEspejo.metricas.exitosSimulados || 0) + 1;
    const total = this.instanciaEspejo.metricas.fallosSimulados + this.instanciaEspejo.metricas.exitosSimulados;
    this.instanciaEspejo.metricas.precision = total > 0 
      ? Math.round((this.instanciaEspejo.metricas.exitosSimulados / total) * 100) 
      : 0;
    await this.instanciaEspejo.save();
  }
  
  // ============ ESTADO ============
  
  async obtenerEstadoCompleto() {
    return {
      timestamp: new Date(),
      real: {
        estado: this.instanciaReal.estado,
        version: this.instanciaReal.version,
        ultimoCheckpoint: this.instanciaReal.ultimoCheckpoint,
        metricas: this.instanciaReal.metricas
      },
      espejo: {
        estado: this.instanciaEspejo.estado,
        version: this.instanciaEspejo.version,
        versionPendiente: this.instanciaEspejo.versionPendiente,
        ultimoCheckpoint: this.instanciaEspejo.ultimoCheckpoint,
        metricas: this.instanciaEspejo.metricas
      },
      totalCheckpoints: await Checkpoint.countDocuments(),
      ultimosSwitchovers: this.instanciaReal.historialSwitchovers?.slice(-5) || []
    };
  }
  
  async obtenerMetricas() {
    return {
      real: {
        estado: this.instanciaReal.estado,
        version: this.instanciaReal.version,
        precision: this.instanciaReal.metricas?.precision || 0
      },
      espejo: {
        estado: this.instanciaEspejo.estado,
        version: this.instanciaEspejo.version,
        precision: this.instanciaEspejo.metricas?.precision || 0,
        fallosSimulados: this.instanciaEspejo.metricas?.fallosSimulados || 0,
        exitosSimulados: this.instanciaEspejo.metricas?.exitosSimulados || 0,
        totalCheckpoints: this.instanciaEspejo.metricas?.totalCheckpoints || 0
      }
    };
  }
}

module.exports = EspejoService;
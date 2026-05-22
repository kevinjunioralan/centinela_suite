// HabitacionBuilder.js - Constructor de habitaciones de aislamiento
const NamespaceManager = require('../../core/NamespaceManager/NamespaceManager');
const VethManager = require('../../core/VethManager/VethManager');
const FirewallManager = require('../../core/FirewallManager/FirewallManager');
const NetworkMonitor = require('../../core/NetworkMonitor/NetworkMonitor');
const { exec } = require('child_process');

class HabitacionBuilder {
  constructor() {
    this.habitaciones = new Map();
    this.namespaceManager = new NamespaceManager();
    this.vethManager = new VethManager();
    this.firewallManager = new FirewallManager();
    this.networkMonitor = new NetworkMonitor();

    // Inicializar EventEmitter para hooks de auditoría
    const EventEmitter = require('events');
    Object.assign(this, new EventEmitter());
  }

  /**
   * Valida que el expedienteId sea numérico
   * @param {number|string} expedienteId - ID del expediente
   * @returns {boolean} - True si es válido
   */
  _validarExpedienteId(expedienteId) {
    return !isNaN(expedienteId) && parseInt(expedienteId) > 0;
  }

  /**
   * Crea una nueva habitación de aislamiento para un expediente
   * Flujo:
   * 1. Crear namespace (usando NamespaceManager)
   * 2. Crear veth pair (usando VethManager)
   * 3. Asignar IP interna
   * 4. Aplicar firewall (usando FirewallManager)
   * 5. Iniciar monitor de red (usando NetworkMonitor)
   * 6. Registrar todo en un estado interno
   * @param {number|string} expedienteId - ID del expediente
   * @returns {Promise<Object>} Resultado de la operación
   */
  async crearHabitacion(expedienteId) {
    try {
      // Validaciones mínimas
      if (!this._validarExpedienteId(expedienteId)) {
        throw new Error('expedienteId debe ser numérico y positivo');
      }

      // Verificar que no exista ya una habitación para este expediente
      if (this.habitaciones.has(expedienteId.toString())) {
        throw new Error(`Ya existe una habitación para el expediente ${expedienteId}`);
      }

      const namespaceId = `ns-expediente-${expedienteId}`;
      const ipInterna = `10.0.${expedienteId}.1`; // IP interna basada en el expedienteId
      const vethHostId = `veth-host-${expedienteId}`;
      const vethNsId = `veth-ns-${expedienteId}`;

      // 1. Crear namespace
      const namespaceResult = await this.namespaceManager.createNamespace(namespaceId);
      if (!namespaceResult.success) {
        throw new Error(`Error al crear namespace: ${namespaceResult.error}`);
      }

      // 2. Crear veth pair
      const vethResult = await this.vethManager.createVethPair(expedienteId, namespaceId);
      if (!vethResult.success) {
        // Rollback: eliminar namespace si falla la creación de veth
        await this.namespaceManager.deleteNamespace(namespaceId);
        throw new Error(`Error al crear par veth: ${vethResult.error}`);
      }

      // 3. Asignar IP interna
      const ipResult = await this.vethManager.assignIp(vethNsId, ipInterna);
      if (!ipResult.success) {
        // Rollback: eliminar veth pair y namespace
        await this.vethManager.deleteVethPair(vethHostId, vethNsId);
        await this.namespaceManager.deleteNamespace(namespaceId);
        throw new Error(`Error al asignar IP: ${ipResult.error}`);
      }

      // 4. Aplicar firewall
      const firewallResult = await this.firewallManager.applyRules(expedienteId, namespaceId, ipInterna);
      if (!firewallResult.success) {
        // Rollback: eliminar IP, veth pair y namespace
        await this.vethManager.deleteVethPair(vethHostId, vethNsId);
        await this.namespaceManager.deleteNamespace(namespaceId);
        throw new Error(`Error al aplicar firewall: ${firewallResult.error}`);
      }

      // 5. Iniciar monitor de red
      const monitorResult = await this.networkMonitor.startMonitoring(expedienteId, namespaceId);
      if (!monitorResult.success) {
        // Rollback: eliminar firewall, IP, veth pair y namespace
        await this.firewallManager.deleteRules(expedienteId);
        await this.vethManager.deleteVethPair(vethHostId, vethNsId);
        await this.namespaceManager.deleteNamespace(namespaceId);
        throw new Error(`Error al iniciar monitor de red: ${monitorResult.error}`);
      }

      // 6. Registrar estado interno
      const habitacionData = {
        expedienteId,
        namespaceId,
        ipInterna,
        vethHostId,
        vethNsId,
        firewallId: `fw-expediente-${expedienteId}`,
        status: 'active',
        creado: new Date().toISOString()
      };

      this.habitaciones.set(expedienteId.toString(), habitacionData);

      // Emitir evento de auditoría
      this.emit("habitacion_creada", {
        ...habitacionData,
        timestamp: new Date().toISOString()
      });

      return {
        success: true,
        expedienteId,
        namespaceId,
        ipInterna,
        vethHostId,
        vethNsId,
        mensaje: 'Habitación de aislamiento creada exitosamente'
      };
    } catch (error) {
      // Emitir evento de error
      this.emit("habitacion_error", {
        expedienteId,
        error: error.message,
        timestamp: new Date().toISOString()
      });

      return {
        success: false,
        error: error.message,
        expedienteId
      };
    }
  }

  /**
   * Valida el estado de una habitación de aislamiento
   * @param {number|string} expedienteId - ID del expediente
   * @returns {Promise<Object>} Resultado de la validación
   */
  async validarHabitacion(expedienteId) {
    try {
      // Validaciones mínimas
      if (!this._validarExpedienteId(expedienteId)) {
        throw new Error('expedienteId debe ser numérico y positivo');
      }

      const habitacion = this.habitaciones.get(expedienteId.toString());
      if (!habitacion) {
        return {
          success: false,
          error: `No existe habitación para el expediente ${expedienteId}`,
          expedienteId
        };
      }

      // Validar que el namespace existe
      const namespaceInfo = await this.namespaceManager.getNamespaceInfo(habitacion.namespaceId);
      if (!namespaceInfo || namespaceInfo.status !== 'active') {
        return {
          success: false,
          error: `Namespace ${habitacion.namespaceId} no está activo`,
          expedienteId
        };
      }

      // Validar que el par veth existe
      const vethExists = await this.vethManager.exists(habitacion.vethHostId, habitacion.vethNsId);
      if (!vethExists.success || !vethExists.exists) {
        return {
          success: false,
          error: `Par veth ${habitacion.vethHostId}-${habitacion.vethNsId} no existe`,
          expedienteId
        };
      }

      // Validar que las reglas de firewall existen
      const firewallExists = await this.firewallManager.exists(habitacion.expedienteId);
      if (!firewallExists.success || !firewallExists.exists) {
        return {
          success: false,
          error: `Reglas de firewall para expediente ${habitacion.expedienteId} no existen`,
          expedienteId
        };
      }

      // Validar que el monitor de red está activo
      const monitorStatus = await this.networkMonitor.getStatus(habitacion.expedienteId, habitacion.namespaceId);
      if (!monitorStatus.success || monitorStatus.status !== 'active') {
        return {
          success: false,
          error: `Monitor de red para expediente ${habitacion.expedienteId} no está activo`,
          expedienteId
        };
      }

      return {
        success: true,
        expedienteId,
        habitacion,
        mensaje: 'Habitación de aislamiento válida y operativa'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        expedienteId
      };
    }
  }

  /**
   * Obtiene el estado actual de una habitación de aislamiento
   * @param {number|string} expedienteId - ID del expediente
   * @returns {Promise<Object>} Estado de la habitación
   */
  async obtenerEstado(expedienteId) {
    try {
      // Validaciones mínimas
      if (!this._validarExpedienteId(expedienteId)) {
        throw new Error('expedienteId debe ser numérico y positivo');
      }

      const habitacion = this.habitaciones.get(expedienteId.toString());
      if (!habitacion) {
        return {
          success: false,
          error: `No existe habitación para el expediente ${expedienteId}`,
          expedienteId
        };
      }

      // Recopilar información de todos los componentes
      const [namespaceInfo, vethInfo, firewallInfo, monitorStatus] = await Promise.all([
        this.namespaceManager.getNamespaceInfo(habitacion.namespaceId),
        this.vethManager.exists(habitacion.vethHostId, habitacion.vethNsId),
        this.firewallManager.exists(habitacion.expedienteId),
        this.networkMonitor.getStatus(habitacion.expedienteId, habitacion.namespaceId)
      ]);

      const estado = {
        expedienteId: habitacion.expedienteId,
        namespaceId: habitacion.namespaceId,
        ipInterna: habitacion.ipInterna,
        vethHostId: habitacion.vethHostId,
        vethNsId: habitacion.vethNsId,
        firewallId: habitacion.firewallId,
        status: habitacion.status,
        creado: habitacion.creado,
        componentes: {
          namespace: namespaceInfo ? { success: true, info: namespaceInfo } : { success: false, error: 'No se pudo obtener info del namespace' },
          veth: vethInfo,
          firewall: firewallInfo,
          monitor: monitorStatus
        }
      };

      return {
        success: true,
        expedienteId,
        estado
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        expedienteId
      };
    }
  }

  /**
   * 🔥 NUEVO MÉTODO: Listar todas las habitaciones
   * @returns {Promise<Array>} Lista de habitaciones
   */
  async listarHabitaciones() {
    console.log('📋 Listando todas las habitaciones...');
    const habitacionesList = [];
    
    for (const [key, value] of this.habitaciones) {
      habitacionesList.push({
        id: key,
        nombre: `Habitación-${key}`,
        tipo: 'aislamiento',
        estado: value.status || 'activa',
        fechaCreacion: value.creado,
        configuracion: {
          expedienteId: value.expedienteId,
          namespaceId: value.namespaceId,
          ipInterna: value.ipInterna
        }
      });
    }
    
    console.log(`✅ Encontradas ${habitacionesList.length} habitaciones`);
    return habitacionesList;
  }

  /**
   * 🔥 NUEVO MÉTODO: Crear habitación con nombre y tipo (para el router)
   * @param {string} nombre - Nombre de la habitación
   * @param {string} tipo - Tipo de habitación (aislamiento, cuarentena, forense)
   * @param {Object} configuracion - Configuración adicional
   * @returns {Promise<Object>} Habitación creada
   */
  async crearHabitacionConNombre(nombre, tipo, configuracion) {
    console.log('🏗️ Creando habitación con nombre:', { nombre, tipo, configuracion });
    
    const expedienteId = configuracion?.expedienteId;
    
    if (!expedienteId) {
      throw new Error('expedienteId es requerido en la configuración');
    }
    
    // Usar el método existente que crea la habitación con el expedienteId
    const resultado = await this.crearHabitacion(expedienteId);
    
    if (!resultado.success) {
      throw new Error(resultado.error);
    }
    
    // Retornar en el formato que espera el router
    return {
      id: expedienteId.toString(),
      nombre: nombre,
      tipo: tipo,
      estado: 'activa',
      fechaCreacion: new Date().toISOString(),
      configuracion: {
        expedienteId: expedienteId,
        namespaceId: resultado.namespaceId,
        ipInterna: resultado.ipInterna
      }
    };
  }
}

module.exports = HabitacionBuilder;
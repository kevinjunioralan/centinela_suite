// VethManager.js - Gestión de interfaces veth para conectar namespaces de red
const { exec } = require('child_process');

class VethManager {
  constructor() {
    this.vethPairs = new Map();
  }

  /**
   * Crea un par veth para conectar un namespace con el host
   * @param {string} expedienteId - ID del expediente
   * @param {string} namespaceId - ID del namespace
   * @returns {Promise<Object>} Resultado de la operación
   */
  async createVethPair(expedienteId, namespaceId) {
    try {
      // Validaciones
      if (!expedienteId || isNaN(expedienteId)) {
        throw new Error('expedienteId es requerido y debe ser numérico');
      }
      if (!namespaceId || typeof namespaceId !== 'string') {
        throw new Error('namespaceId es requerido y debe ser una cadena');
      }

      const vethHostId = `veth-host-${expedienteId}`;
      const vethNsId = `veth-ns-${expedienteId}`;
      const pairKey = `${expedienteId}`;

      // Verificar si ya existe
      if (this.vethPairs.has(pairKey)) {
        return {
          success: false,
          error: `Par veth para expediente ${expedienteId} ya existe`
        };
      }

      // Crear par veth
      const result = await this._executeCommand(`ip link add ${vethHostId} type veth peer name ${vethNsId}`);
      
      if (!result.success) {
        return {
          success: false,
          error: result.error || 'Error al crear par veth'
        };
      }

      // Mover el extremo del namespace al namespace especificado
      const moveResult = await this._executeCommand(`ip link set ${vethNsId} netns ${namespaceId}`);
      
      if (!moveResult.success) {
        // Rollback: eliminar el par veth si falla el movimiento
        await this._executeCommand(`ip link delete ${vethHostId}`);
        return {
          success: false,
          error: moveResult.error || 'Error al mover veth al namespace'
        };
      }

      // Levantar ambas interfaces
      const upHostResult = await this._executeCommand(`ip link set ${vethHostId} up`);
      if (!upHostResult.success) {
        // Rollback: eliminar el par veth
        await this._executeCommand(`ip link delete ${vethHostId}`);
        return {
          success: false,
          error: upHostResult.error || 'Error al levantar interfaz host'
        };
      }

      const upNsResult = await this._executeCommand(`ip netns exec ${namespaceId} ip link set ${vethNsId} up`);
      if (!upNsResult.success) {
        // Rollback: eliminar el par veth
        await this._executeCommand(`ip link set ${vethHostId} down`);
        await this._executeCommand(`ip link delete ${vethHostId}`);
        return {
          success: false,
          error: upNsResult.error || 'Error al levantar interfaz namespace'
        };
      }

      // Guardar el par veth creado
      this.vethPairs.set(pairKey, {
        expedienteId,
        vethHostId,
        vethNsId,
        namespaceId,
        creado: new Date().toISOString(),
        status: 'active'
      });

      return {
        success: true,
        expedienteId,
        vethHostId,
        vethNsId,
        namespaceId,
        mensaje: `Par veth ${vethHostId}-${vethNsId} creado y conectado al namespace ${namespaceId} exitosamente`
      };
    } catch (error) {
      return {
        success: false,
        error: error.message || 'Error inesperado al crear par veth'
      };
    }
  }

  /**
   * Asigna una IP interna a una interfaz en un namespace
   * @param {string} vethNsId - ID de la interfaz veth en el namespace
   * @param {string} ipInterna - IP interna a asignar
   * @returns {Promise<Object>} Resultado de la operación
   */
  async assignIp(vethNsId, ipInterna) {
    try {
      // Validaciones
      if (!vethNsId || typeof vethNsId !== 'string') {
        throw new Error('vethNsId es requerido y debe ser una cadena');
      }
      if (!ipInterna || typeof ipInterna !== 'string') {
        throw new Error('ipInterna es requerida y debe ser una cadena');
      }

      // Asignar IP usando ip netns exec
      const result = await this._executeCommand(`ip netns exec $(ip -o link show ${vethNsId} | cut -d' ' -f1 | cut -d'@' -f2) ip addr add ${ipInterna}/24 dev ${vethNsId}`);
      
      if (result.success) {
        return {
          success: true,
          vethNsId,
          ipInterna,
          mensaje: `IP ${ipInterna} asignada a ${vethNsId} exitosamente`
        };
      } else {
        return {
          success: false,
          error: result.error || 'Error al asignar IP'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message || 'Error inesperado al asignar IP'
      };
    }
  }

  /**
   * Elimina un par veth
   * @param {string} vethHostId - ID de la interfaz veth en el host
   * @param {string} vethNsId - ID de la interfaz veth en el namespace
   * @returns {Promise<Object>} Resultado de la operación
   */
  async deleteVethPair(vethHostId, vethNsId) {
    try {
      // Validaciones
      if (!vethHostId || typeof vethHostId !== 'string') {
        throw new Error('vethHostId es requerido y debe ser una cadena');
      }
      if (!vethNsId || typeof vethNsId !== 'string') {
        throw new Error('vethNsId es requerido y debe ser una cadena');
      }

      // Eliminar el par veth (esto elimina ambas interfaces)
      const result = await this._executeCommand(`ip link delete ${vethHostId}`);
      
      if (result.success) {
        // Eliminar de nuestro mapa interno
        for (const [key, pair] of this.vethPairs.entries()) {
          if (pair.vethHostId === vethHostId && pair.vethNsId === vethNsId) {
            this.vethPairs.delete(key);
            break;
          }
        }
        
        return {
          success: true,
          vethHostId,
          vethNsId,
          mensaje: `Par veth ${vethHostId}-${vethNsId} eliminado exitosamente`
        };
      } else {
        return {
          success: false,
          error: result.error || 'Error al eliminar par veth'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message || 'Error inesperado al eliminar par veth'
      };
    }
  }

  /**
   * Verifica si existe un par veth
   * @param {string} vethHostId - ID de la interfaz veth en el host
   * @param {string} vethNsId - ID de la interfaz veth en el namespace
   * @returns {Promise<Object>} Resultado de la verificación
   */
  async exists(vethHostId, vethNsId) {
    try {
      // Validaciones
      if (!vethHostId || typeof vethHostId !== 'string') {
        throw new Error('vethHostId es requerido y debe ser una cadena');
      }
      if (!vethNsId || typeof vethNsId !== 'string') {
        throw new Error('vethNsId es requerido y debe ser una cadena');
      }

      // Verificar si existe en nuestro mapa interno
      for (const [key, pair] of this.vethPairs.entries()) {
        if (pair.vethHostId === vethHostId && pair.vethNsId === vethNsId) {
          return {
            success: true,
            exists: true,
            vethHostId,
            vethNsId,
            expedienteId: pair.expedienteId
          };
        }
      }

      return {
        success: true,
        exists: false,
        vethHostId,
        vethNsId
      };
    } catch (error) {
      return {
        success: false,
        error: error.message || 'Error inesperado al verificar existencia de par veth'
      };
    }
  }

  /**
   * Ejecuta un comando del sistema y devuelve una promesa
   * @param {string} command - Comando a ejecutar
   * @returns {Promise<Object>} Resultado de la ejecución
   */
  _executeCommand(command) {
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          resolve({
            success: false,
            error: stderr || error.message,
            output: stdout
          });
        } else {
          resolve({
            success: true,
            output: stdout
          });
        }
      });
    });
  }
}

module.exports = VethManager;
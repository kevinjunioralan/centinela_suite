// NamespaceManager.js - Gestión de namespaces de red
const { exec } = require('child_process');

class NamespaceManager {
  constructor() {
    this.namespaces = new Map();
  }

  /**
   * Crea un nuevo namespace de red
   * @param {string} namespaceId - ID del namespace
   * @returns {Promise<Object>} Resultado de la operación
   */
  async createNamespace(namespaceId) {
    try {
      // Validaciones
      if (!namespaceId || typeof namespaceId !== 'string') {
        throw new Error('namespaceId es requerido y debe ser una cadena');
      }

      // Verificar si ya existe
      if (this.namespaces.has(namespaceId)) {
        return {
          success: false,
          error: `Namespace ${namespaceId} ya existe`
        };
      }

      // Crear namespace usando ip netns add
      const result = await this._executeCommand(`ip netns add ${namespaceId}`);
      
      if (result.success) {
        this.namespaces.set(namespaceId, {
          id: namespaceId,
          creado: new Date().toISOString(),
          status: 'active'
        });
        
        return {
          success: true,
          namespaceId,
          mensaje: `Namespace ${namespaceId} creado exitosamente`
        };
      } else {
        return {
          success: false,
          error: result.error || 'Error al crear namespace'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message || 'Error inesperado al crear namespace'
      };
    }
  }

  /**
   * Elimina un namespace de red
   * @param {string} namespaceId - ID del namespace
   * @returns {Promise<Object>} Resultado de la operación
   */
  async deleteNamespace(namespaceId) {
    try {
      // Validaciones
      if (!namespaceId || typeof namespaceId !== 'string') {
        throw new Error('namespaceId es requerido y debe ser una cadena');
      }

      // Verificar si existe
      if (!this.namespaces.has(namespaceId)) {
        return {
          success: false,
          error: `Namespace ${namespaceId} no existe`
        };
      }

      // Eliminar namespace usando ip netns delete
      const result = await this._executeCommand(`ip netns delete ${namespaceId}`);
      
      if (result.success) {
        this.namespaces.delete(namespaceId);
        
        return {
          success: true,
          namespaceId,
          mensaje: `Namespace ${namespaceId} eliminado exitosamente`
        };
      } else {
        return {
          success: false,
          error: result.error || 'Error al eliminar namespace'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message || 'Error inesperado al eliminar namespace'
      };
    }
  }

  /**
   * Obtiene información de un namespace
   * @param {string} namespaceId - ID del namespace
   * @returns {Promise<Object>} Información del namespace
   */
  async getNamespaceInfo(namespaceId) {
    try {
      // Validaciones
      if (!namespaceId || typeof namespaceId !== 'string') {
        throw new Error('namespaceId es requerido y debe ser una cadena');
      }

      // Verificar si existe
      if (!this.namespaces.has(namespaceId)) {
        return {
          success: false,
          error: `Namespace ${namespaceId} no existe`
        };
      }

      // Obtener información usando ip netns list
      const result = await this._executeCommand('ip netns list');
      
      if (result.success) {
        const namespaces = result.output.split('\n').filter(Boolean);
        const exists = namespaces.includes(namespaceId);
        
        return {
          success: true,
          namespaceId,
          exists,
          status: exists ? 'active' : 'inactive'
        };
      } else {
        return {
          success: false,
          error: result.error || 'Error al obtener información del namespace'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message || 'Error inesperado al obtener información del namespace'
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

module.exports = NamespaceManager;
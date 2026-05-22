// HabitacionValidator.js - Validador de habitaciones de aislamiento
class HabitacionValidator {
  constructor() {
    this.validationRules = [];
  }

  /**
   * Añade una regla de validación
   */
  async addValidationRule(rule) {
    this.validationRules.push(rule);
    return { success: true, rulesCount: this.validationRules.length };
  }

  /**
   * Valida una habitación de aislamiento
   */
  async validateHabitacion(habitacion) {
    const errors = [];

    if (!habitacion.id) {
      errors.push('ID de habitación requerido');
    }

    if (!habitacion.nombre) {
      errors.push('Nombre de habitación requerido');
    }

    for (const rule of this.validationRules) {
      try {
        const ruleResult = await rule(habitacion);
        if (!ruleResult.valid) {
          errors.push(ruleResult.message || 'Error de validación personalizada');
        }
      } catch (error) {
        errors.push(`Error en regla de validación: ${error.message}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      habitacionId: habitacion.id || null
    };
  }

  /**
   * 🔥 VALIDAR CONFIGURACIÓN - Corregido para aceptar ObjectId (string)
   */
  async validarConfiguracion(tipo, configuracion) {
    console.log('🔍 Validando configuración:', { tipo, configuracion });

    const errores = [];

    // Validaciones básicas
    if (!tipo) {
      errores.push('El tipo de habitación es requerido');
    }

    // Validar según el tipo
    if (tipo === 'aislamiento') {
      if (!configuracion || !configuracion.expedienteId) {
        errores.push('Para aislamiento se requiere expedienteId');
      } else {
        // 🔥 CORREGIDO: Aceptar tanto número como string (ObjectId)
        const expedienteId = configuracion.expedienteId;
        const esNumero = !isNaN(expedienteId);
        const esObjectId = typeof expedienteId === 'string' && expedienteId.length === 24;
        
        if (!esNumero && !esObjectId) {
          errores.push('expedienteId debe ser un número válido o un ObjectId de 24 caracteres');
        } else {
          console.log(`✅ expedienteId válido: ${expedienteId} (${esNumero ? 'número' : 'ObjectId'})`);
        }
      }
    }

    return {
      valido: errores.length === 0,
      errores: errores
    };
  }

  /**
   * Lista todas las reglas de validación
   */
  async listValidationRules() {
    return this.validationRules.map((rule, index) => ({
      index,
      type: typeof rule,
      toString: rule.toString()
    }));
  }
}

module.exports = HabitacionValidator;
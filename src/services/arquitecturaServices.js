// services/arquitecturaService.js
// Lógica de recomendación de arquitectura basada en respuestas

const RECOMENDACIONES = {
  // Micro empresa (1-10 empleados)
  '1-10': {
    'basico': {
      servidores: [
        { nombre: 'Servidor Todo-en-Uno', packs: ['pack_web'] }
      ],
      costoMensual: 80,
      recomendacion: 'Para empezar, un solo servidor web es suficiente.'
    },
    'completo': {
      servidores: [
        { nombre: 'Servidor Todo-en-Uno', packs: ['pack_web', 'pack_correo'] }
      ],
      costoMensual: 120,
      recomendacion: 'Incluye correo corporativo en el mismo servidor.'
    }
  },
  
  // Pequeña empresa (11-50 empleados)
  '11-50': {
    'basico': {
      servidores: [
        { nombre: 'Servidor Principal', packs: ['pack_web', 'pack_correo'] }
      ],
      costoMensual: 160,
      recomendacion: 'Servidor único con web y correo.'
    },
    'recomendado': {
      servidores: [
        { nombre: 'Servidor de Dominio y Correo', packs: ['pack_dominio', 'pack_correo'] },
        { nombre: 'Servidor Web y Base de Datos', packs: ['pack_web'] }
      ],
      costoMensual: 200,
      recomendacion: 'Separación lógica entre dominio/correo y web/db.'
    }
  },
  
  // Mediana empresa (51-200 empleados)
  '51-200': {
    'recomendado': {
      servidores: [
        { nombre: 'Controlador de Dominio', packs: ['pack_dominio'] },
        { nombre: 'Servidor de Correo', packs: ['pack_correo'] },
        { nombre: 'Servidor Web', packs: ['pack_web'] },
        { nombre: 'Servidor de Seguridad', packs: ['pack_cortafuegos', 'pack_monitoreo'] }
      ],
      costoMensual: 320,
      recomendacion: 'Arquitectura de 4 servidores separados por función.'
    }
  },
  
  // Gran empresa (201-500 empleados)
  '201-500': {
    'recomendado': {
      servidores: [
        { nombre: 'Controlador de Dominio Principal', packs: ['pack_dominio'] },
        { nombre: 'Controlador de Dominio Secundario', packs: ['pack_dominio'] },
        { nombre: 'Servidor de Correo', packs: ['pack_correo'] },
        { nombre: 'Servidor Web', packs: ['pack_web'] },
        { nombre: 'Servidor de Base de Datos', packs: ['pack_web'] },
        { nombre: 'Servidor de Cortafuegos', packs: ['pack_cortafuegos'] },
        { nombre: 'Servidor de Monitoreo', packs: ['pack_monitoreo'] }
      ],
      costoMensual: 560,
      recomendacion: 'Arquitectura completa con redundancia en dominio.'
    }
  },
  
  // Corporación (500+ empleados)
  '500+': {
    'recomendado': {
      servidores: [
        { nombre: 'Controlador de Dominio Principal', packs: ['pack_dominio'] },
        { nombre: 'Controlador de Dominio Secundario', packs: ['pack_dominio'] },
        { nombre: 'Servidor de Correo Principal', packs: ['pack_correo'] },
        { nombre: 'Servidor de Correo Secundario', packs: ['pack_correo'] },
        { nombre: 'Servidor Web Frontend', packs: ['pack_web'] },
        { nombre: 'Servidor Web Backend', packs: ['pack_web'] },
        { nombre: 'Servidor de Base de Datos Principal', packs: ['pack_web'] },
        { nombre: 'Servidor de Base de Datos Réplica', packs: ['pack_web'] },
        { nombre: 'Servidor de Cortafuegos', packs: ['pack_cortafuegos'] },
        { nombre: 'Servidor de Monitoreo', packs: ['pack_monitoreo'] },
        { nombre: 'Servidor de Almacenamiento', packs: [] }  // NAS
      ],
      costoMensual: 880,
      recomendacion: 'Arquitectura empresarial con alta disponibilidad.'
    }
  }
};

class ArquitecturaService {
  
  generarPropuesta(respuestas) {
    const { empleados, servicios, presupuesto } = respuestas;
    
    // Contar servicios seleccionados
    const serviciosActivos = Object.entries(servicios)
      .filter(([_, v]) => v)
      .map(([k]) => k);
    
    const totalServicios = serviciosActivos.length;
    
    // Seleccionar plantilla base según número de empleados
    let plantilla = null;
    if (empleados === '1-10') {
      plantilla = RECOMENDACIONES['1-10'][totalServicios <= 2 ? 'basico' : 'completo'];
    } else if (empleados === '11-50') {
      if (totalServicios <= 3 && presupuesto === 'bajo') {
        plantilla = RECOMENDACIONES['11-50']['basico'];
      } else {
        plantilla = RECOMENDACIONES['11-50']['recomendado'];
      }
    } else if (empleados === '51-200') {
      plantilla = RECOMENDACIONES['51-200']['recomendado'];
    } else if (empleados === '201-500') {
      plantilla = RECOMENDACIONES['201-500']['recomendado'];
    } else {
      plantilla = RECOMENDACIONES['500+']['recomendado'];
    }
    
    // Filtrar servidores según servicios solicitados
    let servidoresFiltrados = plantilla.servidores;
    
    // Si el cliente no pidió ciertos servicios, eliminar servidores innecesarios
    if (totalServicios < 4 && empleados === '11-50') {
      servidoresFiltrados = servidoresFiltrados.filter(s => {
        // Mantener solo servidores con packs relevantes
        return s.packs.some(p => {
          if (p === 'pack_dominio' && servicios.dominio) return true;
          if (p === 'pack_correo' && servicios.correo) return true;
          if (p === 'pack_web' && (servicios.web || servicios.baseDatos)) return true;
          if (p === 'pack_cortafuegos' && servicios.cortafuegos) return true;
          if (p === 'pack_monitoreo' && servicios.monitoreo) return true;
          return false;
        });
      });
    }
    
    // Calcular costo ajustado
    let costoMensual = servidoresFiltrados.length * 80;
    
    return {
      servidores: servidoresFiltrados,
      costoMensual,
      recomendacion: plantilla.recomendacion,
      resumen: {
        totalServidores: servidoresFiltrados.length,
        totalPacks: servidoresFiltrados.reduce((sum, s) => sum + s.packs.length, 0),
        serviciosCubiertos: totalServicios
      }
    };
  }
  
  getPackNombre(packKey) {
    const nombres = {
      'pack_web': '🌐 Pack Web',
      'pack_dominio': '🏢 Pack Dominio',
      'pack_cortafuegos': '🛡️ Pack Cortafuegos',
      'pack_correo': '📧 Pack Correo',
      'pack_monitoreo': '📊 Pack Monitoreo'
    };
    return nombres[packKey] || packKey;
  }
  
  getPackDescripcion(packKey) {
    const descripciones = {
      'pack_web': 'Servidor web, base de datos y caché',
      'pack_dominio': 'Controlador de dominio, DNS, DHCP, Samba',
      'pack_cortafuegos': 'Firewall, iptables, fail2ban',
      'pack_correo': 'Servidor de correo, antispam, antivirus',
      'pack_monitoreo': 'Métricas, alertas, dashboards'
    };
    return descripciones[packKey] || '';
  }
}

export default new ArquitecturaService();
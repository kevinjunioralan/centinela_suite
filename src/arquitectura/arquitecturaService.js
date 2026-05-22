// arquitecturaService.js - Lógica de recomendación de arquitectura

const RECOMENDACIONES = {
  '1-10': {
    basico: {
      servidores: [
        { nombre: 'Servidor Todo-en-Uno', packs: ['pack_web'] }
      ],
      costoMensual: 80,
      recomendacion: 'Para empezar, un servidor dedicado al servicio web es suficiente.'
    },
    completo: {
      servidores: [
        { nombre: 'Servidor Todo-en-Uno', packs: ['pack_web', 'pack_correo'] }
      ],
      costoMensual: 120,
      recomendacion: 'Incluye servicios web y correo separados para facilitar medicion y crecimiento.'
    }
  },
  '11-50': {
    basico: {
      servidores: [
        { nombre: 'Servidor Principal', packs: ['pack_web', 'pack_correo'] }
      ],
      costoMensual: 160,
      recomendacion: 'Arquitectura inicial con servicios web y correo en servidores dedicados.'
    },
    recomendado: {
      servidores: [
        { nombre: 'Servidor de Dominio y Correo', packs: ['pack_dominio', 'pack_correo'] },
        { nombre: 'Servidor Web y Base de Datos', packs: ['pack_web'] }
      ],
      costoMensual: 200,
      recomendacion: 'Separación por servicio para dominio, correo y web, priorizando observabilidad.'
    }
  },
  '51-200': {
    recomendado: {
      servidores: [
        { nombre: 'Controlador de Dominio', packs: ['pack_dominio'] },
        { nombre: 'Servidor de Correo', packs: ['pack_correo'] },
        { nombre: 'Servidor Web', packs: ['pack_web'] },
        { nombre: 'Servidor de Seguridad', packs: ['pack_cortafuegos', 'pack_monitoreo'] }
      ],
      costoMensual: 320,
      recomendacion: 'Arquitectura con servicios aislados por servidor para medir rendimiento por funcion.'
    }
  },
  '201-500': {
    recomendado: {
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
  '500+': {
    recomendado: {
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
        { nombre: 'Servidor de Monitoreo', packs: ['pack_monitoreo'] }
      ],
      costoMensual: 880,
      recomendacion: 'Arquitectura empresarial con alta disponibilidad.'
    }
  }
};

class ArquitecturaService {
  normalizarUnPackPorServidor(servidores) {
    const normalizados = [];

    for (const servidor of servidores) {
      const packs = Array.isArray(servidor.packs) && servidor.packs.length
        ? servidor.packs
        : ['pack_web'];

      if (packs.length === 1) {
        normalizados.push({ ...servidor, packs: [packs[0]] });
        continue;
      }

      packs.forEach((pack) => {
        normalizados.push({
          ...servidor,
          nombre: `${servidor.nombre} - ${this.getPackNombre(pack)}`,
          packs: [pack]
        });
      });
    }

    return normalizados;
  }
  
  generarPropuesta(respuestas) {
    const { empleados, servicios, presupuesto } = respuestas;
    
    const serviciosActivos = Object.entries(servicios)
      .filter(([_, v]) => v)
      .map(([k]) => k);
    
    const totalServicios = serviciosActivos.length;
    
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
    
    let servidoresFiltrados = plantilla.servidores;
    
    if (totalServicios < 4 && empleados === '11-50') {
      servidoresFiltrados = servidoresFiltrados.filter(s => {
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

    servidoresFiltrados = this.normalizarUnPackPorServidor(servidoresFiltrados);
    
    const costoMensual = servidoresFiltrados.length * 80;
    
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

module.exports = new ArquitecturaService();
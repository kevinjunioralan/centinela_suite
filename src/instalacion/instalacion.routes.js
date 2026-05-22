const express = require('express');
const router = express.Router();
const InstalacionService = require('./InstalacionService');
const Expediente = require('../expediente/models/Expediente');
const { getMissingFields, toFieldLabels } = require('./packConfigRules');

const instalacionService = new InstalacionService();

const PACK_SOFTWARE_CATALOGO = {
  pack_web: ['nginx', 'nodejs', 'postgresql', 'redis', 'redis-server'],
  pack_dominio: ['bind9', 'isc-dhcp-server', 'samba', 'krb5-kdc'],
  pack_cortafuegos: ['iptables-persistent', 'fail2ban', 'nftables'],
  pack_correo: ['postfix', 'dovecot-core', 'dovecot-imapd', 'dovecot-pop3d', 'spamassassin', 'clamav', 'clamav-daemon'],
  pack_monitoreo: ['prometheus', 'prometheus-node-exporter']
};

function validarConfiguracionPack(expediente) {
  const packKey = expediente.instalacion?.packSeleccionado;
  const config = expediente.configuracion;

  if (!packKey) {
    return { ok: false, error: 'No hay pack seleccionado para instalar' };
  }

  if (!config?.completada || !config?.valores || !config?.packTipo) {
    return { ok: false, error: `Falta configuración del pack ${packKey}` };
  }

  if (config.packTipo !== packKey) {
    return {
      ok: false,
      error: `La configuración guardada (${config.packTipo}) no coincide con el pack seleccionado (${packKey})`
    };
  }

  const faltantes = getMissingFields(packKey, config.valores);
  if (faltantes.length) {
    const etiquetas = toFieldLabels(packKey, faltantes);
    return {
      ok: false,
      error: `Configuración incompleta para ${packKey}. Faltan: ${etiquetas.join(', ')}`
    };
  }

  return { ok: true };
}

// ============ ENDPOINTS SIMPLIFICADOS ============

// Obtener todas las instalaciones
router.get('/todas', async (req, res) => {
  try {
    const resultado = await instalacionService.obtenerTodas();
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener pendientes
router.get('/pendientes', async (req, res) => {
  try {
    const resultado = await instalacionService.obtenerPendientes();
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener estadísticas
router.get('/estadisticas', async (req, res) => {
  try {
    const resultado = await instalacionService.obtenerEstadisticas();
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ CONFIGURAR SOFTWARE (ANTES DE /:id/estado) ============

// Configurar software del pack
router.put('/:id/software', async (req, res) => {
  try {
    const { id } = req.params;
    const { software, packKey, packNombre } = req.body;

    const softwareNormalizado = Array.isArray(software) ? software : [];

    const esLimpiezaPack = !packKey && softwareNormalizado.length === 0;
    if (esLimpiezaPack) {
      const expediente = await Expediente.findById(id);
      if (!expediente) {
        return res.status(404).json({ success: false, error: 'Expediente no encontrado' });
      }

      if (!expediente.instalacion) {
        expediente.instalacion = {};
      }

      expediente.instalacion.software = [];
      expediente.instalacion.packSeleccionado = null;
      expediente.instalacion.packNombre = null;
      expediente.instalacion.logs = expediente.instalacion.logs || [];
      expediente.instalacion.logs.push({
        nivel: 'info',
        mensaje: '🗑️ Pack y software limpiados',
        timestamp: new Date()
      });

      await expediente.save();
      return res.json({ success: true, data: expediente.instalacion });
    }

    if (!packKey || !PACK_SOFTWARE_CATALOGO[packKey]) {
      return res.status(400).json({
        success: false,
        error: 'packKey invalido. Debe corresponder a un unico pack soportado'
      });
    }

    if (!softwareNormalizado.length) {
      return res.status(400).json({
        success: false,
        error: 'Debe enviar software para el pack seleccionado'
      });
    }

    const permitidos = new Set(PACK_SOFTWARE_CATALOGO[packKey]);
    const invalidos = softwareNormalizado
      .map(item => item?.nombre)
      .filter(nombre => !permitidos.has(nombre));

    if (invalidos.length) {
      return res.status(400).json({
        success: false,
        error: `Software no permitido para ${packKey}: ${invalidos.join(', ')}`
      });
    }
    
    const expediente = await Expediente.findById(id);
    if (!expediente) {
      return res.status(404).json({ success: false, error: 'Expediente no encontrado' });
    }
    
    if (!expediente.instalacion) {
      expediente.instalacion = {};
    }
    
    expediente.instalacion.software = softwareNormalizado;
    
    if (packKey) {
      expediente.instalacion.packSeleccionado = packKey;
      expediente.instalacion.packNombre = packNombre || packKey;
    }
    
    expediente.instalacion.logs = expediente.instalacion.logs || [];
    expediente.instalacion.logs.push({
      nivel: 'info',
      mensaje: `📦 Software configurado para ${packKey}: ${softwareNormalizado.length} paquetes`,
      timestamp: new Date()
    });
    
    await expediente.save();
    
    res.json({ success: true, data: expediente.instalacion });
    
  } catch (error) {
    console.error('Error configurando software:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Guardar configuración del pack
router.put('/:id/configuracion', async (req, res) => {
  try {
    const { id } = req.params;
    const { packTipo, valores } = req.body;
    
    const expediente = await Expediente.findById(id);
    if (!expediente) {
      return res.status(404).json({ success: false, error: 'Expediente no encontrado' });
    }
    
    expediente.configuracion = {
      packTipo,
      valores,
      completada: true,
      fecha: new Date()
    };
    
    await expediente.save();
    
    res.json({ success: true, message: 'Configuración guardada' });
    
  } catch (error) {
    console.error('Error guardando configuración:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ ENDPOINTS CON PARÁMETROS (DESPUÉS DE LOS ESPECÍFICOS) ============

// Historial de configuración ejecutada por ciclo
// GET /:id/configuracion/historial?offset=0&limit=10
router.get('/:id/configuracion/historial', async (req, res) => {
  try {
    const { id } = req.params;
    const offsetRaw = Number.parseInt(req.query.offset, 10);
    const limitRaw = Number.parseInt(req.query.limit, 10);

    const offset = Number.isInteger(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;
    const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 10;

    const expediente = await Expediente.findById(id)
      .select('instalacion.historialConfiguracion instalacion.ultimaConfiguracionEjecutada instalacion.packSeleccionado')
      .lean();

    if (!expediente) {
      return res.status(404).json({ success: false, error: 'Expediente no encontrado' });
    }

    const historial = Array.isArray(expediente.instalacion?.historialConfiguracion)
      ? expediente.instalacion.historialConfiguracion
      : [];

    const ordenado = historial.slice().reverse();
    const items = ordenado.slice(offset, offset + limit);

    return res.json({
      success: true,
      data: {
        total: ordenado.length,
        offset,
        limit,
        hasMore: (offset + items.length) < ordenado.length,
        ultimaConfiguracionEjecutada: expediente.instalacion?.ultimaConfiguracionEjecutada || null,
        packSeleccionado: expediente.instalacion?.packSeleccionado || null,
        items
      }
    });
  } catch (error) {
    console.error('Error obteniendo historial de configuracion:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Polling ligero de logs (sin traer el expediente completo)
// GET /:id/logs?desde=0  → devuelve logs a partir del índice indicado
router.get('/:id/logs', async (req, res) => {
  try {
    const { id } = req.params;
    const desde = Math.max(0, parseInt(req.query.desde) || 0);
    const resultado = await instalacionService.obtenerLogs(id, desde);
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener estado de una instalación
router.get('/:id/estado', async (req, res) => {
  try {
    const resultado = await instalacionService.obtenerEstado(req.params.id);
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Iniciar instalación
router.post('/:id/iniciar', async (req, res) => {
  try {
    const { id } = req.params;
    
    const expediente = await Expediente.findById(id);
    
    if (!expediente) {
      return res.status(404).json({ success: false, error: 'Expediente no encontrado' });
    }
    
    if (expediente.origen !== 'instalacion') {
      return res.status(400).json({ 
        success: false, 
        error: 'Este expediente no es de instalación' 
      });
    }
    
    if (!expediente.instalacion?.software?.length) {
      return res.status(400).json({ 
        success: false, 
        error: 'No hay software definido para instalar' 
      });
    }
    
    if (expediente.instalacion?.estado === 'instalando') {
      return res.status(400).json({ 
        success: false, 
        error: 'Ya hay una instalación en progreso' 
      });
    }

    // Validar credenciales SSH antes de intentar conectar
    const srv = expediente.servidor;
    if (!srv?.ip || !srv?.ip.trim()) {
      return res.status(400).json({ success: false, error: 'El expediente no tiene IP de servidor configurada' });
    }
    if (!srv?.password || !srv?.password.trim()) {
      return res.status(400).json({ success: false, error: 'El expediente no tiene contraseña SSH configurada' });
    }

    const validacionConfig = validarConfiguracionPack(expediente);
    if (!validacionConfig.ok) {
      return res.status(400).json({ success: false, error: validacionConfig.error });
    }
    
    const resultado = await instalacionService.iniciarInstalacion(id);
    
    res.json(resultado);
    
  } catch (error) {
    console.error('Error iniciando instalación:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Reintentar instalación fallida (sin crear nuevo expediente)
router.post('/:id/reintentar', async (req, res) => {
  try {
    const { id } = req.params;

    const expediente = await Expediente.findById(id);
    if (!expediente) {
      return res.status(404).json({ success: false, error: 'Expediente no encontrado' });
    }

    const estadoActual = expediente.instalacion?.estado;
    if (!['fallo', 'rollback'].includes(estadoActual)) {
      return res.status(400).json({
        success: false,
        error: `Solo se puede reintentar una instalación en estado 'fallo' o 'rollback' (actual: ${estadoActual})`
      });
    }

    const srv = expediente.servidor;
    if (!srv?.ip || !srv?.ip.trim()) {
      return res.status(400).json({ success: false, error: 'El expediente no tiene IP de servidor configurada' });
    }
    if (!srv?.password || !srv?.password.trim()) {
      return res.status(400).json({ success: false, error: 'El expediente no tiene contraseña SSH configurada' });
    }

    const validacionConfig = validarConfiguracionPack(expediente);
    if (!validacionConfig.ok) {
      return res.status(400).json({ success: false, error: validacionConfig.error });
    }

    const resultado = await instalacionService.reintentar(id);
    res.json(resultado);

  } catch (error) {
    console.error('Error reintentando instalación:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
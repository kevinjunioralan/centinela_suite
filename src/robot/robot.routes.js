// backend/src/robot/robot.routes.js
const express = require('express');
const router = express.Router();

// Importar servicios
const RobotSimulacionService = require('./RobotSimulacionService');
const RobotMixService = require('./RobotMixService');
const RobotDemoInstalacionService = require('./RobotDemoInstalacionService');

// Inicializar servicios
const robotSimulacion = new RobotSimulacionService();
const robotMix = new RobotMixService();
const robotDemoInstalacion = new RobotDemoInstalacionService();

// Importar todos los servicios adicionales
const RobotRedService = require('./RobotRedService');
const RobotBDService = require('./RobotBDService');
const RobotSeguridadService = require('./RobotSeguridadService');
const RobotContenedoresService = require('./RobotContenedoresService');
const RobotBackupService = require('./RobotBackupService');
const RobotHardwareService = require('./RobotHardwareService');

// Inicializar servicios adicionales
const robotRed = new RobotRedService();
const robotBD = new RobotBDService();
const robotSeguridad = new RobotSeguridadService();
const robotContenedores = new RobotContenedoresService();
const robotBackup = new RobotBackupService();
const robotHardware = new RobotHardwareService();
const generadoresActivos = new Map();

// ============ ROBOT RED ============
router.post('/red/iniciar', async (req, res) => {
  try {
    const resultado = await robotRed.iniciarSimulacion(req.body);
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/red/:id/detener', async (req, res) => {
  try {
    const resultado = await robotRed.detenerSimulacion(req.params.id);
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/red/listar', async (req, res) => {
  try {
    const resultado = await robotRed.listarSimulaciones();
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/red/:id/logs', (req, res) => {
  robotRed.sseStreams.set(req.params.id, res);
  req.on('close', () => robotRed.sseStreams.delete(req.params.id));
});

// ============ ROBOT BASE DE DATOS ============
router.post('/bd/iniciar', async (req, res) => {
  try {
    const resultado = await robotBD.iniciarSimulacion(req.body);
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/bd/:id/detener', async (req, res) => {
  try {
    const resultado = await robotBD.detenerSimulacion(req.params.id);
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/bd/listar', async (req, res) => {
  try {
    const resultado = await robotBD.listarSimulaciones();
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ ROBOT SEGURIDAD ============
router.post('/seguridad/iniciar', async (req, res) => {
  try {
    const resultado = await robotSeguridad.iniciarSimulacion(req.body);
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/seguridad/:id/detener', async (req, res) => {
  try {
    const resultado = await robotSeguridad.detenerSimulacion(req.params.id);
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/seguridad/listar', async (req, res) => {
  try {
    const resultado = await robotSeguridad.listarSimulaciones();
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ ROBOT CONTENEDORES ============
router.post('/contenedores/iniciar', async (req, res) => {
  try {
    const resultado = await robotContenedores.iniciarSimulacion(req.body);
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/contenedores/:id/detener', async (req, res) => {
  try {
    const resultado = await robotContenedores.detenerSimulacion(req.params.id);
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/contenedores/listar', async (req, res) => {
  try {
    const resultado = await robotContenedores.listarSimulaciones();
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ ROBOT BACKUP ============
router.post('/backup/iniciar', async (req, res) => {
  try {
    const resultado = await robotBackup.iniciarSimulacion(req.body);
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/backup/:id/detener', async (req, res) => {
  try {
    const resultado = await robotBackup.detenerSimulacion(req.params.id);
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/backup/listar', async (req, res) => {
  try {
    const resultado = await robotBackup.listarSimulaciones();
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ ROBOT HARDWARE ============
router.post('/hardware/iniciar', async (req, res) => {
  try {
    const resultado = await robotHardware.iniciarSimulacion(req.body);
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/hardware/:id/detener', async (req, res) => {
  try {
    const resultado = await robotHardware.detenerSimulacion(req.params.id);
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/hardware/listar', async (req, res) => {
  try {
    const resultado = await robotHardware.listarSimulaciones();
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ SIMULACIÓN 24/7 ============

// Iniciar simulación
router.post('/simulacion/iniciar', async (req, res) => {
  try {
    const resultado = await robotSimulacion.iniciarSimulacion(req.body);
    res.json(resultado);
  } catch (error) {
    console.error('Error iniciando simulación:', error);
    res.status(500).json({ error: error.message });
  }
});

// Pausar simulación
router.post('/simulacion/:id/pausar', async (req, res) => {
  try {
    const resultado = await robotSimulacion.pausarSimulacion(req.params.id);
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reanudar simulación
router.post('/simulacion/:id/reanudar', async (req, res) => {
  try {
    const resultado = await robotSimulacion.reanudarSimulacion(req.params.id);
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Detener simulación
router.post('/simulacion/:id/detener', async (req, res) => {
  try {
    const resultado = await robotSimulacion.detenerSimulacion(req.params.id);
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Listar simulaciones
router.get('/simulacion/listar', async (req, res) => {
  try {
    const resultado = await robotSimulacion.listarSimulaciones();
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Detalle de simulación
router.get('/simulacion/:id', async (req, res) => {
  try {
    const resultado = await robotSimulacion.obtenerDetalle(req.params.id);
    if (!resultado) {
      return res.status(404).json({ error: 'Simulación no encontrada' });
    }
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Estadísticas globales
router.get('/simulacion/estadisticas', async (req, res) => {
  try {
    const resultado = await robotSimulacion.obtenerEstadisticas();
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ ROBOT MIX ============

// Iniciar Robot Mix
router.post('/mix/iniciar', async (req, res) => {
  try {
    const { servidor, packs, pausaEntreCiclos, detenerEnError, aleatorio } = req.body;
    
    const packsNormalizados = packs.map(p => ({
      id: p.id,
      nombre: p.nombre,
      ciclos: p.ciclos
    }));
    
    const resultado = await robotMix.iniciarMix({
      packs: packsNormalizados,
      servidor,
      pausaEntreCiclos: pausaEntreCiclos || 5,
      detenerEnError: detenerEnError !== false,
      aleatorio: aleatorio || false
    });
    
    res.json({ success: true, data: resultado });
  } catch (error) {
    console.error('Error iniciando Robot Mix:', error);
    res.status(500).json({ error: error.message });
  }
});

// Detener Robot Mix
router.post('/mix/:mixerId/detener', async (req, res) => {
  try {
    const resultado = robotMix.detenerMix(req.params.mixerId);
    res.json({ success: true, data: resultado });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obtener estado de un Mix
router.get('/mix/:mixerId/estado', async (req, res) => {
  try {
    const resultado = robotMix.obtenerEstado(req.params.mixerId);
    if (!resultado) {
      return res.status(404).json({ error: 'Mix no encontrado' });
    }
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// SSE para logs del Robot Mix
router.get('/mix/:mixerId/stream', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  const conectado = robotMix.conectarStream(req.params.mixerId, res);
  if (!conectado) {
    res.write(`data: ${JSON.stringify({
      hora: new Date().toLocaleTimeString(),
      tipo: 'error',
      mensaje: 'Mix no encontrado'
    })}\n\n`);
    res.end();
    return;
  }

  req.on('close', () => {
    robotMix.desconectarStream(req.params.mixerId, res);
    res.end();
  });
});

// Listar mixes activos
router.get('/mix/activos', async (req, res) => {
  try {
    const activos = robotMix.obtenerMixersActivos();
    const historial = robotMix.obtenerMixersHistorial();
    res.json({ success: true, activos, historial });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ DEMO INSTALACION CICLICA ============

router.post('/demo/iniciar', async (req, res) => {
  try {
    const resultado = await robotDemoInstalacion.iniciarDemo(req.body || {});
    res.json({ success: true, data: resultado });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/demo/:id/detener', async (req, res) => {
  try {
    const detenido = robotDemoInstalacion.detenerDemo(req.params.id);
    if (!detenido) {
      return res.status(404).json({ success: false, error: 'Demo no encontrada' });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/demo/activos', async (req, res) => {
  try {
    const demos = robotDemoInstalacion.listarActivas();
    res.json({ success: true, data: demos });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/demo/:id/estado', async (req, res) => {
  try {
    const estado = robotDemoInstalacion.obtenerEstado(req.params.id);
    if (!estado) {
      return res.status(404).json({ success: false, error: 'Demo no encontrada' });
    }
    res.json({ success: true, data: estado });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ GENERADOR DE DATOS (Instalación por Pack) ============
// Usa RobotDemoInstalacionService como motor — es el modelo probado y estable.

// Iniciar generador
router.post('/generador/iniciar', async (req, res) => {
  try {
    const { packId, packNombre, servidor, numCiclos } = req.body;

    if (!packId || !servidor?.ip || !servidor?.usuario || !servidor?.password) {
      return res.status(400).json({ success: false, error: 'Datos incompletos para iniciar el generador' });
    }

    const ciclosSolicitados = Number(numCiclos);
    const ciclos = Number.isFinite(ciclosSolicitados) && ciclosSolicitados > 0 ? ciclosSolicitados : 10;

    const resultado = await robotDemoInstalacion.iniciarDemo({
      servidor,
      secuencia: [packId],
      ciclosObjetivo: ciclos,
      pausaSegundos: 6
    });

    generadoresActivos.set(resultado.demoId, {
      demoId: resultado.demoId,
      packId,
      packNombre: packNombre || packId,
      creadoEn: new Date().toISOString()
    });

    res.json({
      success: true,
      data: {
        generadorId: resultado.demoId,
        demoId: resultado.demoId,
        totalCiclos: ciclos,
        packId,
        packNombre: packNombre || packId,
        servidor,
        numCiclos: ciclos
      }
    });
  } catch (error) {
    console.error('Error iniciando generador:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// SSE para logs del generador — polling sobre RobotDemoInstalacionService
router.get('/generador/:generadorId/stream', async (req, res) => {
  const ctx = generadoresActivos.get(req.params.generadorId);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  if (!ctx?.demoId) {
    res.write(`data: ${JSON.stringify({ mensaje: 'Generador no encontrado', tipo: 'error', completado: true, exitoso: false })}\n\n`);
    res.end();
    return;
  }

  const enviados = new Set();
  let cerrado = false;

  const cerrar = () => {
    if (cerrado) return;
    cerrado = true;
    clearInterval(intervalId);
    res.end();
  };

  const enviar = (payload) => {
    if (!cerrado) {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    }
  };

  const intervalId = setInterval(() => {
    const estado = robotDemoInstalacion.obtenerEstado(ctx.demoId);

    if (!estado) {
      enviar({ mensaje: 'Generador finalizado', tipo: 'info', completado: true, exitoso: true, mensajeFinal: 'Ciclos completados' });
      generadoresActivos.delete(req.params.generadorId);
      cerrar();
      return;
    }

    // Propagar logs nuevos
    (estado.logs || []).forEach((log) => {
      const key = `${log.hora}|${log.tipo}|${log.mensaje}`;
      if (enviados.has(key)) return;
      enviados.add(key);
      enviar({ hora: log.hora, mensaje: log.mensaje, tipo: log.tipo, completado: false });
    });

    // Detectar fin
    if (estado.estado !== 'ejecutando') {
      const exitoso = estado.estado === 'completado';
      const exitos = estado.resumen?.exitosos || 0;
      const fallos = estado.resumen?.fallidos || 0;
      enviar({
        mensaje: exitoso
          ? `✅ Generador completado: ${exitos} éxitos, ${fallos} fallos`
          : `⏹️ Generador finalizado: ${estado.estado}`,
        tipo: exitoso ? 'exito' : 'error',
        completado: true,
        exitoso,
        mensajeFinal: exitoso
          ? `Completado: ${exitos} ciclos exitosos de ${exitos + fallos}`
          : `Estado final: ${estado.estado}`
      });
      generadoresActivos.delete(req.params.generadorId);
      cerrar();
    }
  }, 1500);

  req.on('close', () => {
    clearInterval(intervalId);
  });
});

// ============ BANCO DE PRUEBAS (Robots configurados manualmente) ============

// Listar robots
router.get('/lista', async (req, res) => {
  try {
    res.json({ success: true, data: [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Crear robot
router.post('/', async (req, res) => {
  try {
    res.json({ success: true, data: { ...req.body, _id: Date.now() } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Iniciar robot
router.post('/:id/iniciar', async (req, res) => {
  try {
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Detener robot
router.post('/:id/detener', async (req, res) => {
  try {
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Eliminar robot
router.delete('/:id', async (req, res) => {
  try {
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ ESTADÍSTICAS ============

router.get('/estadisticas', async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        resumen: {
          totalCiclos: 0,
          totalExitosos: 0,
          totalFallidos: 0,
          totalMetricas: 0,
          totalAlertas: 0
        },
        statsPorPack: []
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/ciclos/recientes', async (req, res) => {
  try {
    res.json({ success: true, data: [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ 🆕 CONSOLA EN TIEMPO REAL ============

// SSE para consola en tiempo real de simulación 24/7
router.get('/simulacion/:id/consola', async (req, res) => {
  const { id } = req.params;
  
  // Configurar headers para SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  
  // Función para enviar logs al frontend
  const enviarLog = (mensaje, tipo = 'info') => {
    res.write(`data: ${JSON.stringify({ mensaje, tipo, timestamp: new Date().toISOString() })}\n\n`);
  };
  
  // Obtener la simulación activa del servicio
  const simulacionesActivas = robotSimulacion.getSimulacionesActivas();
  const simulacionMem = simulacionesActivas.get(id);
  
  if (!simulacionMem || !simulacionMem.ssh) {
    enviarLog('❌ Simulación no encontrada o SSH no conectado', 'error');
    res.end();
    return;
  }
  
  const ssh = simulacionMem.ssh;
  const expediente = simulacionMem.expediente;
  
  enviarLog(`🖥️ Conectado a ${expediente?.servidor?.ip || 'servidor'}`, 'exito');
  enviarLog(`📊 Monitorizando servidor en tiempo real...`, 'info');
  
  // Función auxiliar para ejecutar comandos SSH
  const ejecutarComando = (comando) => {
    return new Promise((resolve, reject) => {
      ssh.exec(comando, (err, stream) => {
        if (err) { reject(err); return; }
        let output = '';
        stream.on('data', (data) => { output += data.toString(); });
        stream.on('close', () => { resolve(output.trim()); });
      });
    });
  };
  
  // Comandos a ejecutar periódicamente
  const comandos = {
    cpu: `top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1`,
    ram: `free -m | awk 'NR==2{printf "%.0f", $3/$2*100}'`,
    disco: `df -h / | awk 'NR==2{print $5}' | cut -d'%' -f1`,
    conexiones: `ss -tun | grep ESTAB | wc -l`,
    procesos: `ps aux --sort=-%cpu | head -6 | tail -5 | awk '{print $11}' | cut -d'/' -f1 | head -3`
  };
  
  // Enviar métricas cada 5 segundos
  const interval = setInterval(async () => {
    try {
      const metricas = {};
      
      for (const [key, cmd] of Object.entries(comandos)) {
        try {
          const stdout = await ejecutarComando(cmd);
          metricas[key] = stdout || '0';
        } catch (e) {
          metricas[key] = '0';
        }
      }
      
      res.write(`data: ${JSON.stringify({ tipo: 'metricas', metricas, timestamp: new Date().toISOString() })}\n\n`);
      
    } catch (error) {
      console.error('Error obteniendo métricas:', error);
    }
  }, 5000);
  
  // Limpiar al cerrar
  req.on('close', () => {
    clearInterval(interval);
    enviarLog('🔌 Conexión cerrada', 'info');
    res.end();
  });
});

module.exports = router;
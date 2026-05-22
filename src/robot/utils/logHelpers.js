function registrarLog(simulacionId, mensaje, tipo, logsSimulacion, sseStreams, prefix) {
  const timestamp = new Date();
  const horaISO = timestamp.toISOString();
  const horaLocal = timestamp.toLocaleTimeString('es-ES');
  
  const log = {
    timestamp: horaISO,
    hora: horaLocal,
    mensaje,
    tipo: tipo || 'info',
    prefijo: prefix || 'ROBOT'
  };

  if (logsSimulacion && !logsSimulacion.has(simulacionId)) {
    logsSimulacion.set(simulacionId, []);
  }

  if (logsSimulacion) {
    logsSimulacion.get(simulacionId).push(log);
  }

  const stream = sseStreams ? sseStreams.get(simulacionId) : null;
  if (stream) {
    try {
      stream.write(`data: ${JSON.stringify(log)}\n\n`);
    } catch (err) {
      console.error(`❌ Error escribiendo a stream: ${err.message}`);
    }
  }

  const tipoEmoji = {
    'info': '📟',
    'exito': '✅',
    'error': '❌',
    'warning': '⚠️',
    'debug': '🐛'
  }[tipo] || '📟';

  console.log(`${tipoEmoji} [${prefix || 'ROBOT'} ${simulacionId?.slice(-6) || 'temp'}] ${mensaje}`);
  return log;
}

function obtenerLogs(simulacionId, logsSimulacion) {
  return logsSimulacion?.get(simulacionId) || [];
}

// Niveles de log estandarizados
const NIVELES_LOG = {
  debug: 0,
  info: 1,
  warning: 2,
  exito: 1,
  error: 3
};

module.exports = {
  registrarLog,
  obtenerLogs,
  NIVELES_LOG
};
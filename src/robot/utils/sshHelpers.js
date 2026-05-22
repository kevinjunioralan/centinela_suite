const { Client } = require('ssh2');

function conectarSSH(simulacionId, servidor, conexionesSSH, enviarLog, etiqueta = 'ROBOT') {
  return new Promise((resolve, reject) => {
    let intentos = 0;
    const maxIntentos = 3;
    const tiempoBaseMs = 2000;

    const intentarConexion = () => {
      intentos++;
      const ssh = new Client();

      ssh.on('ready', () => {
        console.log(`🔌 [${etiqueta}] SSH conectado a ${servidor.ip} (intento ${intentos})`);
        if (conexionesSSH) {
          conexionesSSH.set(simulacionId, ssh);
        }
        if (typeof enviarLog === 'function') {
          enviarLog(simulacionId, `✅ Conexión SSH establecida con ${servidor.ip}`, 'exito');
        }
        resolve(ssh);
      });

      ssh.on('error', (err) => {
        if (intentos < maxIntentos) {
          const tiempoEspera = tiempoBaseMs * Math.pow(2, intentos - 1);
          console.log(`⚠️ [${etiqueta}] Intento ${intentos} falló, reintentando en ${tiempoEspera}ms...`);
          if (typeof enviarLog === 'function') {
            enviarLog(simulacionId, `⚠️ Intento ${intentos} falló, reintentando en ${tiempoEspera / 1000}s...`, 'warning');
          }
          setTimeout(intentarConexion, tiempoEspera);
        } else {
          if (typeof enviarLog === 'function') {
            enviarLog(simulacionId, `❌ Error SSH tras ${maxIntentos} intentos: ${err.message}`, 'error');
          }
          reject(err);
        }
      });

      ssh.connect({
        host: servidor.ip,
        port: servidor.puerto || 22,
        username: servidor.usuario,
        password: servidor.password,
        readyTimeout: 30000,
        tryKeyboard: false
      });
    };

    intentarConexion();
  });
}

function ejecutarComandoSSH(ssh, comando, timeout = 15000) {
  return new Promise((resolve, reject) => {
    let timeoutId = null;
    let output = '';

    ssh.exec(comando, (err, stream) => {
      if (err) {
        reject(new Error(`Error ejecutando comando: ${err.message}`));
        return;
      }

      // Timeout para comandos que tardan demasiado
      timeoutId = setTimeout(() => {
        stream.destroy();
        reject(new Error(`Comando ejecutado timeout (${timeout}ms): ${comando.substring(0, 50)}...`));
      }, timeout);

      stream.on('data', (data) => { output += data.toString(); });
      stream.stderr.on('data', (data) => { output += data.toString(); });
      stream.on('close', (code) => {
        clearTimeout(timeoutId);
        if (code === 0 || code === null) {
          resolve(output.trim());
        } else {
          // Si el comando devuelve error pero hay output, igual lo retorna (para comandos condicionales)
          resolve(output.trim());
        }
      });
    });
  });
}

module.exports = {
  conectarSSH,
  ejecutarComandoSSH
};
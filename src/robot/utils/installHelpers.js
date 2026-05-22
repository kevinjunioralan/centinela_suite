function construirComandoInstalacion(paquetes) {
  const lista = Array.isArray(paquetes) ? paquetes : [paquetes];
  const opciones = '-o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold"';
  return `DEBIAN_FRONTEND=noninteractive apt-get install -y ${opciones} ${lista.join(' ')}`;
}

async function actualizarRepositorios(ssh, ejecutarComandoSSH, simulacionId, enviarLog) {
  if (typeof enviarLog === 'function') {
    enviarLog(simulacionId, '📦 Actualizando repositorios...', 'info');
  }

  await ejecutarComandoSSH(ssh, 'apt-get update -y');
}

module.exports = {
  construirComandoInstalacion,
  actualizarRepositorios
};
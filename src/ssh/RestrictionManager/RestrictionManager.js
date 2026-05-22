// RestrictionManager.js - Control de acceso y restricciones SSH
class RestrictionManager {
  constructor() {
    this.comandosBasicos = new Set([
      'ls', 'pwd', 'whoami', 'date', 'hostname', 'uptime', 'df -h',
      'free -h', 'ps aux', 'top -bn1', 'netstat -tuln', 'ss -tuln',
      'cat /etc/os-release', 'uname -a', 'lscpu', 'lsblk', 'ip a',
      'ping -c 4', 'traceroute'
    ]);
    
    this.comandosAvanzados = new Set([
      'find', 'grep', 'awk', 'sed', 'tail', 'head', 'wc', 'sort', 'uniq',
      'systemctl status', 'journalctl -n 50', 'dmesg | tail -n 50', 'df -i'
    ]);
    
    this.comandosProhibidos = new Set([
      'rm', 'mv', 'cp', 'dd', 'mkfs', 'fdisk', 'kill', 'pkill', 'killall',
      'shutdown', 'reboot', 'halt', 'poweroff', 'chmod', 'chown', 'chroot',
      'sudo', 'su', 'passwd', 'useradd', 'userdel', 'ssh', 'scp', 'sftp',
      'curl', 'wget', 'nc', 'nmap', 'mount', 'umount', 'iptables'
    ]);
  }

  validarComando(comando, nivel = 'basico') {
    const comandoLimpio = comando.trim().replace(/\s+/g, ' ');
    const comandoBase = comandoLimpio.split(/\s+/)[0];
    
    if (this.comandosProhibidos.has(comandoBase)) {
      return { permitido: false, razon: `Comando prohibido: ${comandoBase}`, nivel: 'critico' };
    }
    
    const caracteresPeligrosos = /[;&|`$(){}[\]<>?*]/;
    if (caracteresPeligrosos.test(comandoLimpio)) {
      return { permitido: false, razon: 'Caracteres no permitidos', nivel: 'alto' };
    }
    
    if (nivel === 'basico') {
      let permitido = false;
      for (const cmd of this.comandosBasicos) {
        if (comandoLimpio === cmd || comandoLimpio.startsWith(cmd + ' ')) {
          permitido = true;
          break;
        }
      }
      
      if (!permitido) {
        return { permitido: false, razon: `Comando no permitido: ${comandoBase}`, nivel: 'medio' };
      }
    }
    
    return { permitido: true, razon: 'Comando autorizado' };
  }

  verificarLimitesSesion(sesion) {
    const ahora = Date.now();
    const errores = [];
    
    if (sesion.inicio && (ahora - sesion.inicio) > 30 * 60 * 1000) {
      errores.push('Sesión excedió tiempo máximo (30 minutos)');
    }
    
    if (sesion.ultimaActividad && (ahora - sesion.ultimaActividad) > 5 * 60 * 1000) {
      errores.push('Sesión inactiva por más de 5 minutos');
    }
    
    if (sesion.comandosEjecutados >= 100) {
      errores.push('Se excedió el límite de 100 comandos por sesión');
    }
    
    const ultimoMinuto = sesion.comandosPorMinuto?.filter(t => ahora - t < 60000) || [];
    if (ultimoMinuto.length >= 10) {
      errores.push('Demasiados comandos en el último minuto (máximo 10)');
    }
    
    return { valida: errores.length === 0, errores };
  }

  generarRestrictedShell(expedienteId, nivel = 'basico') {
    const comandosPermitidos = nivel === 'basico' 
      ? Array.from(this.comandosBasicos)
      : [...Array.from(this.comandosBasicos), ...Array.from(this.comandosAvanzados)];
    
    return `#!/bin/bash
# Restricted Shell para expediente ${expedienteId}
RESTRICTED_PATH="/usr/local/bin:/bin:/usr/bin"
export PATH="\${RESTRICTED_PATH}"
PERMITIDOS="${comandosPermitidos.join(' ')}"
echo "🔒 Shell restringido - Expediente ${expedienteId}"
while read -p "$ " cmd; do
    if [ -z "$cmd" ]; then continue; fi
    if [ "$cmd" = "exit" ] || [ "$cmd" = "quit" ]; then
        echo "👋 Sesión finalizada"
        exit 0
    fi
    base_cmd=$(echo "$cmd" | awk '{print $1}')
    if echo "$PERMITIDOS" | grep -qw "$base_cmd"; then
        eval "$cmd"
    else
        echo "❌ Comando no permitido: $base_cmd"
    fi
    echo ""
done
exit 0`;
  }

  generarAuthorizedKeys(publicKey, expedienteId, nivel = 'basico') {
    const opciones = [
      'no-port-forwarding',
      'no-X11-forwarding',
      'no-agent-forwarding',
      'no-pty',
      `command="/usr/local/bin/rbash-exp-${expedienteId}"`
    ];
    
    return `${opciones.join(',')} ${publicKey}`;
  }
}

module.exports = RestrictionManager;
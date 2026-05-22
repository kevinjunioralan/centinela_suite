// DiagnosticoService.js - Versión completa
class DiagnosticoService {
  constructor(sshManager) {
    this.sshManager = sshManager;
  }

  async ejecutarDiagnostico(expedienteId) {
    console.log(`🔬 Iniciando diagnóstico para expediente ${expedienteId}`);
    
    const resultado = {
      fecha: new Date(),
      inventario: {
        sistema: { os: null, kernel: null, hostname: null },
        usuarios: 0,
        servicios: [],
        puertosAbiertos: [],
        webservers: [],
        databases: [],
        paquetesInstalados: 0
      },
      metricas: {
        cpu: { uso: 0, carga: null, nucleos: 0 },
        memoria: { uso: null, porcentaje: 0, swap: null },
        disco: { uso: null, porcentaje: 0, inodos: null },
        red: { interfaces: 0, conexiones: 0 },
        errores: { kernel: 0, loginFallidos: 0, serviciosFallidos: 0 }
      },
      alertas: [],
      score: 100
    };
    
    // ==================== INVENTARIO ====================
    
    // Hostname
    const hostnameResult = await this.sshManager.ejecutarComandoSeguro(expedienteId, "hostname");
    if (hostnameResult.success && hostnameResult.salida) {
      resultado.inventario.sistema.hostname = hostnameResult.salida;
    }
    
    // Kernel
    const unameResult = await this.sshManager.ejecutarComandoSeguro(expedienteId, "uname -a");
    if (unameResult.success && unameResult.salida) {
      resultado.inventario.sistema.kernel = unameResult.salida;
    }
    
    // Sistema Operativo
    const osResult = await this.sshManager.ejecutarComandoSeguro(expedienteId, "cat /etc/os-release | grep PRETTY_NAME");
    if (osResult.success && osResult.salida) {
      const match = osResult.salida.match(/PRETTY_NAME="(.+)"/);
      if (match) resultado.inventario.sistema.os = match[1];
    }
    
    // Usuarios
    const usuariosResult = await this.sshManager.ejecutarComandoSeguro(expedienteId, "cat /etc/passwd | grep -E '/home|/root' | wc -l");
    if (usuariosResult.success && usuariosResult.salida) {
      resultado.inventario.usuarios = parseInt(usuariosResult.salida) || 0;
    }
    
    // Paquetes instalados (solo conteo)
    const paquetesResult = await this.sshManager.ejecutarComandoSeguro(expedienteId, "dpkg -l 2>/dev/null | grep '^ii' | wc -l");
    if (paquetesResult.success && paquetesResult.salida) {
      resultado.inventario.paquetesInstalados = parseInt(paquetesResult.salida) || 0;
    }
    
    // Puertos abiertos
    const puertosResult = await this.sshManager.ejecutarComandoSeguro(expedienteId, "ss -tuln | awk 'NR>1 {print $5}' | cut -d: -f2 | sort -n | uniq");
    if (puertosResult.success && puertosResult.salida) {
      resultado.inventario.puertosAbiertos = puertosResult.salida.split('\n')
        .filter(p => p && !isNaN(p) && p !== '')
        .map(Number);
    }
    
    // Servicios activos (top 10)
    const serviciosResult = await this.sshManager.ejecutarComandoSeguro(expedienteId, "systemctl list-units --type=service --state=running --no-legend 2>/dev/null | head -10 | awk '{print $1}'");
    if (serviciosResult.success && serviciosResult.salida) {
      resultado.inventario.servicios = serviciosResult.salida.split('\n').filter(s => s);
    }
    
    // Web servers
    const webServers = ['nginx', 'apache2', 'httpd'];
    for (const ws of webServers) {
      const result = await this.sshManager.ejecutarComandoSeguro(expedienteId, `systemctl is-active ${ws} 2>/dev/null`);
      if (result.success && result.salida === 'active') {
        resultado.inventario.webservers.push(ws);
      }
    }
    
    // Bases de datos
    const databases = ['mysql', 'postgresql', 'mongodb', 'redis'];
    for (const db of databases) {
      const result = await this.sshManager.ejecutarComandoSeguro(expedienteId, `systemctl is-active ${db} 2>/dev/null`);
      if (result.success && result.salida === 'active') {
        resultado.inventario.databases.push(db);
      }
    }
    
    // ==================== MÉTRICAS ====================
    
    // CPU
    const cpuResult = await this.sshManager.ejecutarComandoSeguro(expedienteId, "top -bn1 | grep 'Cpu(s)' | awk '{print $2}' | cut -d'%' -f1");
    if (cpuResult.success && cpuResult.salida) {
      resultado.metricas.cpu.uso = parseFloat(cpuResult.salida) || 0;
    }
    const cargaResult = await this.sshManager.ejecutarComandoSeguro(expedienteId, "uptime | awk -F'load average:' '{print $2}'");
    if (cargaResult.success && cargaResult.salida) {
      resultado.metricas.cpu.carga = cargaResult.salida.trim();
    }
    const nucleosResult = await this.sshManager.ejecutarComandoSeguro(expedienteId, "nproc");
    if (nucleosResult.success && nucleosResult.salida) {
      resultado.metricas.cpu.nucleos = parseInt(nucleosResult.salida) || 0;
    }
    
    // Memoria
    const memResult = await this.sshManager.ejecutarComandoSeguro(expedienteId, "free -h");
    if (memResult.success && memResult.salida) {
      const lines = memResult.salida.split('\n');
      const memLine = lines.find(l => l.includes('Mem:'));
      if (memLine) {
        const parts = memLine.trim().split(/\s+/);
        resultado.metricas.memoria.uso = `${parts[2]}/${parts[1]}`;
        const total = parseFloat(parts[1].replace('Gi', '').replace('Mi', ''));
        const usado = parseFloat(parts[2].replace('Gi', '').replace('Mi', ''));
        resultado.metricas.memoria.porcentaje = Math.round((usado / total) * 100);
      }
      const swapLine = lines.find(l => l.includes('Swap:'));
      if (swapLine) {
        const parts = swapLine.trim().split(/\s+/);
        resultado.metricas.memoria.swap = `${parts[2]}/${parts[1]}`;
      }
    }
    
    // Disco
    const diskResult = await this.sshManager.ejecutarComandoSeguro(expedienteId, "df -h /");
    if (diskResult.success && diskResult.salida) {
      const lines = diskResult.salida.split('\n');
      const diskLine = lines[1];
      if (diskLine) {
        const parts = diskLine.trim().split(/\s+/);
        resultado.metricas.disco.uso = parts[4];
        resultado.metricas.disco.porcentaje = parseInt(parts[4].replace('%', ''));
      }
    }
    const inodosResult = await this.sshManager.ejecutarComandoSeguro(expedienteId, "df -i / | awk 'NR==2 {print $5}'");
    if (inodosResult.success && inodosResult.salida) {
      resultado.metricas.disco.inodos = inodosResult.salida;
    }
    
    // Red
    const interfacesResult = await this.sshManager.ejecutarComandoSeguro(expedienteId, "ip -br link show | wc -l");
    if (interfacesResult.success && interfacesResult.salida) {
      resultado.metricas.red.interfaces = parseInt(interfacesResult.salida) || 0;
    }
    const conexionesResult = await this.sshManager.ejecutarComandoSeguro(expedienteId, "ss -s | grep 'TCP:' | awk '{print $2}'");
    if (conexionesResult.success && conexionesResult.salida) {
      resultado.metricas.red.conexiones = parseInt(conexionesResult.salida) || 0;
    }
    
    // Errores
    const kernelErrResult = await this.sshManager.ejecutarComandoSeguro(expedienteId, "dmesg | grep -i error | wc -l");
    if (kernelErrResult.success && kernelErrResult.salida) {
      resultado.metricas.errores.kernel = parseInt(kernelErrResult.salida) || 0;
    }
    const loginErrResult = await this.sshManager.ejecutarComandoSeguro(expedienteId, "grep 'Failed password' /var/log/auth.log 2>/dev/null | wc -l");
    if (loginErrResult.success && loginErrResult.salida) {
      resultado.metricas.errores.loginFallidos = parseInt(loginErrResult.salida) || 0;
    }
    const serviciosErrResult = await this.sshManager.ejecutarComandoSeguro(expedienteId, "systemctl --failed --no-legend 2>/dev/null | wc -l");
    if (serviciosErrResult.success && serviciosErrResult.salida) {
      resultado.metricas.errores.serviciosFallidos = parseInt(serviciosErrResult.salida) || 0;
    }
    
    // Calcular score
    let score = 100;
    if (resultado.metricas.cpu.uso > 80) score -= 20;
    else if (resultado.metricas.cpu.uso > 60) score -= 10;
    if (resultado.metricas.memoria.porcentaje > 90) score -= 25;
    else if (resultado.metricas.memoria.porcentaje > 75) score -= 15;
    if (resultado.metricas.disco.porcentaje > 90) score -= 20;
    else if (resultado.metricas.disco.porcentaje > 75) score -= 10;
    if (resultado.metricas.errores.serviciosFallidos > 0) score -= 10;
    if (resultado.metricas.errores.loginFallidos > 10) score -= 5;
    
    resultado.score = Math.max(0, Math.min(100, score));
    resultado.estado = resultado.score >= 80 ? "saludable" : (resultado.score >= 60 ? "atencion" : "critico");
    
    console.log(`✅ Diagnóstico completado. Score: ${resultado.score}/100`);
    console.log(`📊 Datos obtenidos:`, {
      hostname: resultado.inventario.sistema.hostname,
      os: resultado.inventario.sistema.os,
      usuarios: resultado.inventario.usuarios,
      paquetes: resultado.inventario.paquetesInstalados,
      puertos: resultado.inventario.puertosAbiertos,
      servicios: resultado.inventario.servicios.length,
      webservers: resultado.inventario.webservers,
      databases: resultado.inventario.databases,
      cpu: resultado.metricas.cpu.uso,
      memoria: resultado.metricas.memoria.uso,
      disco: resultado.metricas.disco.uso
    });
    
    return resultado;
  }
}

module.exports = DiagnosticoService;
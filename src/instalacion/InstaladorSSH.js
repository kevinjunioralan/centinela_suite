const { Client } = require('ssh2');

class InstaladorSSH {
  constructor(servidor) {
    this.servidor = servidor;
    this.client = null;
    this.lockRetryIntervalMs = Number(process.env.INSTALADOR_LOCK_RETRY_MS || 5000);
    this.lockRetryMaxWaitMs = Number(process.env.INSTALADOR_LOCK_MAX_WAIT_MS || (8 * 60 * 1000));
    this.precheckLockMaxWaitMs = Number(process.env.INSTALADOR_PRECHECK_LOCK_MAX_WAIT_MS || this.lockRetryMaxWaitMs);
    this.aptLockTimeoutSec = Number(process.env.INSTALADOR_APT_LOCK_TIMEOUT_SEC || 180);
  }

  async conectar() {
    return new Promise((resolve, reject) => {
      this.client = new Client();
      
      this.client.on('ready', () => {
        console.log(`SSH connected to ${this.servidor.ip}`);
        resolve();
      });
      
      this.client.on('error', (err) => {
        reject(err);
      });
      
      this.client.connect({
        host: this.servidor.ip,
        port: this.servidor.puerto || 22,
        username: this.servidor.usuario || 'root',
        password: this.servidor.password,
        readyTimeout: 30000
      });
    });
  }

  _comandoElevado(comando) {
    if (this.servidor.usuario === 'root') {
      return comando;
    }
    return `sudo -n ${comando}`;
  }

  _escaparComillasDobles(texto) {
    return String(texto || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  _normalizarPuerto(valor, fallback) {
    const numero = Number(valor);
    if (!Number.isInteger(numero)) return fallback;
    if (numero < 1 || numero > 65535) return fallback;
    return numero;
  }

  _normalizarPuertoLista(valores = []) {
    const lista = Array.isArray(valores) ? valores : [valores];
    const puertos = lista
      .map((valor) => this._normalizarPuerto(valor, null))
      .filter((valor) => Number.isInteger(valor));

    return [...new Set(puertos)];
  }

  _normalizarDominio(valor, fallback = 'localhost') {
    const limpio = String(valor || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9.-]/g, '');
    return limpio || fallback;
  }

  _normalizarHostname(valor, fallback = 'mail') {
    const limpio = String(valor || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]/g, '')
      .replace(/^-+/, '')
      .replace(/-+$/, '')
      .slice(0, 63);
    return limpio || fallback;
  }

  _normalizarIdentificadorDB(valor, fallback = 'centinela_app') {
    const limpio = String(valor || '')
      .trim()
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .replace(/^[^a-zA-Z_]+/, '')
      .slice(0, 63);

    return limpio || fallback;
  }

  _normalizarIPv4(valor, fallback = null) {
    const ip = String(valor || '').trim();
    const match = ip.match(/^(\d{1,3}\.){3}\d{1,3}$/);
    if (!match) return fallback;

    const partes = ip.split('.').map((parte) => Number(parte));
    if (partes.some((parte) => !Number.isInteger(parte) || parte < 0 || parte > 255)) {
      return fallback;
    }

    return partes.join('.');
  }

  _normalizarListaIPv4(valor, fallback = []) {
    const origen = Array.isArray(valor)
      ? valor
      : String(valor || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

    const normalizados = origen
      .map((item) => this._normalizarIPv4(item))
      .filter(Boolean);

    if (normalizados.length > 0) return normalizados;
    return fallback
      .map((item) => this._normalizarIPv4(item))
      .filter(Boolean);
  }

  async _exec(comando, timeout = 120000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout ejecutando comando después de ${timeout/1000}s: ${comando}`));
      }, timeout);
      
      this.client.exec(comando, (err, stream) => {
        if (err) {
          clearTimeout(timer);
          reject(err);
          return;
        }
        
        let stdout = '';
        let stderr = '';
        
        stream.on('data', (data) => {
          stdout += data.toString();
        });
        
        stream.stderr.on('data', (data) => {
          stderr += data.toString();
        });
        
        stream.on('close', (code) => {
          clearTimeout(timer);
          resolve({ stdout, stderr, code });
        });
      });
    });
  }

  async ejecutarComando(comando, timeout = 120000) {
    return this._exec(comando, timeout);
  }

  async ejecutarComandoPrivilegiado(comando, timeout = 120000) {
    return this._exec(this._comandoElevado(comando), timeout);
  }

  _esErrorBloqueoApt(mensaje) {
    const texto = String(mensaje || '').toLowerCase();
    return texto.includes('could not get lock') ||
      texto.includes('unable to acquire the dpkg frontend lock') ||
      texto.includes('dpkg frontend lock was locked by another process') ||
      texto.includes('locked by another process') ||
      texto.includes('is another process using it') ||
      texto.includes('waiting for cache lock') ||
      texto.includes('frontend lock') ||
      texto.includes('lock file') ||
      texto.includes('dpkg was interrupted');
  }

  _esPaqueteNoInstalado(mensaje) {
    const texto = String(mensaje || '').toLowerCase();
    return texto.includes('is not installed') || texto.includes('not installed, so not removed');
  }

  _esperar(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async _obtenerLocksAptActivos() {
    const comando = `bash -lc 'for f in /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/lib/apt/lists/lock /var/cache/apt/archives/lock; do
      if [ -e "$f" ]; then
        pids=$(fuser "$f" 2>/dev/null || true)
        if [ -n "$pids" ]; then
          for pid in $pids; do
            cmd=$(ps -p "$pid" -o args= 2>/dev/null | head -n 1 | tr -d "\\r")
            echo "$f|$pid|$cmd"
          done
        fi
      fi
    done'`;

    const resultado = await this.ejecutarComandoPrivilegiado(comando, 15000).catch(() => ({ stdout: '' }));
    const lineas = String(resultado.stdout || '')
      .split('\n')
      .map((linea) => linea.trim())
      .filter(Boolean);

    return lineas.map((linea) => {
      const [archivo, pid, ...resto] = linea.split('|');
      return {
        archivo,
        pid,
        comando: resto.join('|') || 'desconocido'
      };
    });
  }

  async _mitigarProcesosAptAutomaticos() {
    const comando = `bash -lc 'systemctl stop apt-daily.service apt-daily-upgrade.service >/dev/null 2>&1 || true;
      systemctl kill --kill-who=all apt-daily.service apt-daily-upgrade.service >/dev/null 2>&1 || true;
      pkill -f unattended-upgrade >/dev/null 2>&1 || true;
      pkill -f apt.systemd.daily >/dev/null 2>&1 || true'`;

    await this.ejecutarComandoPrivilegiado(comando, 20000).catch(() => null);
  }

  _formatearLocksApt(locks = []) {
    if (!Array.isArray(locks) || locks.length === 0) return 'sin detalles';
    return locks
      .slice(0, 4)
      .map((lock) => `${lock.archivo} pid=${lock.pid} cmd=${lock.comando}`)
      .join(' | ');
  }

  async _requiereAptFix() {
    const resultado = await this.ejecutarComandoPrivilegiado('bash -lc "dpkg --audit 2>/dev/null | head -n 20"', 15000)
      .catch(() => ({ stdout: '', code: 0 }));
    const salida = String(resultado.stdout || '').trim();
    return salida.length > 0;
  }

  _agregarTimeoutLockApt(comando) {
    const texto = String(comando || '');
    if (!texto.includes('apt-get')) return texto;
    if (texto.includes('DPkg::Lock::Timeout=')) return texto;
    return texto.replace('apt-get ', `apt-get -o DPkg::Lock::Timeout=${this.aptLockTimeoutSec} `);
  }

  _timeoutInstalacionPaquete(paquete) {
    const timeouts = {
      'mariadb-server': 25 * 60 * 1000,
      'postgresql': 18 * 60 * 1000,
      'mysql-server': 25 * 60 * 1000,
      'redis-server': 10 * 60 * 1000,
      'nginx': 8 * 60 * 1000,
      'postfix': 12 * 60 * 1000,
      'fail2ban': 14 * 60 * 1000,
      'nftables': 10 * 60 * 1000,
      'iptables-persistent': 10 * 60 * 1000,
      'dovecot-core': 12 * 60 * 1000,
      'dovecot-imapd': 12 * 60 * 1000,
      'dovecot-pop3d': 12 * 60 * 1000,
      'clamav-daemon': 20 * 60 * 1000,
      'bind9': 15 * 60 * 1000,
      'isc-dhcp-server': 12 * 60 * 1000,
      'samba': 15 * 60 * 1000,
      'krb5-kdc': 12 * 60 * 1000
    };

    return timeouts[paquete] || (10 * 60 * 1000);
  }

  async _ejecutarConRetryLock(comando, timeout = 120000, intentos = null) {
    const comandoFinal = this._agregarTimeoutLockApt(comando);
    let ultimoResultado = null;
    let intento = 0;
    const inicio = Date.now();

    while (true) {
      intento += 1;
      const resultado = await this.ejecutarComandoPrivilegiado(comandoFinal, timeout);
      if (resultado.code === 0) {
        return resultado;
      }

      ultimoResultado = resultado;
      const salida = `${resultado.stderr || ''}\n${resultado.stdout || ''}`;
      const esLock = this._esErrorBloqueoApt(salida);
      const maxPorIntentos = intentos ? intento >= intentos : false;
      const excedioEspera = (Date.now() - inicio) >= this.lockRetryMaxWaitMs;

      if (!esLock || maxPorIntentos || excedioEspera) {
        return resultado;
      }

      let lockInfo = '';
      if (intento === 1 || intento % 3 === 0) {
        const locks = await this._obtenerLocksAptActivos();
        lockInfo = ` | ${this._formatearLocksApt(locks)}`;
      }

      const transcurridoSeg = Math.round((Date.now() - inicio) / 1000);

      console.log(
        `APT/DPKG lock detectado. Reintento ${intento} ` +
        `(transcurrido ${transcurridoSeg}s / max ${Math.round(this.lockRetryMaxWaitMs / 1000)}s) ` +
        `para comando: ${comandoFinal}${lockInfo}`
      );
      await this._esperar(this.lockRetryIntervalMs);
    }

    return ultimoResultado;
  }

  async registrarEventoRobot(cycleId, accion) {
    const correlacion = cycleId || `cycle-${Date.now()}`;
    const mensaje = `[ROBOT][${correlacion}] ${accion}`;
    const comandoLogger = `logger -t centinela-robot \"${this._escaparComillasDobles(mensaje)}\"`;
    await this._exec(comandoLogger, 15000);
    return mensaje;
  }

  async verificarSudoNoInteractivo() {
    if (this.servidor.usuario === 'root') {
      return true;
    }

    const resultado = await this._exec('sudo -n true', 10000);
    if (resultado.code !== 0) {
      throw new Error(
        `SUDO_NOPASSWD_REQUIRED para usuario '${this.servidor.usuario}'. ` +
        'Ejecuta backend/scripts/setup-ubuntu-robot.sh en la VM Ubuntu con ese usuario.'
      );
    }

    return true;
  }

  async verificarInternet() {
    try {
      const { stdout, code } = await this.ejecutarComando('ping -c 2 8.8.8.8', 30000);
      if (code !== 0) {
        throw new Error('No hay conexión a internet');
      }
      return true;
    } catch (error) {
      throw new Error(`Error de conectividad: ${error.message}`);
    }
  }

  async verificarEspacio() {
    const { stdout, code } = await this.ejecutarComando("df -BG / | tail -1 | awk '{print $4}' | tr -d 'G'");
    
    if (code !== 0) {
      throw new Error('No se pudo verificar el espacio en disco');
    }
    
    const espacioLibre = parseInt(stdout.trim());
    if (isNaN(espacioLibre) || espacioLibre < 5) {
      throw new Error(`Espacio insuficiente: ${espacioLibre || 0}GB disponibles (mínimo 5GB)`);
    }

    return espacioLibre;
  }

  async sanearEstadoDpkg() {
    // Cortamos apt automáticos y esperamos lock libre con diagnóstico de PID/command.
    await this._mitigarProcesosAptAutomaticos();

    const maxEsperaLockMs = this.precheckLockMaxWaitMs;
    const inicio = Date.now();
    let locksActivos = [];

    while ((Date.now() - inicio) < maxEsperaLockMs) {
      locksActivos = await this._obtenerLocksAptActivos();
      if (locksActivos.length === 0) {
        break;
      }

      const transcurridoSeg = Math.round((Date.now() - inicio) / 1000);
      console.log(
        `[InstaladorSSH] lock apt/dpkg activo (${transcurridoSeg}s): ` +
        this._formatearLocksApt(locksActivos)
      );
      await this._esperar(5000);
    }

    if (locksActivos.length > 0) {
      throw new Error(
        `Lock apt/dpkg no liberado tras ${Math.round((Date.now() - inicio) / 1000)}s. ` +
        `Procesos bloqueando: ${this._formatearLocksApt(locksActivos)}`
      );
    }

    // Recupera dpkg interrumpido antes de cualquier operación apt
    const dpkgFix = await this._ejecutarConRetryLock('dpkg --configure -a', 180000);
    if (dpkgFix.code !== 0) {
      const salida = `${dpkgFix.stderr || ''} ${dpkgFix.stdout || ''}`;
      // Si es un error de lock después de todos los reintentos, lanzar error descriptivo
      if (this._esErrorBloqueoApt(salida)) {
        const locks = await this._obtenerLocksAptActivos();
        throw new Error(
          `dpkg lock ocupado por otro proceso tras ${Math.round((Date.now() - inicio) / 1000)}s de espera. ` +
          `Detalle: ${this._formatearLocksApt(locks)}`
        );
      }
      throw new Error(`Error saneando dpkg: ${dpkgFix.stderr || dpkgFix.stdout}`);
    }

    const requiereAptFix = await this._requiereAptFix();
    if (requiereAptFix) {
      const aptFix = await this._ejecutarConRetryLock('apt-get -f install -y -q', 10 * 60 * 1000);
      if (aptFix.code !== 0) {
        throw new Error(`Error corrigiendo dependencias: ${aptFix.stderr || aptFix.stdout}`);
      }
    }
  }

  async actualizarRepositorios() {
    await this.sanearEstadoDpkg();
    const resultado = await this._ejecutarConRetryLock('apt-get update -y', 180000);
    if (resultado.code !== 0) {
      throw new Error(`Error actualizando repositorios: ${resultado.stderr || resultado.stdout}`);
    }
    return resultado;
  }

  async configurarPostfixNoInteractivo() {
    const cfg = this.configuracionPack || {};
    const dominio = String(cfg.general?.dominio || cfg.dominio || 'localhost').trim() || 'localhost';
    const hostname = String(cfg.general?.hostname || 'mail').trim() || 'mail';
    const mailname = dominio;
    const rootAddress = String(cfg.general?.adminEmail || cfg.general?.postmaster || `root@${dominio}`).trim();
    const destinoPrincipal = `${hostname}.${dominio}`;

    const preseed = [
      'postfix postfix/main_mailer_type select No configuration',
      `postfix postfix/mailname string ${mailname}`,
      `postfix postfix/destinations string localhost, ${destinoPrincipal}`,
      `postfix postfix/root_address string ${rootAddress}`,
      'postfix postfix/protocols select all'
    ].join('\n');
    await this.ejecutarComandoPrivilegiado(`printf '%s\n' '${preseed.replace(/'/g, "'\\''")}' | debconf-set-selections`);
  }

  async configurarPostfixPackCorreo() {
    const cfg = this.configuracionPack || {};
    const dominio = this._normalizarDominio(cfg.general?.dominio || cfg.dominio, 'localhost');
    const hostname = this._normalizarHostname(cfg.general?.hostname, 'mail');
    const hostCompleto = `${hostname}.${dominio}`;
    const puertoSmtp = this._normalizarPuerto(cfg.postfix?.puerto, 25);

    const adminEmailRaw = String(cfg.general?.adminEmail || cfg.general?.postmaster || '').trim();
    const adminEmail = /.+@.+\..+/.test(adminEmailRaw)
      ? adminEmailRaw
      : `postmaster@${dominio}`;

    const tamanoMb = Number(cfg.postfix?.tamanoMaximo);
    const maxSizeBytes = Number.isFinite(tamanoMb) && tamanoMb > 0
      ? Math.round(tamanoMb * 1024 * 1024)
      : 26214400;

    const comando = `bash -lc '\
      postconf -e "myhostname = ${hostCompleto}";\
      postconf -e "mydomain = ${dominio}";\
      postconf -e "mydestination = localhost, ${hostCompleto}";\
      postconf -e "inet_interfaces = all";\
      postconf -e "inet_protocols = all";\
      postconf -e "smtpd_banner = $myhostname ESMTP";\
      postconf -e "mailbox_size_limit = 0";\
      postconf -e "message_size_limit = ${maxSizeBytes}";\
      postconf -e "alias_maps = hash:/etc/aliases";\
      postconf -e "alias_database = hash:/etc/aliases";\
      postalias /etc/aliases || true;\
      if [ ! -f /etc/aliases ] || ! grep -q "^root:" /etc/aliases; then echo "root: ${adminEmail}" >> /etc/aliases; fi;\
      if [ "${puertoSmtp}" != "25" ]; then\
        awk -v p="${puertoSmtp}" "BEGIN{done=0} { if(!done && $1==\"smtp\" && $2==\"inet\") { $1=p; done=1 } print }" /etc/postfix/master.cf > /tmp/master.cf.centinela && mv /tmp/master.cf.centinela /etc/postfix/master.cf;\
      fi;\
      postfix check && systemctl restart postfix\
    '`;

    const resultado = await this.ejecutarComandoPrivilegiado(comando, 120000);
    if (resultado.code !== 0) {
      throw new Error(`Error aplicando configuracion postfix pack_correo: ${resultado.stderr || resultado.stdout}`);
    }
  }

  async configurarDovecotPackCorreo() {
    const cfg = this.configuracionPack || {};
    const puertoImap = this._normalizarPuerto(cfg.dovecot?.puertoImap, 143);
    const sslHabilitado = cfg.dovecot?.ssl !== false;
    const sslMode = sslHabilitado ? 'required' : 'no';

    const comando = `bash -lc '\
      conf_master="/etc/dovecot/conf.d/10-master.conf";\
      conf_ssl="/etc/dovecot/conf.d/10-ssl.conf";\
      if [ -f "$conf_master" ]; then\
        sed -i -E "0,/port = [0-9]+/s//port = ${puertoImap}/" "$conf_master";\
      fi;\
      if [ -f "$conf_ssl" ]; then\
        sed -i -E "s/^\s*ssl\s*=.*/ssl = ${sslMode}/" "$conf_ssl";\
      fi;\
      dovecot -n >/dev/null 2>&1 && systemctl restart dovecot\
    '`;

    const resultado = await this.ejecutarComandoPrivilegiado(comando, 120000);
    if (resultado.code !== 0) {
      throw new Error(`Error aplicando configuracion dovecot pack_correo: ${resultado.stderr || resultado.stdout}`);
    }
  }

  async configurarFail2banPackCortafuegos() {
    const cfg = this.configuracionPack || {};
    const maxIntentos = Number(cfg.fail2ban?.maxIntentos);
    const tiempoBan = Number(cfg.fail2ban?.tiempoBan);

    const maxretry = Number.isInteger(maxIntentos) && maxIntentos >= 1 && maxIntentos <= 50
      ? maxIntentos
      : 5;
    const bantime = Number.isInteger(tiempoBan) && tiempoBan >= 60 && tiempoBan <= 86400
      ? tiempoBan
      : 600;

    const comando = `bash -lc '\
      mkdir -p /etc/fail2ban/jail.d;\
      cat > /etc/fail2ban/jail.d/centinela.local <<"EOF"\
[DEFAULT]\
bantime = ${bantime}\
findtime = 600\
maxretry = ${maxretry}\
\
[sshd]\
enabled = true\
port = ssh\
logpath = /var/log/auth.log\
backend = systemd\
EOF\
      fail2ban-client -d >/dev/null 2>&1 && systemctl restart fail2ban\
    '`;

    const resultado = await this.ejecutarComandoPrivilegiado(comando, 120000);
    if (resultado.code !== 0) {
      throw new Error(`Error aplicando configuracion fail2ban pack_cortafuegos: ${resultado.stderr || resultado.stdout}`);
    }
  }

  async configurarNftablesPackCortafuegos() {
    const cfg = this.configuracionPack || {};
    const reglas = cfg.reglas || {};

    const puertosPermitidos = [];
    if (reglas.permitirHttp !== false) puertosPermitidos.push(80);
    if (reglas.permitirHttps !== false) puertosPermitidos.push(443);
    if (reglas.permitirSsh !== false) puertosPermitidos.push(22);

    const extras = this._normalizarPuertoLista(reglas.puertosAdicionales || []);
    const puertosFinales = [...new Set([...puertosPermitidos, ...extras])].sort((a, b) => a - b);
    const puertosTexto = puertosFinales.join(', ');

    const comando = `bash -lc '\
      cat > /etc/nftables.conf <<"EOF"\
#!/usr/sbin/nft -f\
flush ruleset\
\
table inet filter {\
  chain input {\
    type filter hook input priority 0;\
    policy drop;\
\
    iif lo accept\
    ct state established,related accept\
    ip protocol icmp accept\
    ip6 nexthdr icmpv6 accept\
    tcp dport { ${puertosTexto} } accept\
  }\
\
  chain forward {\
    type filter hook forward priority 0;\
    policy drop;\
  }\
\
  chain output {\
    type filter hook output priority 0;\
    policy accept;\
  }\
}\
EOF\
      nft -f /etc/nftables.conf && systemctl enable nftables >/dev/null 2>&1 || true;\
      systemctl restart nftables\
    '`;

    const resultado = await this.ejecutarComandoPrivilegiado(comando, 120000);
    if (resultado.code !== 0) {
      throw new Error(`Error aplicando configuracion nftables pack_cortafuegos: ${resultado.stderr || resultado.stdout}`);
    }
  }

  async configurarPrometheusPackMonitoreo() {
    const cfg = this.configuracionPack || {};
    const puertoPrometheus = this._normalizarPuerto(cfg.prometheus?.puerto, 9090);
    const intervalo = Number(cfg.general?.intervaloScraping);
    const intervaloScrape = Number.isInteger(intervalo) && intervalo >= 5 && intervalo <= 300
      ? intervalo
      : 15;

    const comando = `bash -lc '\
      if [ -f /etc/default/prometheus ]; then\
        grep -q -- "--web.listen-address=" /etc/default/prometheus &&\
          sed -i -E "s@--web.listen-address=[^ ]+@--web.listen-address=0.0.0.0:${puertoPrometheus}@g" /etc/default/prometheus ||\
          sed -i -E "s@^ARGS=\"(.*)\"@ARGS=\"\\1 --web.listen-address=0.0.0.0:${puertoPrometheus}\"@" /etc/default/prometheus;\
      fi;\
      if [ -f /etc/prometheus/prometheus.yml ]; then\
        sed -i -E "s@^[[:space:]]*scrape_interval:[[:space:]]*[0-9]+s@  scrape_interval: ${intervaloScrape}s@" /etc/prometheus/prometheus.yml;\
      fi;\
      prometheus --version >/dev/null 2>&1 && systemctl restart prometheus\
    '`;

    const resultado = await this.ejecutarComandoPrivilegiado(comando, 120000);
    if (resultado.code !== 0) {
      throw new Error(`Error aplicando configuracion prometheus pack_monitoreo: ${resultado.stderr || resultado.stdout}`);
    }
  }

  async configurarNodeExporterPackMonitoreo() {
    const cfg = this.configuracionPack || {};
    const puertoExporter = this._normalizarPuerto(cfg.nodeExporter?.puerto, 9100);
    const remoto = Boolean(cfg.nodeExporter?.monitoreoRemoto);
    const hostEscucha = remoto ? '0.0.0.0' : '127.0.0.1';

    const comando = `bash -lc '\
      if [ -f /etc/default/prometheus-node-exporter ]; then\
        grep -q -- "--web.listen-address=" /etc/default/prometheus-node-exporter &&\
          sed -i -E "s@--web.listen-address=[^ ]+@--web.listen-address=${hostEscucha}:${puertoExporter}@g" /etc/default/prometheus-node-exporter ||\
          sed -i -E "s@^ARGS=\"(.*)\"@ARGS=\"\\1 --web.listen-address=${hostEscucha}:${puertoExporter}\"@" /etc/default/prometheus-node-exporter;\
      fi;\
      systemctl restart prometheus-node-exporter\
    '`;

    const resultado = await this.ejecutarComandoPrivilegiado(comando, 120000);
    if (resultado.code !== 0) {
      throw new Error(`Error aplicando configuracion node-exporter pack_monitoreo: ${resultado.stderr || resultado.stdout}`);
    }
  }

  async configurarGrafanaPackMonitoreo() {
    const cfg = this.configuracionPack || {};
    const puertoGrafana = this._normalizarPuerto(cfg.grafana?.puerto, 3000);
    const adminUser = this._normalizarHostname(cfg.grafana?.adminUser, 'admin');
    const sslHabilitado = Boolean(cfg.grafana?.ssl);
    const protocolo = sslHabilitado ? 'https' : 'http';

    const comando = `bash -lc '\
      if [ -f /etc/grafana/grafana.ini ]; then\
        sed -i -E "s@^;?http_port = .*@http_port = ${puertoGrafana}@" /etc/grafana/grafana.ini;\
        sed -i -E "s@^;?protocol = .*@protocol = ${protocolo}@" /etc/grafana/grafana.ini;\
      fi;\
      if [ -f /etc/default/grafana-server ]; then\
        grep -q '^GF_SECURITY_ADMIN_USER=' /etc/default/grafana-server &&\
          sed -i -E "s@^GF_SECURITY_ADMIN_USER=.*@GF_SECURITY_ADMIN_USER=${adminUser}@" /etc/default/grafana-server ||\
          echo "GF_SECURITY_ADMIN_USER=${adminUser}" >> /etc/default/grafana-server;\
      fi;\
      if systemctl list-unit-files | grep -q '^grafana-server.service'; then systemctl restart grafana-server; fi\
    '`;

    const resultado = await this.ejecutarComandoPrivilegiado(comando, 120000);
    if (resultado.code !== 0) {
      throw new Error(`Error aplicando configuracion grafana pack_monitoreo: ${resultado.stderr || resultado.stdout}`);
    }
  }

  async configurarNginxPackWeb() {
    const cfg = this.configuracionPack || {};
    const puertoHttp = this._normalizarPuerto(cfg.nginx?.puertoHttp, 80);
    const dominio = this._normalizarDominio(cfg.dominio || cfg.general?.dominio, 'localhost');
    const destinoServerName = dominio === 'localhost' ? '_' : dominio;

    const comando = `bash -lc '\
      conf="/etc/nginx/sites-available/default";\
      if [ -f "$conf" ]; then\
        sed -i -E "s@listen [0-9]+ default_server;@listen ${puertoHttp} default_server;@" "$conf";\
        sed -i -E "s@listen \[::\]:[0-9]+ default_server;@listen [::]:${puertoHttp} default_server;@" "$conf";\
        sed -i -E "s@server_name [^;]*;@server_name ${destinoServerName};@" "$conf";\
      fi;\
      nginx -t && systemctl restart nginx\
    '`;

    const resultado = await this.ejecutarComandoPrivilegiado(comando, 120000);
    if (resultado.code !== 0) {
      throw new Error(`Error aplicando configuracion nginx pack_web: ${resultado.stderr || resultado.stdout}`);
    }
  }

  async configurarPostgresqlPackWeb() {
    const cfg = this.configuracionPack || {};
    const baseDatos = this._normalizarIdentificadorDB(cfg.postgresql?.baseDatosInicial, 'centinela_app');

    const comando = `bash -lc '\
      db="${baseDatos}";\
      sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='"'"'${baseDatos}'"'"'" | grep -q 1 || sudo -u postgres createdb "$db"\
    '`;

    const resultado = await this.ejecutarComandoPrivilegiado(comando, 120000);
    if (resultado.code !== 0) {
      throw new Error(`Error aplicando configuracion postgresql pack_web: ${resultado.stderr || resultado.stdout}`);
    }
  }

  async configurarBindPackDominio() {
    const cfg = this.configuracionPack || {};
    const reenviadores = this._normalizarListaIPv4(cfg.dns?.reenviadores, ['8.8.8.8', '8.8.4.4']);
    const permiteExternas = Boolean(cfg.dns?.permiteConsultasExternas);
    const allowQuery = permiteExternas ? 'any' : 'localhost; localnets';
    const forwarders = reenviadores.map((ip) => `${ip};`).join(' ');

    const comando = `bash -lc '\
      cat > /etc/bind/named.conf.options <<"EOF"\
options {\
  directory "/var/cache/bind";\
  recursion yes;\
  allow-query { ${allowQuery}; };\
  forwarders { ${forwarders} };\
  dnssec-validation auto;\
  listen-on-v6 { any; };\
};\
EOF\
      named-checkconf && systemctl restart bind9\
    '`;

    const resultado = await this.ejecutarComandoPrivilegiado(comando, 120000);
    if (resultado.code !== 0) {
      throw new Error(`Error aplicando configuracion bind9 pack_dominio: ${resultado.stderr || resultado.stdout}`);
    }
  }

  async configurarDhcpPackDominio() {
    const cfg = this.configuracionPack || {};
    const dominio = this._normalizarDominio(cfg.general?.dominio, 'empresa.local');
    const rangoInicio = this._normalizarIPv4(cfg.dhcp?.rangoInicio, '192.168.1.100');
    const rangoFin = this._normalizarIPv4(cfg.dhcp?.rangoFin, '192.168.1.200');
    const puertaEnlace = this._normalizarIPv4(cfg.dhcp?.puertaEnlace, '192.168.1.1');
    const mascaraRed = this._normalizarIPv4(cfg.dhcp?.mascaraRed, '255.255.255.0');
    const dnsAsignar = this._normalizarListaIPv4(cfg.dhcp?.dnsAsignar, [puertaEnlace]);
    const dnsAsignarTexto = dnsAsignar.join(', ');
    const autoritativo = cfg.dhcp?.autoritativo !== false;

    const concesion = Number(cfg.dhcp?.tiempoConcesion);
    const tiempoConcesion = Number.isInteger(concesion) && concesion >= 60 && concesion <= 604800
      ? concesion
      : 86400;

    const redCidr = String(cfg.general?.red || '').trim();
    const cidrMatch = redCidr.match(/^(\d{1,3}(?:\.\d{1,3}){3})\/\d{1,2}$/);
    const redDesdeCidr = cidrMatch ? this._normalizarIPv4(cidrMatch[1]) : null;
    const redFallback = (() => {
      const octetos = puertaEnlace.split('.');
      return `${octetos[0]}.${octetos[1]}.${octetos[2]}.0`;
    })();
    const redSubnet = redDesdeCidr || redFallback;

    const bloqueAutoritativo = autoritativo ? 'authoritative;' : '# authoritative disabled by config';

    const comando = `bash -lc '\
      iface=$(ip route | awk "'"'/default/ {print $5; exit}'"'");\
      if [ -z "$iface" ]; then iface="eth0"; fi;\
      cat > /etc/default/isc-dhcp-server <<"EOF"\
INTERFACESv4="$iface"\
EOF\
      cat > /etc/dhcp/dhcpd.conf <<"EOF"\
ddns-update-style none;\
default-lease-time ${tiempoConcesion};\
max-lease-time ${tiempoConcesion};\
${bloqueAutoritativo}\
option domain-name "${dominio}";\
option domain-name-servers ${dnsAsignarTexto};\
subnet ${redSubnet} netmask ${mascaraRed} {\
  range ${rangoInicio} ${rangoFin};\
  option routers ${puertaEnlace};\
  option subnet-mask ${mascaraRed};\
  option domain-name "${dominio}";\
  option domain-name-servers ${dnsAsignarTexto};\
}\
EOF\
      dhcpd -t -cf /etc/dhcp/dhcpd.conf && systemctl restart isc-dhcp-server\
    '`;

    const resultado = await this.ejecutarComandoPrivilegiado(comando, 120000);
    if (resultado.code !== 0) {
      throw new Error(`Error aplicando configuracion dhcp pack_dominio: ${resultado.stderr || resultado.stdout}`);
    }
  }

  async aplicarConfiguracionPostInstalacion(paquete) {
    const pack = this.servidor?.pack || this.packSeleccionado || null;
    if (!pack) return;

    if (pack === 'pack_web') {
      if (paquete === 'nginx') {
        await this.configurarNginxPackWeb();
        return;
      }

      if (paquete === 'postgresql') {
        await this.configurarPostgresqlPackWeb();
      }

      return;
    }

    if (pack === 'pack_dominio') {
      if (paquete === 'bind9') {
        await this.configurarBindPackDominio();
        return;
      }

      if (paquete === 'isc-dhcp-server') {
        await this.configurarDhcpPackDominio();
      }

      return;
    }

    if (pack === 'pack_correo') {
      if (paquete === 'postfix') {
        await this.configurarPostfixPackCorreo();
        return;
      }

      if (paquete === 'dovecot-imapd') {
        await this.configurarDovecotPackCorreo();
      }

      return;
    }

    if (pack === 'pack_cortafuegos') {
      if (paquete === 'fail2ban') {
        await this.configurarFail2banPackCortafuegos();
        return;
      }

      if (paquete === 'nftables') {
        await this.configurarNftablesPackCortafuegos();
      }

      return;
    }

    if (pack === 'pack_monitoreo') {
      if (paquete === 'prometheus') {
        await this.configurarPrometheusPackMonitoreo();
        return;
      }

      if (paquete === 'prometheus-node-exporter') {
        await this.configurarNodeExporterPackMonitoreo();
        await this.configurarGrafanaPackMonitoreo();
      }
    }
  }

  async instalarPaquete(paquete) {
    const opciones = '-o Dpkg::Use-Pty=0 -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold"';
    const timeoutInstalacion = this._timeoutInstalacionPaquete(paquete);

    if (paquete === 'postfix') {
      await this.configurarPostfixNoInteractivo();
    }

    const comando = `apt-get install -y -q ${opciones} ${paquete}`;
    const resultado = await this._ejecutarConRetryLock(comando, timeoutInstalacion);

    if (resultado.code !== 0) {
      const fixResult = await this._ejecutarConRetryLock('apt-get install -f -y', 10 * 60 * 1000);
      if (fixResult.code !== 0) {
        throw new Error(`Error instalando ${paquete}: ${resultado.stderr || resultado.stdout}`);
      }
      const retryResult = await this._ejecutarConRetryLock(comando, timeoutInstalacion);
      if (retryResult.code !== 0) {
        throw new Error(`Error instalando ${paquete} (reintento): ${retryResult.stderr || retryResult.stdout}`);
      }
    }

    await this.aplicarConfiguracionPostInstalacion(paquete);

    return resultado;
  }

  async verificarInstalacion(paquete) {
    const { stdout } = await this.ejecutarComando(`dpkg -l | grep -E "ii\\s+${paquete}" || which ${paquete}`);
    return stdout.trim().length > 0;
  }

  async obtenerVersion(paquete) {
    try {
      const { stdout } = await this.ejecutarComando(`${paquete} --version 2>/dev/null | head -1`);
      const match = stdout.match(/\d+\.\d+\.?\d*/);
      return match ? match[0] : '1.0.0';
    } catch {
      return '1.0.0';
    }
  }

  async desinstalarPaquete(paquete) {
    const removeResult = await this._ejecutarConRetryLock(`apt-get remove -y ${paquete}`, 120000);
    if (removeResult.code !== 0 && !this._esPaqueteNoInstalado(removeResult.stderr || removeResult.stdout)) {
      throw new Error(`Error removiendo ${paquete}: ${removeResult.stderr || removeResult.stdout}`);
    }

    const purgeResult = await this._ejecutarConRetryLock(`apt-get purge -y ${paquete}`, 120000);
    if (purgeResult.code !== 0 && !this._esPaqueteNoInstalado(purgeResult.stderr || purgeResult.stdout)) {
      throw new Error(`Error purgando ${paquete}: ${purgeResult.stderr || purgeResult.stdout}`);
    }
  }

  async limpiarDependencias() {
    const autoremoveResult = await this._ejecutarConRetryLock('apt-get autoremove -y', 120000);
    if (autoremoveResult.code !== 0) {
      throw new Error(`Error en autoremove: ${autoremoveResult.stderr || autoremoveResult.stdout}`);
    }

    const autocleanResult = await this._ejecutarConRetryLock('apt-get autoclean', 120000);
    if (autocleanResult.code !== 0) {
      throw new Error(`Error en autoclean: ${autocleanResult.stderr || autocleanResult.stdout}`);
    }
  }

  async cerrar() {
    if (this.client) {
      this.client.end();
    }
  }
}

module.exports = InstaladorSSH;
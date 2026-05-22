const test = require('node:test');
const assert = require('node:assert/strict');

const InstaladorSSH = require('./InstaladorSSH');

function crearInstaladorBase() {
  return new InstaladorSSH({
    ip: '192.168.1.10',
    usuario: 'root',
    password: 'secret'
  });
}

test('configurarNginxPackWeb usa puerto y dominio configurados', async () => {
  const instalador = crearInstaladorBase();
  instalador.configuracionPack = {
    dominio: 'empresa.local',
    nginx: { puertoHttp: 8080 }
  };

  let comandoEjecutado = '';
  instalador.ejecutarComandoPrivilegiado = async (comando) => {
    comandoEjecutado = comando;
    return { code: 0, stdout: '', stderr: '' };
  };

  await instalador.configurarNginxPackWeb();

  assert.match(comandoEjecutado, /listen 8080 default_server/);
  assert.match(comandoEjecutado, /server_name empresa\.local;/);
});

test('configurarPostgresqlPackWeb usa base de datos inicial normalizada', async () => {
  const instalador = crearInstaladorBase();
  instalador.configuracionPack = {
    postgresql: { baseDatosInicial: 'mi app-demo' }
  };

  let comandoEjecutado = '';
  instalador.ejecutarComandoPrivilegiado = async (comando) => {
    comandoEjecutado = comando;
    return { code: 0, stdout: '', stderr: '' };
  };

  await instalador.configurarPostgresqlPackWeb();

  assert.match(comandoEjecutado, /mi_app_demo/);
  assert.match(comandoEjecutado, /createdb/);
});

test('configurarDhcpPackDominio genera template con dominio y rango', async () => {
  const instalador = crearInstaladorBase();
  instalador.configuracionPack = {
    general: { dominio: 'empresa.local', red: '192.168.1.0/24' },
    dhcp: {
      rangoInicio: '192.168.1.120',
      rangoFin: '192.168.1.180',
      puertaEnlace: '192.168.1.1',
      mascaraRed: '255.255.255.0',
      dnsAsignar: ['192.168.1.10', '8.8.8.8'],
      tiempoConcesion: 7200,
      autoritativo: true
    }
  };

  let comandoEjecutado = '';
  instalador.ejecutarComandoPrivilegiado = async (comando) => {
    comandoEjecutado = comando;
    return { code: 0, stdout: '', stderr: '' };
  };

  await instalador.configurarDhcpPackDominio();

  assert.match(comandoEjecutado, /subnet 192\.168\.1\.0 netmask 255\.255\.255\.0/);
  assert.match(comandoEjecutado, /range 192\.168\.1\.120 192\.168\.1\.180/);
  assert.match(comandoEjecutado, /option domain-name "empresa\.local"/);
  assert.match(comandoEjecutado, /dhcpd -t -cf \/etc\/dhcp\/dhcpd\.conf/);
});

test('configurarPostfixPackCorreo aplica dominio y puerto smtp configurados', async () => {
  const instalador = crearInstaladorBase();
  instalador.configuracionPack = {
    general: {
      dominio: 'mail.empresa.local',
      hostname: 'mx',
      adminEmail: 'admin@mail.empresa.local'
    },
    postfix: {
      puerto: 2525,
      tamanoMaximo: 10
    }
  };

  let comandoEjecutado = '';
  instalador.ejecutarComandoPrivilegiado = async (comando) => {
    comandoEjecutado = comando;
    return { code: 0, stdout: '', stderr: '' };
  };

  await instalador.configurarPostfixPackCorreo();

  assert.match(comandoEjecutado, /myhostname = mx\.mail\.empresa\.local/);
  assert.match(comandoEjecutado, /mydomain = mail\.empresa\.local/);
  assert.match(comandoEjecutado, /awk -v p="2525"/);
  assert.match(comandoEjecutado, /message_size_limit = 10485760/);
});

test('configurarDovecotPackCorreo aplica puerto IMAP configurado', async () => {
  const instalador = crearInstaladorBase();
  instalador.configuracionPack = {
    dovecot: {
      puertoImap: 2143,
      ssl: false
    }
  };

  let comandoEjecutado = '';
  instalador.ejecutarComandoPrivilegiado = async (comando) => {
    comandoEjecutado = comando;
    return { code: 0, stdout: '', stderr: '' };
  };

  await instalador.configurarDovecotPackCorreo();

  assert.match(comandoEjecutado, /port = 2143/);
  assert.match(comandoEjecutado, /ssl = no/);
  assert.match(comandoEjecutado, /systemctl restart dovecot/);
});

test('configurarFail2banPackCortafuegos aplica maxretry y bantime', async () => {
  const instalador = crearInstaladorBase();
  instalador.configuracionPack = {
    fail2ban: {
      maxIntentos: 7,
      tiempoBan: 1800
    }
  };

  let comandoEjecutado = '';
  instalador.ejecutarComandoPrivilegiado = async (comando) => {
    comandoEjecutado = comando;
    return { code: 0, stdout: '', stderr: '' };
  };

  await instalador.configurarFail2banPackCortafuegos();

  assert.match(comandoEjecutado, /bantime = 1800/);
  assert.match(comandoEjecutado, /maxretry = 7/);
  assert.match(comandoEjecutado, /systemctl restart fail2ban/);
});

test('configurarNftablesPackCortafuegos incluye puertos por defecto y adicionales', async () => {
  const instalador = crearInstaladorBase();
  instalador.configuracionPack = {
    reglas: {
      permitirHttp: true,
      permitirHttps: true,
      permitirSsh: false,
      puertosAdicionales: [8080, 8443]
    }
  };

  let comandoEjecutado = '';
  instalador.ejecutarComandoPrivilegiado = async (comando) => {
    comandoEjecutado = comando;
    return { code: 0, stdout: '', stderr: '' };
  };

  await instalador.configurarNftablesPackCortafuegos();

  assert.match(comandoEjecutado, /tcp dport \{ 80, 443, 8080, 8443 \} accept/);
  assert.match(comandoEjecutado, /systemctl restart nftables/);
});

test('configurarPrometheusPackMonitoreo aplica puerto e intervalo de scraping', async () => {
  const instalador = crearInstaladorBase();
  instalador.configuracionPack = {
    general: { intervaloScraping: 30 },
    prometheus: { puerto: 9191 }
  };

  let comandoEjecutado = '';
  instalador.ejecutarComandoPrivilegiado = async (comando) => {
    comandoEjecutado = comando;
    return { code: 0, stdout: '', stderr: '' };
  };

  await instalador.configurarPrometheusPackMonitoreo();

  assert.match(comandoEjecutado, /--web\.listen-address=0\.0\.0\.0:9191/);
  assert.match(comandoEjecutado, /scrape_interval: 30s/);
  assert.match(comandoEjecutado, /systemctl restart prometheus/);
});

test('configurarNodeExporterPackMonitoreo aplica host y puerto de escucha', async () => {
  const instalador = crearInstaladorBase();
  instalador.configuracionPack = {
    nodeExporter: {
      puerto: 9200,
      monitoreoRemoto: true
    }
  };

  let comandoEjecutado = '';
  instalador.ejecutarComandoPrivilegiado = async (comando) => {
    comandoEjecutado = comando;
    return { code: 0, stdout: '', stderr: '' };
  };

  await instalador.configurarNodeExporterPackMonitoreo();

  assert.match(comandoEjecutado, /--web\.listen-address=0\.0\.0\.0:9200/);
  assert.match(comandoEjecutado, /systemctl restart prometheus-node-exporter/);
});

test('configurarGrafanaPackMonitoreo aplica puerto, protocolo y usuario admin', async () => {
  const instalador = crearInstaladorBase();
  instalador.configuracionPack = {
    grafana: {
      puerto: 3300,
      ssl: true,
      adminUser: 'grafana_admin'
    }
  };

  let comandoEjecutado = '';
  instalador.ejecutarComandoPrivilegiado = async (comando) => {
    comandoEjecutado = comando;
    return { code: 0, stdout: '', stderr: '' };
  };

  await instalador.configurarGrafanaPackMonitoreo();

  assert.match(comandoEjecutado, /http_port = 3300/);
  assert.match(comandoEjecutado, /protocol = https/);
  assert.match(comandoEjecutado, /GF_SECURITY_ADMIN_USER=grafanaadmin/);
});

test('aplicarConfiguracionPostInstalacion despacha por pack y paquete', async () => {
  const instalador = crearInstaladorBase();
  let bindCalls = 0;
  let dhcpCalls = 0;

  instalador.packSeleccionado = 'pack_dominio';
  instalador.configurarBindPackDominio = async () => { bindCalls += 1; };
  instalador.configurarDhcpPackDominio = async () => { dhcpCalls += 1; };

  await instalador.aplicarConfiguracionPostInstalacion('bind9');
  await instalador.aplicarConfiguracionPostInstalacion('isc-dhcp-server');
  await instalador.aplicarConfiguracionPostInstalacion('nginx');

  assert.equal(bindCalls, 1);
  assert.equal(dhcpCalls, 1);
});

test('aplicarConfiguracionPostInstalacion despacha pack_correo a postfix y dovecot', async () => {
  const instalador = crearInstaladorBase();
  let postfixCalls = 0;
  let dovecotCalls = 0;

  instalador.packSeleccionado = 'pack_correo';
  instalador.configurarPostfixPackCorreo = async () => { postfixCalls += 1; };
  instalador.configurarDovecotPackCorreo = async () => { dovecotCalls += 1; };

  await instalador.aplicarConfiguracionPostInstalacion('postfix');
  await instalador.aplicarConfiguracionPostInstalacion('dovecot-imapd');
  await instalador.aplicarConfiguracionPostInstalacion('dovecot-pop3d');

  assert.equal(postfixCalls, 1);
  assert.equal(dovecotCalls, 1);
});

test('aplicarConfiguracionPostInstalacion despacha pack_cortafuegos', async () => {
  const instalador = crearInstaladorBase();
  let fail2banCalls = 0;
  let nftCalls = 0;

  instalador.packSeleccionado = 'pack_cortafuegos';
  instalador.configurarFail2banPackCortafuegos = async () => { fail2banCalls += 1; };
  instalador.configurarNftablesPackCortafuegos = async () => { nftCalls += 1; };

  await instalador.aplicarConfiguracionPostInstalacion('fail2ban');
  await instalador.aplicarConfiguracionPostInstalacion('nftables');

  assert.equal(fail2banCalls, 1);
  assert.equal(nftCalls, 1);
});

test('aplicarConfiguracionPostInstalacion despacha pack_monitoreo', async () => {
  const instalador = crearInstaladorBase();
  let promCalls = 0;
  let nodeCalls = 0;
  let grafanaCalls = 0;

  instalador.packSeleccionado = 'pack_monitoreo';
  instalador.configurarPrometheusPackMonitoreo = async () => { promCalls += 1; };
  instalador.configurarNodeExporterPackMonitoreo = async () => { nodeCalls += 1; };
  instalador.configurarGrafanaPackMonitoreo = async () => { grafanaCalls += 1; };

  await instalador.aplicarConfiguracionPostInstalacion('prometheus');
  await instalador.aplicarConfiguracionPostInstalacion('prometheus-node-exporter');

  assert.equal(promCalls, 1);
  assert.equal(nodeCalls, 1);
  assert.equal(grafanaCalls, 1);
});

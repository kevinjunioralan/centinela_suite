const PACK_CONFIG_RULES = {
  pack_web: {
    required: ['dominio', 'nginx.puertoHttp', 'postgresql.baseDatosInicial'],
    labels: {
      dominio: 'dominio',
      'nginx.puertoHttp': 'nginx.puertoHttp',
      'postgresql.baseDatosInicial': 'postgresql.baseDatosInicial'
    }
  },
  pack_dominio: {
    required: ['general.dominio', 'dhcp.rangoInicio', 'dhcp.rangoFin'],
    labels: {
      'general.dominio': 'general.dominio',
      'dhcp.rangoInicio': 'dhcp.rangoInicio',
      'dhcp.rangoFin': 'dhcp.rangoFin'
    }
  },
  pack_cortafuegos: {
    required: ['fail2ban.maxIntentos', 'fail2ban.tiempoBan'],
    labels: {
      'fail2ban.maxIntentos': 'fail2ban.maxIntentos',
      'fail2ban.tiempoBan': 'fail2ban.tiempoBan'
    }
  },
  pack_correo: {
    required: ['general.dominio', 'postfix.puerto', 'dovecot.puertoImap'],
    labels: {
      'general.dominio': 'general.dominio',
      'postfix.puerto': 'postfix.puerto',
      'dovecot.puertoImap': 'dovecot.puertoImap'
    }
  },
  pack_monitoreo: {
    required: ['prometheus.puerto', 'grafana.puerto'],
    labels: {
      'prometheus.puerto': 'prometheus.puerto',
      'grafana.puerto': 'grafana.puerto'
    }
  }
};

function getByPath(obj, path) {
  return String(path)
    .split('.')
    .reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function isFilled(value) {
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  return value != null;
}

function getMissingFields(packKey, values = {}) {
  const rule = PACK_CONFIG_RULES[packKey];
  if (!rule) return [];

  return rule.required.filter((path) => !isFilled(getByPath(values, path)));
}

function toFieldLabels(packKey, fields = []) {
  const labels = PACK_CONFIG_RULES[packKey]?.labels || {};
  return fields.map((field) => labels[field] || field);
}

module.exports = {
  PACK_CONFIG_RULES,
  getMissingFields,
  toFieldLabels
};

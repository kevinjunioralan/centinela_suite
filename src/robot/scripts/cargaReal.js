// backend/src/robot/scripts/cargaReal.js
const { Client } = require('ssh2');

// backend/src/robot/scripts/cargaReal.js
const SCRIPTS_CARGA = {
  pack_web: {
    instalarHerramientas: [
      'apt-get update -qq',
      'apt-get install -y -qq apache2-utils stress-ng curl',
    ],
    cargas: {
      trabajo_normal: [
        'ab -n 50 -c 2 http://localhost/ > /dev/null 2>&1 &',
      ],
      carga_progresiva: [
        'ab -n 200 -c 10 http://localhost/ > /dev/null 2>&1 &',
        'stress-ng --cpu 1 --timeout 30s --quiet > /dev/null 2>&1 &'
      ],
      pico_maximo: [
        'ab -n 500 -c 30 http://localhost/ > /dev/null 2>&1 &',
        'stress-ng --cpu 2 --timeout 60s --quiet > /dev/null 2>&1 &'
      ],
      reposo: [
        'pkill ab 2>/dev/null || true',
        'pkill stress-ng 2>/dev/null || true'
      ]
    },
    metricas: {
      cpu: `top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1`,
      ram: `free -m | awk 'NR==2{printf "%.0f", $3/$2*100}'`,
      disco: `df -h / | awk 'NR==2{print $5}' | cut -d'%' -f1`
    }
  },
  pack_correo: {
    instalarHerramientas: [
      'apt-get update -qq',
      'apt-get install -y -qq mailutils swaks',
    ],
    cargas: {
      trabajo_normal: [
        'for i in {1..10}; do echo "test" | mail -s "Test $i" test@localhost 2>/dev/null; done'
      ],
      carga_progresiva: [
        'for i in {1..50}; do echo "test" | mail -s "Test $i" test@localhost 2>/dev/null; done &'
      ],
      pico_maximo: [
        'for i in {1..200}; do echo "test" | mail -s "Test $i" test@localhost 2>/dev/null; done &'
      ],
      reposo: [
        'pkill mail 2>/dev/null || true'
      ]
    },
    metricas: {
      cpu: `top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1`,
      ram: `free -m | awk 'NR==2{printf "%.0f", $3/$2*100}'`,
      disco: `df -h / | awk 'NR==2{print $5}' | cut -d'%' -f1`
    }
  },
  pack_dominio: {
    instalarHerramientas: [
      'apt-get update -qq',
      'apt-get install -y -qq dnsutils',
    ],
    cargas: {
      trabajo_normal: [
        'for i in {1..20}; do dig @localhost google.com > /dev/null 2>&1; done'
      ],
      carga_progresiva: [
        'for i in {1..100}; do dig @localhost google.com > /dev/null 2>&1 & done'
      ],
      pico_maximo: [
        'for i in {1..500}; do dig @localhost google.com > /dev/null 2>&1 & done'
      ],
      reposo: [
        'pkill dig 2>/dev/null || true'
      ]
    },
    metricas: {
      cpu: `top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1`,
      ram: `free -m | awk 'NR==2{printf "%.0f", $3/$2*100}'`,
      disco: `df -h / | awk 'NR==2{print $5}' | cut -d'%' -f1`
    }
  },
  pack_cortafuegos: {
    instalarHerramientas: [
      'apt-get update -qq',
      'apt-get install -y -qq hping3',
    ],
    cargas: {
      trabajo_normal: [
        'hping3 -S -p 80 -c 10 localhost > /dev/null 2>&1 &'
      ],
      carga_progresiva: [
        'hping3 -S -p 80 -c 50 --flood localhost > /dev/null 2>&1 &'
      ],
      pico_maximo: [
        'hping3 -S -p 80 -c 200 --flood localhost > /dev/null 2>&1 &'
      ],
      reposo: [
        'pkill hping3 2>/dev/null || true'
      ]
    },
    metricas: {
      cpu: `top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1`,
      ram: `free -m | awk 'NR==2{printf "%.0f", $3/$2*100}'`,
      disco: `df -h / | awk 'NR==2{print $5}' | cut -d'%' -f1`
    }
  },
  pack_monitoreo: {
    instalarHerramientas: [
      'apt-get update -qq',
      'apt-get install -y -qq curl bc',
    ],
    cargas: {
      trabajo_normal: [
        'for i in {1..10}; do curl -s http://localhost:9090/metrics > /dev/null; done'
      ],
      carga_progresiva: [
        'for i in {1..50}; do curl -s http://localhost:9090/metrics > /dev/null & done'
      ],
      pico_maximo: [
        'for i in {1..200}; do curl -s http://localhost:9090/metrics > /dev/null & done'
      ],
      reposo: [
        'pkill curl 2>/dev/null || true'
      ]
    },
    metricas: {
      cpu: `top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1`,
      ram: `free -m | awk 'NR==2{printf "%.0f", $3/$2*100}'`,
      disco: `df -h / | awk 'NR==2{print $5}' | cut -d'%' -f1`
    }
  }
};

module.exports = { SCRIPTS_CARGA };
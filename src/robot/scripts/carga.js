// backend/src/robot/scripts/carga.js

const SCRIPTS_CARGA = {
  pack_web: {
    instalar: ['apt-get install -y apache2-utils', 'apt-get install -y stress-ng'],
    ejecutar: [
      'ab -n 1000 -c 10 http://localhost/ &',  // Apache Bench
      'stress-ng --cpu 4 --timeout 60s &',      // Estrés de CPU
      'node -e "setInterval(() => Math.sqrt(Math.random()), 1)" &' // Carga Node.js
    ],
    detener: ['pkill ab', 'pkill stress-ng', 'pkill node'],
    metricas: ['top -bn1 | grep "Cpu(s)"', 'free -m', 'df -h']
  },
  pack_correo: {
    instalar: ['apt-get install -y mailutils', 'apt-get install -y swaks'],
    ejecutar: [
      'for i in {1..100}; do echo "test" | mail -s "Test $i" test@localhost; done &',
      'swaks --to test@localhost --server localhost --timeout 1s &'
    ],
    detener: ['pkill mail', 'pkill swaks'],
    metricas: ['mailq', 'postqueue -p']
  },
  // ... más packs
};
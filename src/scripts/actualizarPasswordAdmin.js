// backend/src/scripts/actualizarPasswordAdmin.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: '../../.env' });

const Usuario = require('../expediente/models/Usuario');

async function actualizarPassword() {
  try {
    await mongoose.connect('mongodb://localhost:27017/centinela_banco_pruebas');
    
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash('Admin123!', salt);
    
    const result = await Usuario.updateOne(
      { email: 'admin@centinela.com' },
      { $set: { password: hash } }
    );
    
    console.log('✅ Contraseña del ADMIN actualizada');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

actualizarPassword();
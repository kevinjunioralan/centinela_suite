// LOGIN BÁSICO - Solo para desarrollo
// Acepta cualquier email/contraseña

const loginBasico = async (email, password) => {
  if (!email || !password) {
    throw new Error('Email y contraseña son requeridos');
  }
  
  console.log(`✅ Login BÁSICO exitoso para: ${email}`);
  
  return {
    token: 'temp-token-' + Date.now(),
    usuario: {
      id: 'temp-id-' + Date.now(),
      nombre: email.split('@')[0] || 'Usuario',
      email: email,
      rol: 'ADMIN'
    }
  };
};

module.exports = { loginBasico };
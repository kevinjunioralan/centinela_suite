const jwt = require('jsonwebtoken');
const Usuario = require('../expediente/models/Usuario');

const JWT_SECRET = process.env.JWT_SECRET || 'centinela_secret_key_2024';

const login = async (email, password) => {
  console.log('1. Buscando usuario:', email);
  
  const usuario = await Usuario.findOne({ email, activo: true });
  if (!usuario) {
    console.log('2. Usuario no encontrado');
    throw new Error('Credenciales inválidas');
  }
  
  console.log('3. Usuario encontrado, comparando password...');
  const passwordValido = await usuario.compararPassword(password);
  console.log('4. Resultado comparación:', passwordValido);
  
  if (!passwordValido) {
    console.log('5. Password incorrecto');
    throw new Error('Credenciales inválidas');
  }
  
  console.log('6. Password correcto, actualizando último acceso...');
  usuario.ultimoAcceso = new Date();
  await usuario.save();
  
  console.log('7. Generando token...');
  const token = jwt.sign(
    { id: usuario._id, email: usuario.email, nombre: usuario.nombre, rol: usuario.rol, clienteId: usuario.clienteId },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
  
  console.log('8. Login exitoso');
  return {
    token,
    usuario: {
      id: usuario._id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol,
      clienteId: usuario.clienteId
    }
  };
};

const verificarToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
};

module.exports = { login, verificarToken };
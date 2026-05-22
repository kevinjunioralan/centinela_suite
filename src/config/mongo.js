const mongoose = require('mongoose');

async function connectMongo() {
  const uri = process.env.MONGO_URI;
  const allowMongoFailure = process.env.ALLOW_MONGO_FAILURE === 'true';

  console.log("🔌 [MONGO] Iniciando conexión a MongoDB…");
  console.log("🌐 [MONGO] URI:", uri);

  try {
    await mongoose.connect(uri); // ← SIN OPCIONES

    console.log("✅ [MONGO] Conexión establecida correctamente");
  } catch (error) {
    console.error("❌ [MONGO] Error conectando a MongoDB:", error.message);
    if (allowMongoFailure) {
      console.warn("⚠️ [MONGO] Continuando sin Mongo por ALLOW_MONGO_FAILURE=true");
      return;
    }
    process.exit(1);
  }
}

module.exports = connectMongo;

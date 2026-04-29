// ═══════════════════════════════════════════════════════
//  EcoRuta Conectada — db.js
//  Módulo de conexión a PostgreSQL
//  Se importa en servidor.js con: require('./db')
// ═══════════════════════════════════════════════════════

const { Pool } = require('pg');
require('dotenv').config();

// Pool de conexiones: reutiliza conexiones abiertas en lugar
// de abrir una nueva por cada consulta, lo que mejora el rendimiento.
const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     process.env.DB_PORT     || 5432,
  database: process.env.DB_NOMBRE,
  user:     process.env.DB_USUARIO,
  password: process.env.DB_PASSWORD,

  // Requerido para conectar con Supabase desde Node.js
  ssl: { rejectUnauthorized: false },

  // Número máximo de conexiones simultáneas al pool
  max: 10,

  // Tiempo máximo (ms) que una conexión puede estar inactiva antes de cerrarse
  idleTimeoutMillis: 30000,

  // Tiempo máximo (ms) esperando obtener una conexión del pool
  connectionTimeoutMillis: 2000
});

// Verificar la conexión al iniciar el servidor
pool.connect(function(error, cliente, liberar) {
  if (error) {
    console.error('  ✗ Error al conectar con PostgreSQL:', error.message);
    console.error('    Verifica los datos en el archivo .env');
  } else {
    console.log('  ✓ Conexión a PostgreSQL establecida correctamente');
    liberar();
  }
});

module.exports = pool;
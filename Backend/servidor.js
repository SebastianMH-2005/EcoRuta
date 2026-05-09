// ═══════════════════════════════════════════════════════
//  EcoRuta Conectada — servidor.js
//  Backend principal: API REST con Express + PostgreSQL
//  Ejecutar con: node servidor.js
// ═══════════════════════════════════════════════════════

const express              = require('express');
const cors                 = require('cors');
const bcrypt               = require('bcrypt');
const jwt                  = require('jsonwebtoken');
const pool                 = require('./db');
const iniciarSistemaAlertas = require('./alertas');
require('dotenv').config();

const app = express();

// ─── Middlewares globales ────────────────────────────────────
app.use(cors({
  origin: [
    'https://eco-ruta-hhd4.vercel.app',
    'http://localhost:3000',
    'http://127.0.0.1:5500'
  ],
  credentials: true
}));
app.use(express.json());


// ═══════════════════════════════════════════════════════
//  MIDDLEWARE: verificar token JWT
//  Se usa en rutas que requieren que el usuario haya
//  iniciado sesión previamente.
// ═══════════════════════════════════════════════════════
function verificarToken(req, res, next) {
  var encabezado = req.headers['authorization'];
  var token      = encabezado && encabezado.split(' ')[1];

  if (!token) {
    return res.status(401).json({ ok: false, mensaje: 'Acceso denegado. Token requerido.' });
  }

  try {
    var datosToken = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario    = datosToken;
    next();
  } catch (error) {
    return res.status(403).json({ ok: false, mensaje: 'Token inválido o expirado.' });
  }
}


// ═══════════════════════════════════════════════════════
//  RUTAS DE AUTENTICACIÓN
// ═══════════════════════════════════════════════════════

// ─── POST /api/registro ──────────────────────────────────────
// Crea una cuenta nueva para un vecino.
// Recibe: nombre, correo, contrasena
// Devuelve: datos del usuario creado (sin contraseña)
app.post('/api/registro', async function(req, res) {
  var { nombre, correo, contrasena } = req.body;

  // Validar que lleguen todos los campos
  if (!nombre || !correo || !contrasena) {
    return res.status(400).json({ ok: false, mensaje: 'Todos los campos son obligatorios.' });
  }

  // Validar largo mínimo de contraseña
  if (contrasena.length < 6) {
    return res.status(400).json({ ok: false, mensaje: 'La contraseña debe tener al menos 6 caracteres.' });
  }

  try {
    // Hashear la contraseña con bcrypt (10 rondas de sal)
    var hash = await bcrypt.hash(contrasena, 10);

    var resultado = await pool.query(
      `INSERT INTO usuario (nombre, correo, contrasena_hash, rol)
       VALUES ($1, $2, $3, 'vecino')
       RETURNING id_usuario, nombre, correo, rol, fecha_registro`,
      [nombre, correo, hash]
    );

    res.status(201).json({ ok: true, usuario: resultado.rows[0] });

  } catch (error) {
    // El error 23505 en PostgreSQL es de clave duplicada (correo ya existe)
    if (error.code === '23505') {
      return res.status(400).json({ ok: false, mensaje: 'Ese correo ya está registrado.' });
    }
    console.error('Error en registro:', error.message);
    res.status(500).json({ ok: false, mensaje: 'Error interno del servidor.' });
  }
});


// ─── POST /api/login ─────────────────────────────────────────
// Inicia sesión con correo y contraseña.
// Devuelve: token JWT + datos básicos del usuario
app.post('/api/login', async function(req, res) {
  var { correo, contrasena } = req.body;

  if (!correo || !contrasena) {
    return res.status(400).json({ ok: false, mensaje: 'Correo y contraseña son obligatorios.' });
  }

  try {
    // Buscar el usuario por correo
    var resultado = await pool.query(
      'SELECT * FROM usuario WHERE correo = $1',
      [correo]
    );

    if (resultado.rows.length === 0) {
      return res.status(401).json({ ok: false, mensaje: 'Correo o contraseña incorrectos.' });
    }

    var usuario = resultado.rows[0];

    // Comparar la contraseña ingresada con el hash guardado
    var claveCorrecta = await bcrypt.compare(contrasena, usuario.contrasena_hash);

    if (!claveCorrecta) {
      return res.status(401).json({ ok: false, mensaje: 'Correo o contraseña incorrectos.' });
    }

    // Crear token JWT válido por 8 horas
    var token = jwt.sign(
      {
        id:     usuario.id_usuario,
        correo: usuario.correo,
        rol:    usuario.rol
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      ok:     true,
      token:  token,
      nombre: usuario.nombre,
      correo: usuario.correo,
      rol:    usuario.rol
    });

  } catch (error) {
    console.error('Error en login:', error.message);
    res.status(500).json({ ok: false, mensaje: 'Error interno del servidor.' });
  }
});


// ═══════════════════════════════════════════════════════
//  RUTAS DE CAMIONES Y GPS
// ═══════════════════════════════════════════════════════

// ─── GET /api/camiones ───────────────────────────────────────
// Devuelve la lista de camiones operativos con su última
// posición GPS registrada. El frontend usa esto para mover
// los marcadores en el mapa en tiempo real.
app.get('/api/camiones', async function(req, res) {
  try {
    var resultado = await pool.query(`
      SELECT
        c.id_camion,
        c.placa,
        c.estado_mantenimiento,
        e.nombre        AS nombre_ruta,
        e.zona,
        e.hora_inicio,
        e.hora_fin,
        e.estado        AS estado_ruta,
        g.latitud,
        g.longitud,
        g.velocidad_kmh,
        g.timestamp     AS ultima_actualizacion
      FROM camion c
      LEFT JOIN ecoruta e ON e.id_camion = c.id_camion AND e.estado = 'activa'
      LEFT JOIN LATERAL (
        SELECT latitud, longitud, velocidad_kmh, timestamp
        FROM gps
        WHERE id_camion = c.id_camion
        ORDER BY timestamp DESC
        LIMIT 1
      ) g ON true
      WHERE c.estado_mantenimiento = 'operativo'
      ORDER BY c.id_camion
    `);

    res.json({ ok: true, camiones: resultado.rows });

  } catch (error) {
    console.error('Error al obtener camiones:', error.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener los camiones.' });
  }
});


// ─── POST /api/gps ───────────────────────────────────────────
// Recibe la posición GPS de un camión y la guarda en la base de datos.
// En producción, este endpoint lo llamaría el dispositivo GPS del camión
// automáticamente cada 5 segundos.
// Por ahora se puede usar para pruebas manuales.
app.post('/api/gps', verificarToken, async function(req, res) {
  var { id_camion, latitud, longitud, altitud_m, velocidad_kmh } = req.body;

  if (!id_camion || !latitud || !longitud) {
    return res.status(400).json({ ok: false, mensaje: 'id_camion, latitud y longitud son obligatorios.' });
  }

  try {
    await pool.query(
      `INSERT INTO gps (id_camion, latitud, longitud, altitud_m, velocidad_kmh)
       VALUES ($1, $2, $3, $4, $5)`,
      [id_camion, latitud, longitud, altitud_m || 0, velocidad_kmh || 0]
    );

    res.json({ ok: true, mensaje: 'Posición GPS guardada correctamente.' });

  } catch (error) {
    console.error('Error al guardar GPS:', error.message);
    res.status(500).json({ ok: false, mensaje: 'Error al guardar la posición GPS.' });
  }
});


// ═══════════════════════════════════════════════════════
//  RUTAS DE ECORUTAS
// ═══════════════════════════════════════════════════════

// ─── GET /api/rutas ──────────────────────────────────────────
// Devuelve todas las rutas activas con sus puntos de recogida.
// Útil para mostrar en el mapa los recorridos completos.
app.get('/api/rutas', async function(req, res) {
  try {
    var rutas = await pool.query(
      `SELECT id_ruta, nombre, zona, dist_total_km,
              hora_inicio, hora_fin, estado
       FROM ecoruta
       WHERE estado != 'inactiva'
       ORDER BY nombre`
    );

    // Para cada ruta, obtener sus puntos de recogida ordenados
    var rutasConPuntos = await Promise.all(
      rutas.rows.map(async function(ruta) {
        var puntos = await pool.query(
          `SELECT id_punto, direccion, latitud, longitud,
                  tipo_residuo, frecuencia, estado, orden
           FROM punto_recogida
           WHERE id_ruta = $1
           ORDER BY orden ASC`,
          [ruta.id_ruta]
        );
        return { ...ruta, puntos: puntos.rows };
      })
    );

    res.json({ ok: true, rutas: rutasConPuntos });

  } catch (error) {
    console.error('Error al obtener rutas:', error.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener las rutas.' });
  }
});


// ═══════════════════════════════════════════════════════
//  RUTAS DE NOTIFICACIONES
// ═══════════════════════════════════════════════════════

// ─── GET /api/notificaciones ─────────────────────────────────
// Devuelve las notificaciones del usuario autenticado.
// Solo muestra las últimas 20 para no sobrecargar.
app.get('/api/notificaciones', verificarToken, async function(req, res) {
  try {
    var resultado = await pool.query(
      `SELECT n.id_notificacion, n.mensaje, n.fecha_hora, n.leida,
              c.placa AS camion_placa
       FROM notificacion n
       LEFT JOIN camion c ON c.id_camion = n.id_camion
       WHERE n.id_usuario = $1
       ORDER BY n.fecha_hora DESC
       LIMIT 20`,
      [req.usuario.id]
    );

    res.json({ ok: true, notificaciones: resultado.rows });

  } catch (error) {
    console.error('Error al obtener notificaciones:', error.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener notificaciones.' });
  }
});


// ─── PUT /api/notificaciones/:id/leida ───────────────────────
// Marca una notificación como leída cuando el usuario la abre.
app.put('/api/notificaciones/:id/leida', verificarToken, async function(req, res) {
  var idNotificacion = req.params.id;

  try {
    await pool.query(
      `UPDATE notificacion
       SET leida = TRUE
       WHERE id_notificacion = $1 AND id_usuario = $2`,
      [idNotificacion, req.usuario.id]
    );

    res.json({ ok: true, mensaje: 'Notificación marcada como leída.' });

  } catch (error) {
    console.error('Error al actualizar notificación:', error.message);
    res.status(500).json({ ok: false, mensaje: 'Error al actualizar la notificación.' });
  }
});


// ═══════════════════════════════════════════════════════
//  RUTAS DE USUARIO
// ═══════════════════════════════════════════════════════

// ─── GET /api/perfil ─────────────────────────────────────────
// Devuelve los datos del usuario autenticado (sin contraseña).
app.get('/api/perfil', verificarToken, async function(req, res) {
  try {
    var resultado = await pool.query(
      `SELECT id_usuario, nombre, correo, rol,
              ubicacion_lat, ubicacion_lng, sub_notificacion, fecha_registro
       FROM usuario
       WHERE id_usuario = $1`,
      [req.usuario.id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ ok: false, mensaje: 'Usuario no encontrado.' });
    }

    res.json({ ok: true, usuario: resultado.rows[0] });

  } catch (error) {
    console.error('Error al obtener perfil:', error.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener el perfil.' });
  }
});


// ─── PUT /api/perfil/ubicacion ───────────────────────────────
// Actualiza la ubicación actual del vecino para calcular
// qué camión está más cerca y enviarle alertas.
app.put('/api/perfil/ubicacion', verificarToken, async function(req, res) {
  var { latitud, longitud } = req.body;

  if (!latitud || !longitud) {
    return res.status(400).json({ ok: false, mensaje: 'Latitud y longitud son obligatorias.' });
  }

  try {
    await pool.query(
      `UPDATE usuario
       SET ubicacion_lat = $1, ubicacion_lng = $2
       WHERE id_usuario = $3`,
      [latitud, longitud, req.usuario.id]
    );

    res.json({ ok: true, mensaje: 'Ubicación actualizada correctamente.' });

  } catch (error) {
    console.error('Error al actualizar ubicación:', error.message);
    res.status(500).json({ ok: false, mensaje: 'Error al actualizar la ubicación.' });
  }
});


// ═══════════════════════════════════════════════════════
//  RUTA DE ESTADO DEL SERVIDOR (health check)
// ═══════════════════════════════════════════════════════
app.get('/api/estado', function(req, res) {
  res.json({ ok: true, mensaje: 'Servidor EcoRuta funcionando correctamente.' });
});


// ─── Iniciar el servidor ─────────────────────────────────────
var PUERTO = process.env.PORT || 3000;
app.listen(PUERTO, function() {
  console.log('');
  console.log('  EcoRuta Conectada — Servidor iniciado');
  console.log('  Escuchando en: http://localhost:' + PUERTO);

  // Iniciar el sistema de alertas automáticas
  iniciarSistemaAlertas();
});
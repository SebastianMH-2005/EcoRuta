// ═══════════════════════════════════════════════════════
//  EcoRuta Conectada — servidor.js
//  Backend principal: API REST con Express + PostgreSQL
//  Ejecutar con: node servidor.js
// ═══════════════════════════════════════════════════════

const express              = require('express');
const cors                 = require('cors');
const bcrypt               = require('bcrypt');
const jwt                  = require('jsonwebtoken');
const { Resend }           = require('resend');
const pool                 = require('./db');
const iniciarSistemaAlertas = require('./alertas');
require('dotenv').config();

const app    = express();
const resend = new Resend(process.env.RESEND_API_KEY);

/* Envía el correo de bienvenida al usuario recién registrado */
async function enviarCorreoBienvenida(nombre, correo) {
  try {
    await resend.emails.send({
      from:    'EcoRuta Conectada <onboarding@resend.dev>',
      to:      correo,
      subject: '¡Bienvenido a EcoRuta Conectada, ' + nombre + '!',
      html:
        '<div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#0d1f1a;color:#e8f5f0;border-radius:16px;overflow:hidden;">' +
          '<div style="background:#1D9E75;padding:2rem;text-align:center;">' +
            '<h1 style="margin:0;font-size:1.8rem;font-weight:800;color:#fff;">EcoRuta Conectada</h1>' +
            '<p style="margin:0.5rem 0 0;color:rgba(255,255,255,0.85);font-size:0.95rem;">Ciudades más limpias, vecinos más conectados</p>' +
          '</div>' +
          '<div style="padding:2rem;">' +
            '<h2 style="color:#1D9E75;margin-top:0;">¡Hola, ' + nombre + '!</h2>' +
            '<p style="color:#7ab89e;line-height:1.7;">Gracias por unirte a <strong style="color:#e8f5f0;">EcoRuta Conectada</strong>. Tu cuenta ha sido creada exitosamente.</p>' +
            '<p style="color:#7ab89e;line-height:1.7;">Ahora puedes:</p>' +
            '<ul style="color:#7ab89e;line-height:2;">' +
              '<li>📍 Ver en tiempo real los camiones recolectores de tu zona</li>' +
              '<li>🔔 Recibir alertas cuando el camión está cerca de tu calle</li>' +
              '<li>🚛 Solicitar que un camión pase por tu zona</li>' +
            '</ul>' +
            '<div style="text-align:center;margin:2rem 0;">' +
              '<a href="https://eco-ruta-hhd4.vercel.app" style="background:#1D9E75;color:#fff;padding:0.85rem 2rem;border-radius:10px;text-decoration:none;font-weight:700;font-size:1rem;">Ir a EcoRuta Conectada</a>' +
            '</div>' +
            '<p style="color:#7ab89e;font-size:0.8rem;margin-top:2rem;border-top:1px solid rgba(29,158,117,0.2);padding-top:1rem;">Si no creaste esta cuenta, puedes ignorar este correo.</p>' +
          '</div>' +
        '</div>'
    });
    console.log('  ✉ Correo de bienvenida enviado a: ' + correo);
  } catch (error) {
    console.error('  ✗ Error al enviar correo:', error.message);
  }
}

// ─── Middlewares globales ────────────────────────────────────
app.use(cors({
  origin: [
    'https://eco-ruta-hhd4.vercel.app',
    'http://localhost:3000',
    'http://127.0.0.1:5500',
    'http://localhost:5500'
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

  // Validación estricta del formato de correo
  // Solo acepta formatos como usuario@dominio.com o usuario@dominio.com.pe
  // Rechaza: .com.feliz, .feliz, dominios inventados de más de 4 letras
  var formatoCorreo = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,4}$/;
  if (!formatoCorreo.test(correo)) {
    return res.status(400).json({ ok: false, mensaje: 'Ingresa un correo electrónico válido.' });
  }

  // Rechazar correos con más de un punto seguido al final (ej: .com.feliz)
  var dominioPartes = correo.split('@')[1].split('.');
  var extension     = dominioPartes[dominioPartes.length - 1];
  if (extension.length > 4 || dominioPartes.length > 3) {
    return res.status(400).json({ ok: false, mensaje: 'El dominio del correo no es válido.' });
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

    var nuevoUsuario = resultado.rows[0];

    // Enviar correo de bienvenida real con Resend
    await enviarCorreoBienvenida(nombre, correo);

    res.status(201).json({
      ok: true,
      usuario: nuevoUsuario,
      mensaje: '¡Cuenta creada! Te enviamos un correo de bienvenida a ' + correo + '.'
    });

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
      WHERE c.estado_mantenimiento IN ('operativo', 'mantenimiento')
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
//  RUTA DE SOLICITUD DE CAMIÓN
// ═══════════════════════════════════════════════════════

// ─── POST /api/solicitud-camion ──────────────────────────────
// El vecino autenticado solicita que un camión pase por su zona.
// Guarda la solicitud en la tabla solicitud_camion.
app.post('/api/solicitud-camion', verificarToken, async function(req, res) {
  var { direccion, referencia, tipo_residuo, frecuencia } = req.body;

  if (!direccion) {
    return res.status(400).json({ ok: false, mensaje: 'La dirección es obligatoria.' });
  }

  try {
    var usuario = await pool.query(
      'SELECT nombre FROM usuario WHERE id_usuario = $1',
      [req.usuario.id]
    );

    var nombreUsuario = usuario.rows[0] ? usuario.rows[0].nombre : 'Vecino';

    await pool.query(
      `INSERT INTO solicitud_camion
        (id_usuario, direccion, distrito, tipo_residuo, frecuencia, descripcion)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        req.usuario.id,
        direccion,
        req.body.distrito    || null,
        tipo_residuo          || 'general',
        frecuencia            || 'diario',
        referencia            || null
      ]
    );

    console.log('  📍 Solicitud de camión de: ' + nombreUsuario + ' → ' + direccion);

    res.json({
      ok: true,
      mensaje: '¡Solicitud enviada! La municipalidad revisará tu pedido en 24 horas.'
    });

  } catch (error) {
    console.error('Error al guardar solicitud:', error.message);
    res.status(500).json({ ok: false, mensaje: 'Error al enviar la solicitud.' });
  }
});


// ═══════════════════════════════════════════════════════
//  RUTAS DE GESTIÓN MUNICIPAL
//  Solo accesibles para usuarios con rol municipalidad o admin
// ═══════════════════════════════════════════════════════

// Middleware: verificar que el usuario es municipalidad o admin
function verificarMunicipalidad(req, res, next) {
  if (req.usuario.rol !== 'municipalidad' && req.usuario.rol !== 'admin') {
    return res.status(403).json({
      ok: false,
      mensaje: 'Acceso denegado. Solo para usuarios municipales.'
    });
  }
  next();
}

// ─── GET /api/municipal/solicitudes ──────────────────────────
// Devuelve todas las solicitudes de camión ordenadas por fecha.
// La municipalidad ve aquí qué zonas necesitan cobertura.
app.get('/api/municipal/solicitudes',
  verificarToken,
  verificarMunicipalidad,
  async function(req, res) {
    try {
      var estado = req.query.estado || null;

      var consulta = `
        SELECT
          s.id_solicitud,
          s.direccion,
          s.distrito,
          s.tipo_residuo,
          s.frecuencia,
          s.descripcion,
          s.estado,
          s.fecha_solicitud,
          u.nombre    AS nombre_vecino,
          u.correo    AS correo_vecino
        FROM solicitud_camion s
        JOIN usuario u ON u.id_usuario = s.id_usuario
        ${estado ? 'WHERE s.estado = $1' : ''}
        ORDER BY s.fecha_solicitud DESC
      `;

      var resultado = estado
        ? await pool.query(consulta, [estado])
        : await pool.query(consulta);

      res.json({ ok: true, solicitudes: resultado.rows });

    } catch (error) {
      console.error('Error al obtener solicitudes:', error.message);
      res.status(500).json({ ok: false, mensaje: 'Error al obtener solicitudes.' });
    }
  }
);

// ─── PUT /api/municipal/solicitudes/:id ──────────────────────
// La municipalidad aprueba o rechaza una solicitud.
// Al aprobar se notifica automáticamente al vecino.
app.put('/api/municipal/solicitudes/:id',
  verificarToken,
  verificarMunicipalidad,
  async function(req, res) {
    var idSolicitud = req.params.id;
    var { estado, comentario } = req.body;

    if (!['aprobada', 'rechazada', 'en_proceso'].includes(estado)) {
      return res.status(400).json({
        ok: false,
        mensaje: 'Estado no válido. Usa: aprobada, rechazada o en_proceso.'
      });
    }

    try {
      // Actualizar el estado de la solicitud
      var solicitud = await pool.query(
        `UPDATE solicitud_camion
         SET estado = $1
         WHERE id_solicitud = $2
         RETURNING id_usuario, direccion`,
        [estado, idSolicitud]
      );

      if (solicitud.rows.length === 0) {
        return res.status(404).json({ ok: false, mensaje: 'Solicitud no encontrada.' });
      }

      var idVecino   = solicitud.rows[0].id_usuario;
      var direccion  = solicitud.rows[0].direccion;

      // Construir mensaje de notificación para el vecino
      var estadoTexto = {
        aprobada:   '✅ aprobada',
        rechazada:  '❌ rechazada',
        en_proceso: '🔄 en proceso'
      };

      var mensajeNotif =
        'Tu solicitud de recolección en ' + direccion +
        ' fue ' + estadoTexto[estado] + ' por la municipalidad.' +
        (comentario ? ' Comentario: ' + comentario : '');

      // Notificar al vecino
      await pool.query(
        `INSERT INTO notificacion (id_usuario, id_camion, mensaje)
         VALUES ($1, NULL, $2)`,
        [idVecino, mensajeNotif]
      );

      console.log('  ✓ Solicitud ' + idSolicitud + ' marcada como: ' + estado);

      res.json({
        ok: true,
        mensaje: 'Solicitud actualizada. El vecino fue notificado.'
      });

    } catch (error) {
      console.error('Error al actualizar solicitud:', error.message);
      res.status(500).json({ ok: false, mensaje: 'Error al actualizar la solicitud.' });
    }
  }
);

// ─── GET /api/municipal/estadisticas ─────────────────────────
// Resumen de estadísticas para el dashboard municipal.
app.get('/api/municipal/estadisticas',
  verificarToken,
  verificarMunicipalidad,
  async function(req, res) {
    try {
      var stats = await pool.query(`
        SELECT
          (SELECT COUNT(*) FROM usuario WHERE rol = 'vecino')          AS total_vecinos,
          (SELECT COUNT(*) FROM camion WHERE estado_mantenimiento = 'operativo') AS camiones_activos,
          (SELECT COUNT(*) FROM solicitud_camion WHERE estado = 'pendiente')     AS solicitudes_pendientes,
          (SELECT COUNT(*) FROM solicitud_camion WHERE estado = 'aprobada')      AS solicitudes_aprobadas,
          (SELECT COUNT(*) FROM notificacion WHERE fecha_hora > NOW() - INTERVAL '24 hours') AS alertas_hoy,
          (SELECT COUNT(*) FROM ecoruta WHERE estado = 'activa')       AS rutas_activas
      `);

      res.json({ ok: true, estadisticas: stats.rows[0] });

    } catch (error) {
      console.error('Error al obtener estadísticas:', error.message);
      res.status(500).json({ ok: false, mensaje: 'Error al obtener estadísticas.' });
    }
  }
);


// ═══════════════════════════════════════════════════════
//  CALIFICACIÓN DEL SERVICIO
// ═══════════════════════════════════════════════════════

// ─── POST /api/calificacion ──────────────────────────────────
// Guarda la calificación del vecino sobre el servicio del día.
app.post('/api/calificacion', verificarToken, async function(req, res) {
  var { puntuacion, comentario } = req.body;

  if (!puntuacion || puntuacion < 1 || puntuacion > 5) {
    return res.status(400).json({ ok: false, mensaje: 'La puntuación debe ser entre 1 y 5.' });
  }

  try {
    await pool.query(
      `INSERT INTO calificacion (id_usuario, puntuacion, comentario)
       VALUES ($1, $2, $3)`,
      [req.usuario.id, puntuacion, comentario || null]
    );

    console.log('  ⭐ Calificación guardada — Usuario: ' + req.usuario.id + ' · Puntuación: ' + puntuacion);

    res.json({ ok: true, mensaje: '¡Gracias por tu calificación!' });

  } catch (error) {
    console.error('Error al guardar calificación:', error.message);
    res.status(500).json({ ok: false, mensaje: 'Error al guardar la calificación.' });
  }
});

// ─── GET /api/calificacion/promedio ──────────────────────────
// Devuelve el promedio general de calificaciones del servicio.
app.get('/api/calificacion/promedio', async function(req, res) {
  try {
    var resultado = await pool.query(`
      SELECT
        ROUND(AVG(puntuacion), 1) AS promedio,
        COUNT(*)                  AS total
      FROM calificacion
    `);
    res.json({ ok: true, datos: resultado.rows[0] });
  } catch (error) {
    res.status(500).json({ ok: false, mensaje: 'Error al obtener promedio.' });
  }
});


// ═══════════════════════════════════════════════════════
//  RECUPERACIÓN DE CONTRASEÑA
// ═══════════════════════════════════════════════════════

// ─── POST /api/recuperar-contrasena ──────────────────────────
// Envía un correo con un enlace para restablecer la contraseña.
// Por ahora genera un token temporal y lo envía por correo.
app.post('/api/recuperar-contrasena', async function(req, res) {
  var { correo } = req.body;

  if (!correo) {
    return res.status(400).json({ ok: false, mensaje: 'El correo es obligatorio.' });
  }

  try {
    var resultado = await pool.query(
      'SELECT id_usuario, nombre FROM usuario WHERE correo = $1',
      [correo]
    );

    // Por seguridad, siempre responder lo mismo aunque no exista el correo
    if (resultado.rows.length === 0) {
      return res.json({ ok: true, mensaje: 'Si ese correo existe, recibirás instrucciones.' });
    }

    var usuario = resultado.rows[0];

    // Generar token temporal válido por 1 hora
    var tokenRecuperacion = jwt.sign(
      { id: usuario.id_usuario, tipo: 'recuperacion' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    var enlaceRecuperacion = 'https://eco-ruta-hhd4.vercel.app/recuperar.html?token=' + tokenRecuperacion;

    // Enviar correo con el enlace
    await resend.emails.send({
      from:    'EcoRuta Conectada <onboarding@resend.dev>',
      to:      correo,
      subject: 'Recuperación de contraseña — EcoRuta Conectada',
      html:
        '<div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#0d1f1a;color:#e8f5f0;border-radius:16px;overflow:hidden;">' +
          '<div style="background:#1D9E75;padding:2rem;text-align:center;">' +
            '<h1 style="margin:0;font-size:1.6rem;font-weight:800;color:#fff;">EcoRuta Conectada</h1>' +
          '</div>' +
          '<div style="padding:2rem;">' +
            '<h2 style="color:#1D9E75;">Recuperación de contraseña</h2>' +
            '<p style="color:#7ab89e;line-height:1.7;">Hola <strong style="color:#e8f5f0;">' + usuario.nombre + '</strong>, recibimos una solicitud para restablecer tu contraseña.</p>' +
            '<p style="color:#7ab89e;">Haz clic en el botón para crear una nueva contraseña. El enlace expira en <strong style="color:#EF9F27;">1 hora</strong>.</p>' +
            '<div style="text-align:center;margin:2rem 0;">' +
              '<a href="' + enlaceRecuperacion + '" style="background:#1D9E75;color:#fff;padding:0.85rem 2rem;border-radius:10px;text-decoration:none;font-weight:700;">Restablecer contraseña</a>' +
            '</div>' +
            '<p style="color:#7ab89e;font-size:0.8rem;border-top:1px solid rgba(29,158,117,0.2);padding-top:1rem;">Si no solicitaste esto, ignora este correo. Tu contraseña no cambiará.</p>' +
          '</div>' +
        '</div>'
    });

    console.log('  📧 Correo de recuperación enviado a: ' + correo);
    res.json({ ok: true, mensaje: 'Si ese correo existe, recibirás instrucciones.' });

  } catch (error) {
    console.error('Error en recuperación:', error.message);
    res.status(500).json({ ok: false, mensaje: 'Error al procesar la solicitud.' });
  }
});

// ─── POST /api/nueva-contrasena ──────────────────────────────
// Restablece la contraseña usando el token de recuperación.
app.post('/api/nueva-contrasena', async function(req, res) {
  var { token, nuevaContrasena } = req.body;

  if (!token || !nuevaContrasena) {
    return res.status(400).json({ ok: false, mensaje: 'Token y nueva contraseña son obligatorios.' });
  }

  if (nuevaContrasena.length < 6) {
    return res.status(400).json({ ok: false, mensaje: 'La contraseña debe tener al menos 6 caracteres.' });
  }

  try {
    var datos = jwt.verify(token, process.env.JWT_SECRET);

    if (datos.tipo !== 'recuperacion') {
      return res.status(400).json({ ok: false, mensaje: 'Token inválido.' });
    }

    var hash = await bcrypt.hash(nuevaContrasena, 10);

    await pool.query(
      'UPDATE usuario SET contrasena_hash = $1 WHERE id_usuario = $2',
      [hash, datos.id]
    );

    console.log('  ✓ Contraseña restablecida — Usuario ID: ' + datos.id);
    res.json({ ok: true, mensaje: '¡Contraseña actualizada correctamente! Ya puedes iniciar sesión.' });

  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(400).json({ ok: false, mensaje: 'El enlace expiró. Solicita uno nuevo.' });
    }
    console.error('Error al restablecer contraseña:', error.message);
    res.status(500).json({ ok: false, mensaje: 'Error al restablecer la contraseña.' });
  }
});

// ─── GET /api/mis-solicitudes ────────────────────────────────
app.get('/api/mis-solicitudes', verificarToken, async function(req, res) {
  try {
    var resultado = await pool.query(
      `SELECT id_solicitud, direccion, distrito, tipo_residuo,
              frecuencia, estado, fecha_solicitud
       FROM solicitud_camion
       WHERE id_usuario = $1
       ORDER BY fecha_solicitud DESC`,
      [req.usuario.id]
    );
    res.json({ ok: true, solicitudes: resultado.rows });
  } catch (error) {
    res.status(500).json({ ok: false, mensaje: 'Error al obtener solicitudes.' });
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
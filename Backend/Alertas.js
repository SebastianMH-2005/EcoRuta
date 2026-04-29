// ═══════════════════════════════════════════════════════
//  EcoRuta Conectada — alertas.js
//  Sistema de alertas automáticas de proximidad
//
//  Cómo funciona:
//  1. Cada 10 segundos revisa la posición de cada camión
//  2. Compara con la ubicación de cada vecino suscrito
//  3. Si la distancia es menor a 300 metros, crea una alerta
//  4. Evita enviar alertas repetidas en menos de 10 minutos
//
//  Se importa en servidor.js con: require('./alertas')(pool)
// ═══════════════════════════════════════════════════════

const pool = require('./db');

// ─── Configuración del sistema de alertas ────────────────────

// Distancia en metros a partir de la cual se genera una alerta
const DISTANCIA_ALERTA_METROS = 300;

// Tiempo mínimo en minutos entre dos alertas del mismo camión
// al mismo usuario (para no saturar con mensajes repetidos)
const MINUTOS_ENTRE_ALERTAS = 10;

// Intervalo en milisegundos entre cada revisión automática
const INTERVALO_REVISION_MS = 10000; // 10 segundos


// ═══════════════════════════════════════════════════════
//  FUNCIÓN PRINCIPAL: calcular distancia entre dos puntos
//  Usa la fórmula de Haversine, que tiene en cuenta
//  la curvatura de la Tierra para mayor precisión.
//  Devuelve la distancia en metros.
// ═══════════════════════════════════════════════════════
function calcularDistanciaMetros(lat1, lng1, lat2, lng2) {
  var RADIO_TIERRA_KM = 6371;

  // Convertir grados a radianes
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLng = (lng2 - lng1) * Math.PI / 180;

  var lat1Rad = lat1 * Math.PI / 180;
  var lat2Rad = lat2 * Math.PI / 180;

  // Fórmula de Haversine
  var a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);

  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  // Distancia en metros
  return RADIO_TIERRA_KM * c * 1000;
}


// ═══════════════════════════════════════════════════════
//  FUNCIÓN: obtener la última posición GPS de cada camión
//  Solo trae camiones operativos que tienen posición GPS
//  registrada en los últimos 30 minutos (camiones activos).
// ═══════════════════════════════════════════════════════
async function obtenerPosicionesCamiones() {
  var resultado = await pool.query(`
    SELECT
      c.id_camion,
      c.placa,
      e.nombre    AS nombre_ruta,
      g.latitud,
      g.longitud,
      g.timestamp AS ultima_senal
    FROM camion c
    JOIN ecoruta e ON e.id_camion = c.id_camion
    JOIN LATERAL (
      SELECT latitud, longitud, timestamp
      FROM gps
      WHERE id_camion = c.id_camion
        AND timestamp > NOW() - INTERVAL '30 minutes'
      ORDER BY timestamp DESC
      LIMIT 1
    ) g ON true
    WHERE c.estado_mantenimiento = 'operativo'
      AND e.estado = 'activa'
  `);

  return resultado.rows;
}


// ═══════════════════════════════════════════════════════
//  FUNCIÓN: obtener vecinos suscritos con ubicación guardada
//  Solo trae usuarios que activaron las notificaciones
//  y que tienen su ubicación registrada en el sistema.
// ═══════════════════════════════════════════════════════
async function obtenerVecinosSuscritos() {
  var resultado = await pool.query(`
    SELECT
      id_usuario,
      nombre,
      ubicacion_lat,
      ubicacion_lng
    FROM usuario
    WHERE sub_notificacion = TRUE
      AND ubicacion_lat IS NOT NULL
      AND ubicacion_lng IS NOT NULL
      AND rol = 'vecino'
  `);

  return resultado.rows;
}


// ═══════════════════════════════════════════════════════
//  FUNCIÓN: verificar si ya se envió una alerta reciente
//  Evita enviar el mismo mensaje al mismo usuario por el
//  mismo camión si ya fue notificado hace poco tiempo.
// ═══════════════════════════════════════════════════════
async function yaFueNotificadoReciente(idUsuario, idCamion) {
  var resultado = await pool.query(`
    SELECT id_notificacion
    FROM notificacion
    WHERE id_usuario = $1
      AND id_camion  = $2
      AND fecha_hora > NOW() - INTERVAL '${MINUTOS_ENTRE_ALERTAS} minutes'
    LIMIT 1
  `, [idUsuario, idCamion]);

  return resultado.rows.length > 0;
}


// ═══════════════════════════════════════════════════════
//  FUNCIÓN: crear una notificación en la base de datos
//  Registra la alerta para que el frontend la muestre
//  y el vecino pueda verla en su historial.
// ═══════════════════════════════════════════════════════
async function crearNotificacion(idUsuario, idCamion, mensaje) {
  await pool.query(`
    INSERT INTO notificacion (id_usuario, id_camion, mensaje)
    VALUES ($1, $2, $3)
  `, [idUsuario, idCamion, mensaje]);
}


// ═══════════════════════════════════════════════════════
//  FUNCIÓN: construir el mensaje de la alerta
//  Genera un texto descriptivo según la distancia real
//  entre el camión y el vecino.
// ═══════════════════════════════════════════════════════
function construirMensaje(placa, nombreRuta, distanciaMetros) {
  var distanciaRedondeada = Math.round(distanciaMetros);
  var tiempoEstimado;

  // Estimar tiempo de llegada según distancia
  // (asumiendo velocidad promedio de 15 km/h en zona urbana)
  var minutosEstimados = Math.ceil((distanciaMetros / 1000) / 15 * 60);

  if (minutosEstimados <= 1) {
    tiempoEstimado = 'menos de 1 minuto';
  } else if (minutosEstimados <= 5) {
    tiempoEstimado = 'aproximadamente ' + minutosEstimados + ' minutos';
  } else {
    tiempoEstimado = 'unos ' + minutosEstimados + ' minutos';
  }

  return (
    '🚛 El camión ' + placa + ' (' + nombreRuta + ') ' +
    'está a ' + distanciaRedondeada + ' metros de tu ubicación. ' +
    'Llegará en ' + tiempoEstimado + '. ' +
    '¡Prepara tus residuos!'
  );
}


// ═══════════════════════════════════════════════════════
//  FUNCIÓN CENTRAL: revisar proximidad y generar alertas
//  Esta función se ejecuta automáticamente cada 10 segundos.
//  Compara cada camión activo con cada vecino suscrito.
// ═══════════════════════════════════════════════════════
async function revisarProximidadYAlertar() {
  try {
    // Obtener camiones activos con posición GPS reciente
    var camiones = await obtenerPosicionesCamiones();

    // Si no hay camiones activos en este momento, no hacer nada
    if (camiones.length === 0) return;

    // Obtener vecinos que tienen notificaciones activadas
    var vecinos = await obtenerVecinosSuscritos();

    // Si no hay vecinos suscritos, no hacer nada
    if (vecinos.length === 0) return;

    var alertasGeneradas = 0;

    // Comparar cada camión con cada vecino
    for (var i = 0; i < camiones.length; i++) {
      var camion = camiones[i];

      for (var j = 0; j < vecinos.length; j++) {
        var vecino = vecinos[j];

        // Calcular distancia entre el camión y el vecino
        var distancia = calcularDistanciaMetros(
          parseFloat(camion.latitud),
          parseFloat(camion.longitud),
          parseFloat(vecino.ubicacion_lat),
          parseFloat(vecino.ubicacion_lng)
        );

        // Si está dentro del radio de alerta (300 metros)
        if (distancia <= DISTANCIA_ALERTA_METROS) {

          // Verificar que no se haya enviado una alerta reciente
          var yaNotificado = await yaFueNotificadoReciente(
            vecino.id_usuario,
            camion.id_camion
          );

          if (!yaNotificado) {
            // Construir y guardar la notificación
            var mensaje = construirMensaje(
              camion.placa,
              camion.nombre_ruta,
              distancia
            );

            await crearNotificacion(
              vecino.id_usuario,
              camion.id_camion,
              mensaje
            );

            alertasGeneradas++;

            console.log(
              '  ✓ Alerta enviada → Usuario: ' + vecino.nombre +
              ' | Camión: ' + camion.placa +
              ' | Distancia: ' + Math.round(distancia) + 'm'
            );
          }
        }
      }
    }

    if (alertasGeneradas > 0) {
      console.log('  Total alertas generadas: ' + alertasGeneradas);
    }

  } catch (error) {
    console.error('  ✗ Error en revisión de alertas:', error.message);
  }
}


// ═══════════════════════════════════════════════════════
//  FUNCIÓN: marcar puntos de recogida como completados
//  Cuando un camión pasa cerca de un punto de recogida
//  (menos de 50 metros), lo marca como "recogido".
//  Esto actualiza el estado de la ruta en tiempo real.
// ═══════════════════════════════════════════════════════
async function actualizarPuntosRecogida() {
  try {
    var camiones = await obtenerPosicionesCamiones();

    for (var i = 0; i < camiones.length; i++) {
      var camion = camiones[i];

      // Obtener puntos de recogida pendientes de la ruta de este camión
      var puntos = await pool.query(`
        SELECT pr.id_punto, pr.latitud, pr.longitud, pr.direccion
        FROM punto_recogida pr
        JOIN ecoruta e ON e.id_ruta = pr.id_ruta
        WHERE e.id_camion = $1
          AND pr.estado   = 'pendiente'
      `, [camion.id_camion]);

      for (var j = 0; j < puntos.rows.length; j++) {
        var punto = puntos.rows[j];

        var distancia = calcularDistanciaMetros(
          parseFloat(camion.latitud),
          parseFloat(camion.longitud),
          parseFloat(punto.latitud),
          parseFloat(punto.longitud)
        );

        // Si el camión está a menos de 50 metros del punto, marcarlo como recogido
        if (distancia <= 50) {
          await pool.query(`
            UPDATE punto_recogida
            SET estado = 'recogido'
            WHERE id_punto = $1
          `, [punto.id_punto]);

          console.log(
            '  ✓ Punto recogido → ' + punto.direccion +
            ' (Camión: ' + camion.placa + ')'
          );
        }
      }
    }

  } catch (error) {
    console.error('  ✗ Error al actualizar puntos de recogida:', error.message);
  }
}


// ═══════════════════════════════════════════════════════
//  EXPORTAR: iniciar el sistema de alertas
//  Esta función se llama desde servidor.js al arrancar.
//  Lanza los dos procesos automáticos en paralelo.
// ═══════════════════════════════════════════════════════
function iniciarSistemaAlertas() {
  console.log('');
  console.log('  Sistema de alertas automáticas iniciado');
  console.log('  Radio de alerta:    ' + DISTANCIA_ALERTA_METROS + ' metros');
  console.log('  Intervalo revisión: ' + (INTERVALO_REVISION_MS / 1000) + ' segundos');
  console.log('');

  // Revisar proximidad y generar alertas cada 10 segundos
  setInterval(revisarProximidadYAlertar, INTERVALO_REVISION_MS);

  // Actualizar puntos de recogida cada 15 segundos
  setInterval(actualizarPuntosRecogida, INTERVALO_REVISION_MS + 5000);

  // Ejecutar la primera revisión inmediatamente al arrancar
  revisarProximidadYAlertar();
}

module.exports = iniciarSistemaAlertas;
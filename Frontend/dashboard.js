/* ═══════════════════════════════════════════
   EcoRuta Conectada — dashboard.js
   Lógica del panel de gestión municipal
   ═══════════════════════════════════════════ */

/* URL del backend */
var URL_BACKEND = window.location.hostname === 'localhost'
  ? 'http://localhost:3000'
  : 'https://ecoruta-production.up.railway.app';

/* Token y datos de sesión del panel */
var tokenDash     = null;
var solicitudActual = null;

/* ══════════════════════════════════════
   1. LOGIN DEL DASHBOARD
   ══════════════════════════════════════ */

var botonLoginDash  = document.getElementById('botonLoginDash');
var dashCorreo      = document.getElementById('dashCorreo');
var dashContrasena  = document.getElementById('dashContrasena');
var mensajeLoginDash = document.getElementById('mensajeLoginDash');
var textoLoginDash  = document.getElementById('textoLoginDash');

function mostrarErrorLogin(msg) {
  textoLoginDash.textContent = msg;
  mensajeLoginDash.className = 'mensaje-dash visible';
}

botonLoginDash.addEventListener('click', async function() {
  var correo     = dashCorreo.value.trim();
  var contrasena = dashContrasena.value.trim();

  if (!correo || !contrasena) {
    mostrarErrorLogin('Completa todos los campos.');
    return;
  }

  botonLoginDash.disabled    = true;
  botonLoginDash.textContent = 'Verificando...';
  mensajeLoginDash.className = 'mensaje-dash';

  try {
    var resp  = await fetch(URL_BACKEND + '/api/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ correo: correo, contrasena: contrasena })
    });
    var datos = await resp.json();

    if (!datos.ok) {
      mostrarErrorLogin(datos.mensaje);
      return;
    }

    /* Verificar que el rol sea municipalidad o admin */
    if (datos.rol !== 'municipalidad' && datos.rol !== 'admin') {
      mostrarErrorLogin('Acceso denegado. Solo para usuarios municipales.');
      return;
    }

    /* Guardar token y mostrar el panel */
    tokenDash = datos.token;
    localStorage.setItem('dash_token',   datos.token);
    localStorage.setItem('dash_nombre',  datos.nombre);
    localStorage.setItem('dash_rol',     datos.rol);

    iniciarPanel(datos.nombre, datos.rol);

  } catch (error) {
    mostrarErrorLogin('No se pudo conectar con el servidor.');
  } finally {
    botonLoginDash.disabled    = false;
    botonLoginDash.innerHTML   = '<i class="bi bi-box-arrow-in-right"></i> Ingresar al panel';
  }
});

/* Enter en contraseña dispara el login */
dashContrasena.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') botonLoginDash.click();
});

/* Verificar sesión guardada al cargar */
(function verificarSesionGuardada() {
  var t = localStorage.getItem('dash_token');
  var n = localStorage.getItem('dash_nombre');
  var r = localStorage.getItem('dash_rol');
  if (t && (r === 'municipalidad' || r === 'admin')) {
    tokenDash = t;
    iniciarPanel(n, r);
  }
})();

/* ══════════════════════════════════════
   2. INICIAR PANEL
   ══════════════════════════════════════ */

function iniciarPanel(nombre, rol) {
  document.getElementById('pantallaLoginDash').style.display  = 'none';
  document.getElementById('contenedorDash').style.display     = 'grid';
  document.getElementById('sidebarUsuario').textContent       = nombre;
  document.getElementById('sidebarRol').textContent           = rol === 'admin' ? 'Administrador' : 'Municipalidad';

  cargarEstadisticas();
  cargarFlota();
}

/* ══════════════════════════════════════
   3. NAVEGACIÓN ENTRE SECCIONES
   ══════════════════════════════════════ */

var titulosDash = {
  estadisticas: ['Estadísticas generales',  'Resumen del sistema EcoRuta'],
  solicitudes:  ['Gestión de solicitudes',   'Aprueba o rechaza las solicitudes de los vecinos'],
  camiones:     ['Flota de camiones',        'Estado actual de todos los vehículos registrados']
};

document.querySelectorAll('.sidebar-link').forEach(function(link) {
  link.addEventListener('click', function(e) {
    e.preventDefault();
    var seccion = this.dataset.seccion;

    document.querySelectorAll('.sidebar-link').forEach(function(l) { l.classList.remove('activo'); });
    this.classList.add('activo');

    document.querySelectorAll('.seccion-dash').forEach(function(s) { s.style.display = 'none'; });
    document.getElementById('seccion' + capitalizar(seccion)).style.display = 'block';

    document.getElementById('tituloDash').textContent    = titulosDash[seccion][0];
    document.getElementById('subtituloDash').textContent = titulosDash[seccion][1];

    if (seccion === 'solicitudes') cargarSolicitudes('');
    if (seccion === 'camiones')    cargarTablaFlota();
  });
});

function capitalizar(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/* ══════════════════════════════════════
   4. ESTADÍSTICAS
   ══════════════════════════════════════ */

async function cargarEstadisticas() {
  try {
    var resp  = await fetch(URL_BACKEND + '/api/municipal/estadisticas', {
      headers: { 'Authorization': 'Bearer ' + tokenDash }
    });
    var datos = await resp.json();

    if (!datos.ok) return;
    var s = datos.estadisticas;

    document.getElementById('statVecinos').textContent        = s.total_vecinos        || 0;
    document.getElementById('statCamiones').textContent       = s.camiones_operativos  || 0;
    document.getElementById('statNotificaciones').textContent = s.notificaciones_hoy   || 0;
    document.getElementById('statPendientes').textContent     = s.solicitudes_pendientes || 0;

  } catch (error) {
    console.error('Error al cargar estadísticas:', error.message);
  }
}

/* ══════════════════════════════════════
   5. FLOTA (resumen en estadísticas)
   ══════════════════════════════════════ */

async function cargarFlota() {
  try {
    var resp  = await fetch(URL_BACKEND + '/api/camiones', {
      headers: { 'Authorization': 'Bearer ' + tokenDash }
    });
    var datos = await resp.json();
    if (!datos.ok) return;

    var contenedor = document.getElementById('listaFlota');
    if (!datos.camiones || datos.camiones.length === 0) {
      contenedor.innerHTML = '<div class="estado-vacio"><i class="bi bi-truck"></i><p>No hay camiones registrados.</p></div>';
      return;
    }

    contenedor.innerHTML = datos.camiones.map(function(c) {
      var claseEstado = 'flota-' + (c.estado_mantenimiento || 'inactivo').replace(' ', '');
      return (
        '<div class="item-flota">' +
          '<div>' +
            '<div class="flota-placa">🚛 ' + c.placa + '</div>' +
            '<div class="flota-ruta">' + (c.nombre_ruta || 'Sin ruta asignada') + '</div>' +
          '</div>' +
          '<span class="flota-estado ' + claseEstado + '">' + (c.estado_mantenimiento || 'inactivo') + '</span>' +
        '</div>'
      );
    }).join('');

  } catch (error) {
    console.error('Error al cargar flota:', error.message);
  }
}

/* ══════════════════════════════════════
   6. ÚLTIMAS SOLICITUDES (en estadísticas)
   ══════════════════════════════════════ */

async function cargarUltimasSolicitudes() {
  try {
    var resp  = await fetch(URL_BACKEND + '/api/municipal/solicitudes?estado=pendiente', {
      headers: { 'Authorization': 'Bearer ' + tokenDash }
    });
    var datos = await resp.json();
    if (!datos.ok) return;

    var contenedor = document.getElementById('ultimasSolicitudes');
    var lista      = datos.solicitudes.slice(0, 5);

    if (lista.length === 0) {
      contenedor.innerHTML = '<div class="estado-vacio"><i class="bi bi-inbox"></i><p>No hay solicitudes pendientes.</p></div>';
      return;
    }

    contenedor.innerHTML = lista.map(function(s) {
      return (
        '<div class="item-flota">' +
          '<div>' +
            '<div class="flota-placa" style="color:var(--texto);">' + s.direccion + '</div>' +
            '<div class="flota-ruta">' + (s.nombre_vecino || '—') + ' · ' + (s.distrito || 'Sin distrito') + '</div>' +
          '</div>' +
          '<span class="sol-badge sol-pendiente">Pendiente</span>' +
        '</div>'
      );
    }).join('');

  } catch (error) {
    console.error('Error al cargar últimas solicitudes:', error.message);
  }
}

/* ══════════════════════════════════════
   7. TABLA DE SOLICITUDES
   ══════════════════════════════════════ */

var filtroActual = '';

document.querySelectorAll('.boton-filtro').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.boton-filtro').forEach(function(b) { b.classList.remove('activo'); });
    this.classList.add('activo');
    filtroActual = this.dataset.filtro;
    cargarSolicitudes(filtroActual);
  });
});

async function cargarSolicitudes(estado) {
  var contenedor = document.getElementById('tablaSolicitudes');
  contenedor.innerHTML = '<div class="estado-vacio"><i class="bi bi-hourglass-split"></i><p>Cargando solicitudes...</p></div>';

  try {
    var url  = URL_BACKEND + '/api/municipal/solicitudes' + (estado ? '?estado=' + estado : '');
    var resp = await fetch(url, { headers: { 'Authorization': 'Bearer ' + tokenDash } });
    var datos = await resp.json();

    if (!datos.ok || datos.solicitudes.length === 0) {
      contenedor.innerHTML = '<div class="estado-vacio"><i class="bi bi-inbox"></i><p>No hay solicitudes' + (estado ? ' con estado "' + estado + '"' : '') + '.</p></div>';
      return;
    }

    contenedor.innerHTML = datos.solicitudes.map(function(s) {
      var fecha = new Date(s.fecha_solicitud).toLocaleDateString('es-PE', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });
      return (
        '<div class="fila-solicitud" onclick="abrirModalSolicitud(' + JSON.stringify(s).replace(/"/g, '&quot;') + ')">' +
          '<div>' +
            '<div class="sol-direccion">📍 ' + s.direccion + (s.distrito ? ', ' + s.distrito : '') + '</div>' +
            '<div class="sol-meta">' + s.tipo_residuo + ' · ' + s.frecuencia + ' · ' + fecha + '</div>' +
            '<div class="sol-vecino"><i class="bi bi-person-fill"></i> ' + (s.nombre_vecino || '—') + ' — ' + (s.correo_vecino || '') + '</div>' +
          '</div>' +
          '<span class="sol-badge sol-' + s.estado + '">' + s.estado + '</span>' +
        '</div>'
      );
    }).join('');

  } catch (error) {
    contenedor.innerHTML = '<div class="estado-vacio"><i class="bi bi-wifi-off"></i><p>Error al cargar solicitudes.</p></div>';
    console.error(error.message);
  }
}

/* ══════════════════════════════════════
   8. MODAL DE GESTIÓN DE SOLICITUD
   ══════════════════════════════════════ */

var fondoModalDash = document.getElementById('fondoModalDash');
var cerrarModalDash = document.getElementById('cerrarModalDash');

cerrarModalDash.addEventListener('click', function() {
  fondoModalDash.classList.remove('activo');
  solicitudActual = null;
});

fondoModalDash.addEventListener('click', function(e) {
  if (e.target === fondoModalDash) {
    fondoModalDash.classList.remove('activo');
    solicitudActual = null;
  }
});

window.abrirModalSolicitud = function(solicitud) {
  solicitudActual = solicitud;

  document.getElementById('modalDashTitulo').textContent = 'Solicitud #' + solicitud.id_solicitud;

  document.getElementById('modalDashCuerpo').innerHTML =
    '<div class="modal-fila"><span class="modal-fila-etq">Dirección:</span><span class="modal-fila-val">' + solicitud.direccion + '</span></div>' +
    '<div class="modal-fila"><span class="modal-fila-etq">Distrito:</span><span class="modal-fila-val">' + (solicitud.distrito || '—') + '</span></div>' +
    '<div class="modal-fila"><span class="modal-fila-etq">Vecino:</span><span class="modal-fila-val">' + (solicitud.nombre_vecino || '—') + '</span></div>' +
    '<div class="modal-fila"><span class="modal-fila-etq">Correo:</span><span class="modal-fila-val">' + (solicitud.correo_vecino || '—') + '</span></div>' +
    '<div class="modal-fila"><span class="modal-fila-etq">Tipo residuo:</span><span class="modal-fila-val">' + solicitud.tipo_residuo + '</span></div>' +
    '<div class="modal-fila"><span class="modal-fila-etq">Frecuencia:</span><span class="modal-fila-val">' + solicitud.frecuencia + '</span></div>' +
    '<div class="modal-fila"><span class="modal-fila-etq">Estado actual:</span><span class="sol-badge sol-' + solicitud.estado + '" style="display:inline-block;">' + solicitud.estado + '</span></div>' +
    (solicitud.descripcion ? '<div class="modal-fila"><span class="modal-fila-etq">Descripción:</span><span class="modal-fila-val">' + solicitud.descripcion + '</span></div>' : '') +
    '<div class="campo-comentario">' +
      '<label>Comentario para el vecino (opcional):</label>' +
      '<textarea id="comentarioGestion" placeholder="Ej: Se asignará la unidad ABC-123 el próximo lunes..."></textarea>' +
    '</div>';

  fondoModalDash.classList.add('activo');
};

/* Botones de acción del modal */
document.getElementById('botonAprobar').addEventListener('click',    function() { gestionarSolicitud('aprobada'); });
document.getElementById('botonEnProceso').addEventListener('click',  function() { gestionarSolicitud('en_proceso'); });
document.getElementById('botonRechazar').addEventListener('click',   function() { gestionarSolicitud('rechazada'); });

async function gestionarSolicitud(nuevoEstado) {
  if (!solicitudActual) return;

  var comentario = (document.getElementById('comentarioGestion') || {}).value || '';

  try {
    var resp = await fetch(URL_BACKEND + '/api/municipal/solicitudes/' + solicitudActual.id_solicitud, {
      method:  'PUT',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': 'Bearer ' + tokenDash
      },
      body: JSON.stringify({ estado: nuevoEstado, comentario: comentario })
    });

    var datos = await resp.json();

    if (datos.ok) {
      fondoModalDash.classList.remove('activo');
      solicitudActual = null;
      cargarSolicitudes(filtroActual);
      cargarEstadisticas();
    } else {
      alert('Error: ' + datos.mensaje);
    }

  } catch (error) {
    alert('No se pudo conectar con el servidor.');
    console.error(error.message);
  }
}

/* ══════════════════════════════════════
   9. TABLA DE FLOTA COMPLETA
   ══════════════════════════════════════ */

async function cargarTablaFlota() {
  var contenedor = document.getElementById('tablaFlota');
  contenedor.innerHTML = '<div class="estado-vacio"><i class="bi bi-hourglass-split"></i><p>Cargando flota...</p></div>';

  try {
    var resp  = await fetch(URL_BACKEND + '/api/camiones', {
      headers: { 'Authorization': 'Bearer ' + tokenDash }
    });
    var datos = await resp.json();

    if (!datos.ok || datos.camiones.length === 0) {
      contenedor.innerHTML = '<div class="estado-vacio"><i class="bi bi-truck"></i><p>No hay camiones registrados.</p></div>';
      return;
    }

    contenedor.innerHTML = datos.camiones.map(function(c) {
      var claseEstado = 'sol-' + (c.estado_mantenimiento === 'operativo' ? 'aprobada' : c.estado_mantenimiento === 'mantenimiento' ? 'en_proceso' : 'rechazada');
      return (
        '<div class="fila-solicitud">' +
          '<div>' +
            '<div class="sol-direccion">🚛 ' + c.placa + (c.modelo ? ' — ' + c.modelo : '') + '</div>' +
            '<div class="sol-meta">' + (c.nombre_ruta || 'Sin ruta asignada') + ' · ' + (c.zona || '') + '</div>' +
            '<div class="sol-meta">Horario: ' + (c.hora_inicio || '—') + ' → ' + (c.hora_fin || '—') + '</div>' +
          '</div>' +
          '<span class="sol-badge ' + claseEstado + '">' + (c.estado_mantenimiento || 'inactivo') + '</span>' +
        '</div>'
      );
    }).join('');

  } catch (error) {
    contenedor.innerHTML = '<div class="estado-vacio"><i class="bi bi-wifi-off"></i><p>Error al cargar la flota.</p></div>';
    console.error(error.message);
  }
}

/* ══════════════════════════════════════
   10. CERRAR SESIÓN Y REFRESCAR
   ══════════════════════════════════════ */

document.getElementById('botonSalirDash').addEventListener('click', function() {
  localStorage.removeItem('dash_token');
  localStorage.removeItem('dash_nombre');
  localStorage.removeItem('dash_rol');
  tokenDash = null;
  document.getElementById('contenedorDash').style.display    = 'none';
  document.getElementById('pantallaLoginDash').style.display = 'flex';
  dashCorreo.value     = '';
  dashContrasena.value = '';
});

document.getElementById('botonRefrescar').addEventListener('click', function() {
  var seccionActiva = document.querySelector('.sidebar-link.activo');
  if (seccionActiva) {
    var seccion = seccionActiva.dataset.seccion;
    if (seccion === 'estadisticas') { cargarEstadisticas(); cargarFlota(); cargarUltimasSolicitudes(); }
    if (seccion === 'solicitudes')  cargarSolicitudes(filtroActual);
    if (seccion === 'camiones')     cargarTablaFlota();
  }
  this.style.transform = 'rotate(360deg)';
  setTimeout(function() {
    document.getElementById('botonRefrescar').style.transform = '';
  }, 600);
});
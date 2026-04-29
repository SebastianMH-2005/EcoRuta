/* ═══════════════════════════════════════════════════════
   EcoRuta Conectada — aplicacion.js
   Lógica principal: mapa, camiones, alertas, login
   ═══════════════════════════════════════════════════════ */

/* ══════════════════════════════════════
   1. MODAL DE INICIO DE SESIÓN
   ══════════════════════════════════════ */

var fondoModal       = document.getElementById('fondoModal');
var botonAbrir       = document.getElementById('botonAbrirLogin');
var botonCerrar      = document.getElementById('botonCerrarLogin');
var botonIngresar    = document.getElementById('botonIngresar');
var campoCorreo      = document.getElementById('campoCorreo');
var campoContrasena  = document.getElementById('campoContrasena');
var mensajeError     = document.getElementById('mensajeError');
var textoError       = document.getElementById('textoError');
var botonOjo         = document.getElementById('botonMostrarClave');
var iconoOjo         = document.getElementById('iconoOjo');

/* Abrir el modal al hacer clic en el botón del navbar */
botonAbrir.addEventListener('click', abrirModal);

/* Cerrar el modal con el botón X */
botonCerrar.addEventListener('click', function() {
  cerrarModal();
});

/* Cerrar el modal al hacer clic fuera de la tarjeta */
fondoModal.addEventListener('click', function(evento) {
  if (evento.target === fondoModal) {
    cerrarModal();
  }
});

/* Cerrar el modal con la tecla Escape */
document.addEventListener('keydown', function(evento) {
  if (evento.key === 'Escape' && fondoModal.classList.contains('activo')) {
    cerrarModal();
  }
});

/* Función que cierra y limpia el modal */
function cerrarModal() {
  fondoModal.classList.remove('activo');
  document.body.style.overflow = '';
  mensajeError.classList.remove('visible');
  campoContrasena.value = '';
}

/* Mostrar u ocultar la contraseña con el botón del ojo */
botonOjo.addEventListener('click', function() {
  if (campoContrasena.type === 'password') {
    campoContrasena.type = 'text';
    iconoOjo.className = 'bi bi-eye-slash-fill';
  } else {
    campoContrasena.type = 'password';
    iconoOjo.className = 'bi bi-eye-fill';
  }
});

/* URL del backend: detecta automáticamente si estás en local o en producción */
var URL_BACKEND = window.location.hostname === 'localhost'
  ? 'http://localhost:3000'
  : 'https://ecoruta-production.up.railway.app';

/* Muestra un mensaje de error en el formulario de login */
function mostrarError(mensaje) {
  textoError.textContent         = mensaje;
  mensajeError.style.background  = '';
  mensajeError.style.borderColor = '';
  mensajeError.style.color       = '';
  mensajeError.classList.add('visible');
}

/* Muestra un mensaje de éxito en el formulario de login */
function mostrarExito(mensaje) {
  textoError.textContent         = mensaje;
  mensajeError.style.background  = 'rgba(29,158,117,0.12)';
  mensajeError.style.borderColor = 'rgba(29,158,117,0.35)';
  mensajeError.style.color       = '#1D9E75';
  mensajeError.classList.add('visible');
}

/* Bloquea o desbloquea el botón de ingresar mientras espera respuesta */
function cambiarEstadoBoton(cargando) {
  botonIngresar.disabled     = cargando;
  botonIngresar.textContent  = cargando
    ? 'Verificando...'
    : 'Iniciar sesión';
}

/* Guarda los datos de sesión en localStorage para mantener al usuario conectado */
function guardarSesion(token, nombre, rol) {
  localStorage.setItem('eco_token',   token);
  localStorage.setItem('eco_nombre',  nombre);
  localStorage.setItem('eco_rol',     rol);
}

/* Actualiza la interfaz del navbar cuando el usuario está autenticado */
function actualizarNavbar(nombre) {
  var botonNav = document.getElementById('botonAbrirLogin');
  if (botonNav) {
    botonNav.innerHTML = '<i class="bi bi-person-check-fill"></i> ' + nombre;
    botonNav.style.background  = 'rgba(29,158,117,0.2)';
    botonNav.style.borderColor = 'rgba(29,158,117,0.5)';
    botonNav.style.cursor      = 'default';
    botonNav.removeEventListener('click', abrirModal);
  }
}

/* Referencia a la función para poder removerla del evento */
function abrirModal() {
  fondoModal.classList.add('activo');
  document.body.style.overflow = 'hidden';
  campoCorreo.focus();
}

/* Inicio de sesión conectado al backend real */
botonIngresar.addEventListener('click', async function() {
  var correo     = campoCorreo.value.trim();
  var contrasena = campoContrasena.value.trim();

  /* Validar que los campos no estén vacíos */
  if (correo === '' || contrasena === '') {
    mostrarError('Por favor completa todos los campos.');
    return;
  }

  /* Validar formato básico del correo */
  var formatoCorreo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!formatoCorreo.test(correo)) {
    mostrarError('Ingresa un correo electrónico válido.');
    return;
  }

  /* Bloquear botón mientras espera respuesta del servidor */
  cambiarEstadoBoton(true);
  mensajeError.classList.remove('visible');

  try {
    /* Llamada a la API del backend */
    var respuesta = await fetch(URL_BACKEND + '/api/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ correo: correo, contrasena: contrasena })
    });

    var datos = await respuesta.json();

    if (datos.ok) {
      /* Login exitoso: guardar sesión y actualizar la interfaz */
      guardarSesion(datos.token, datos.nombre, datos.rol);
      mostrarExito('✓ Bienvenido, ' + datos.nombre + '. Ingresando...');

      setTimeout(function() {
        cerrarModal();
        actualizarNavbar(datos.nombre);
        /* Aquí puedes redirigir al dashboard según el rol */
        /* if (datos.rol === 'admin') window.location.href = '/dashboard.html'; */
      }, 1500);

    } else {
      /* El servidor respondió con un error conocido */
      mostrarError(datos.mensaje);
    }

  } catch (error) {
    /* Error de red: el servidor no responde */
    mostrarError('No se pudo conectar con el servidor. Intenta de nuevo.');
    console.error('Error de conexión:', error.message);

  } finally {
    /* Siempre desbloquear el botón al terminar */
    cambiarEstadoBoton(false);
  }
});

/* Permitir enviar el formulario presionando Enter */
campoContrasena.addEventListener('keydown', function(evento) {
  if (evento.key === 'Enter') {
    botonIngresar.click();
  }
});

campoCorreo.addEventListener('keydown', function(evento) {
  if (evento.key === 'Enter') {
    campoContrasena.focus();
  }
});

/* ══════════════════════════════════════
   2. INICIALIZACIÓN DEL MAPA LEAFLET
   ══════════════════════════════════════ */

var mapa = L.map('mapa-principal', {
  center: [-12.046374, -77.042793],
  zoom: 14,
  zoomControl: true,
  attributionControl: true
});

/* Capa de mosaicos con estilo oscuro */
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
  subdomains: 'abcd',
  maxZoom: 20
}).addTo(mapa);

/* ══════════════════════════════════════
   3. DATOS DE LOS CAMIONES (simulados)
   ══════════════════════════════════════ */

var listaCamiones = [
  {
    id: 'ECO-01',
    nombre: 'ECO-01',
    ruta: 'Ruta Centro Histórico',
    color: '#1D9E75',
    estado: 'activo',
    puntosRuta: [
      [-12.0450, -77.0300], [-12.0460, -77.0320], [-12.0475, -77.0340],
      [-12.0490, -77.0360], [-12.0505, -77.0345], [-12.0515, -77.0325],
      [-12.0500, -77.0310], [-12.0480, -77.0295], [-12.0460, -77.0290],
      [-12.0450, -77.0300]
    ]
  },
  {
    id: 'ECO-02',
    nombre: 'ECO-02',
    ruta: 'Ruta Jr. de la Unión',
    color: '#EF9F27',
    estado: 'proximo',
    puntosRuta: [
      [-12.0530, -77.0280], [-12.0545, -77.0300], [-12.0560, -77.0320],
      [-12.0575, -77.0340], [-12.0560, -77.0360], [-12.0540, -77.0350],
      [-12.0525, -77.0330], [-12.0515, -77.0310], [-12.0530, -77.0280]
    ]
  },
  {
    id: 'ECO-03',
    nombre: 'ECO-03',
    ruta: 'Ruta Miraflores Norte',
    color: '#378add',
    estado: 'activo',
    puntosRuta: [
      [-12.0410, -77.0380], [-12.0420, -77.0400], [-12.0440, -77.0420],
      [-12.0460, -77.0410], [-12.0470, -77.0390], [-12.0455, -77.0370],
      [-12.0435, -77.0360], [-12.0410, -77.0380]
    ]
  },
  {
    id: 'ECO-04',
    nombre: 'ECO-04',
    ruta: 'Ruta San Isidro',
    color: '#7f77dd',
    estado: 'completo',
    puntosRuta: [
      [-12.0380, -77.0250], [-12.0395, -77.0270], [-12.0415, -77.0260],
      [-12.0430, -77.0240], [-12.0420, -77.0220], [-12.0400, -77.0230],
      [-12.0380, -77.0250]
    ]
  }
];

/* ══════════════════════════════════════
   4. DIBUJAR POLILÍNEAS DE RUTAS
   ══════════════════════════════════════ */

listaCamiones.forEach(function(camion) {
  L.polyline(camion.puntosRuta, {
    color: camion.color,
    weight: 2.5,
    opacity: 0.35,
    dashArray: '6, 6'
  }).addTo(mapa);
});

/* ══════════════════════════════════════
   5. ÍCONO PERSONALIZADO DEL CAMIÓN
   ══════════════════════════════════════ */

function crearIconoCamion(color, etiqueta) {
  return L.divIcon({
    className: '',
    html:
      '<div style="display:flex;flex-direction:column;align-items:center;gap:2px;">' +
        '<div style="width:36px;height:36px;border-radius:50%;background:' + color + '22;' +
          'border:2px solid ' + color + ';display:flex;align-items:center;justify-content:center;' +
          'font-size:17px;box-shadow:0 0 12px ' + color + '55;">🚛</div>' +
        '<div class="etiqueta-marcador-camion">' + etiqueta + '</div>' +
      '</div>',
    iconSize: [60, 54],
    iconAnchor: [30, 27]
  });
}

/* ══════════════════════════════════════
   6. COLOCAR MARCADORES EN EL MAPA
   ══════════════════════════════════════ */

/* Mapa de estados a textos en español */
var textoEstado = {
  activo:   'En ruta',
  proximo:  '¡Próximo!',
  completo: 'Completado'
};

listaCamiones.forEach(function(camion) {
  camion._indicePunto  = 0;
  camion._progreso     = 0;

  camion._marcador = L.marker(camion.puntosRuta[0], {
    icon: crearIconoCamion(camion.color, camion.id)
  })
    .bindPopup(
      '<b>' + camion.id + '</b><br>' +
      camion.ruta + '<br>' +
      '<span style="color:' + camion.color + ';">● ' + textoEstado[camion.estado] + '</span>'
    )
    .addTo(mapa);
});

/* ══════════════════════════════════════
   7. ANIMACIÓN DE LOS CAMIONES
   ══════════════════════════════════════ */

/* Función de interpolación lineal entre dos puntos */
function interpolar(a, b, t) {
  return a + (b - a) * t;
}

var VELOCIDAD_ANIMACION = 0.012;

function animarCamiones() {
  listaCamiones.forEach(function(camion) {
    /* El camión "completo" no se mueve */
    if (camion.estado === 'completo') return;

    camion._progreso += VELOCIDAD_ANIMACION;

    /* Al llegar al final del tramo, pasar al siguiente */
    if (camion._progreso >= 1) {
      camion._progreso    = 0;
      camion._indicePunto = (camion._indicePunto + 1) % (camion.puntosRuta.length - 1);
    }

    var puntoOrigen  = camion.puntosRuta[camion._indicePunto];
    var puntoDestino = camion.puntosRuta[(camion._indicePunto + 1) % camion.puntosRuta.length];

    var latActual = interpolar(puntoOrigen[0], puntoDestino[0], camion._progreso);
    var lngActual = interpolar(puntoOrigen[1], puntoDestino[1], camion._progreso);

    camion._marcador.setLatLng([latActual, lngActual]);
  });

  requestAnimationFrame(animarCamiones);
}

animarCamiones();

/* ══════════════════════════════════════
   8. PANEL LATERAL — LISTA DE CAMIONES
   ══════════════════════════════════════ */

/* Clases de badge según estado */
var claseEstado = {
  activo:   'estado-activo',
  proximo:  'estado-proximo',
  completo: 'estado-completo'
};

function renderizarListaCamiones() {
  var contenedor = document.getElementById('lista-camiones');
  if (!contenedor) return;

  contenedor.innerHTML = listaCamiones.map(function(c) {
    return (
      '<div class="fila-estado-camion" onclick="enfocarCamion(\'' + c.id + '\')">' +
        '<div class="avatar-camion" style="color:' + c.color + ';">🚛</div>' +
        '<div class="info-camion">' +
          '<div class="nombre-camion">' + c.nombre + '</div>' +
          '<div class="ruta-camion">' + c.ruta + '</div>' +
        '</div>' +
        '<span class="estado-camion ' + claseEstado[c.estado] + '">' + textoEstado[c.estado] + '</span>' +
      '</div>'
    );
  }).join('');
}

renderizarListaCamiones();

/* ══════════════════════════════════════
   9. ENFOCAR CAMIÓN AL HACER CLIC
   ══════════════════════════════════════ */

window.enfocarCamion = function(id) {
  var camion = listaCamiones.find(function(c) { return c.id === id; });
  if (!camion) return;
  mapa.flyTo(camion._marcador.getLatLng(), 16, { duration: 1 });
  camion._marcador.openPopup();
};

/* ══════════════════════════════════════
   10. ALERTAS EN TIEMPO REAL DESDE EL SERVIDOR
   ══════════════════════════════════════ */

/* Mensajes de respaldo cuando el servidor no está disponible */
var mensajesRespaldo = [
  'ECO-02 se acerca al Jr. de la Unión. ¡Tenga sus residuos listos!',
  'ECO-01 cubrió 3 cuadras en la última hora.',
  'ECO-03 tiene retraso de ~8 min en Ruta Norte.',
  'ECO-02 llegará a Av. Emancipación en ~4 min.'
];

var indiceRespaldo = 0;

/* Carga las notificaciones reales del usuario autenticado
   y muestra la más reciente en el panel del mapa.
   Si no hay sesión o no hay conexión, rota mensajes de respaldo. */
async function actualizarAlertaPanel() {
  var token = localStorage.getItem('eco_token');

  /* Sin sesión iniciada: rotar mensajes de respaldo */
  if (!token) {
    indiceRespaldo = (indiceRespaldo + 1) % mensajesRespaldo.length;
    var elementoAlerta = document.getElementById('alerta-en-vivo');
    if (elementoAlerta) {
      elementoAlerta.textContent = mensajesRespaldo[indiceRespaldo];
    }
    actualizarBarraCobertura();
    return;
  }

  try {
    var respuesta = await fetch(URL_BACKEND + '/api/notificaciones', {
      headers: { 'Authorization': 'Bearer ' + token }
    });

    if (!respuesta.ok) {
      rotarMensajeRespaldo();
      return;
    }

    var datos = await respuesta.json();

    if (datos.ok && datos.notificaciones.length > 0) {
      /* Mostrar la notificación más reciente no leída */
      var noLeidas = datos.notificaciones.filter(function(n) { return !n.leida; });
      var alerta   = noLeidas.length > 0 ? noLeidas[0] : datos.notificaciones[0];

      var elementoAlerta = document.getElementById('alerta-en-vivo');
      if (elementoAlerta) {
        elementoAlerta.textContent = alerta.mensaje;
      }

      /* Actualizar el contador de alertas no leídas en el navbar */
      actualizarContadorAlertas(noLeidas.length);

    } else {
      rotarMensajeRespaldo();
    }

  } catch (error) {
    rotarMensajeRespaldo();
  }

  actualizarBarraCobertura();
}

/* Rota entre mensajes de respaldo cuando no hay datos reales */
function rotarMensajeRespaldo() {
  indiceRespaldo = (indiceRespaldo + 1) % mensajesRespaldo.length;
  var elementoAlerta = document.getElementById('alerta-en-vivo');
  if (elementoAlerta) {
    elementoAlerta.textContent = mensajesRespaldo[indiceRespaldo];
  }
}

/* Actualiza la barra de cobertura del día con un valor estimado */
function actualizarBarraCobertura() {
  var porcentaje        = 55 + Math.floor(Math.random() * 30);
  var elementoPorcentaje = document.getElementById('porcentaje-cobertura');
  var elementoBarra      = document.getElementById('barra-cobertura');
  if (elementoPorcentaje) elementoPorcentaje.textContent = porcentaje + '%';
  if (elementoBarra)      elementoBarra.style.width      = porcentaje + '%';
}

/* Muestra un contador de alertas no leídas junto al botón de sesión */
function actualizarContadorAlertas(cantidad) {
  var botonNav     = document.getElementById('botonAbrirLogin');
  var contadorExistente = document.getElementById('contadorAlertas');

  if (cantidad > 0 && botonNav) {
    if (!contadorExistente) {
      var contador = document.createElement('span');
      contador.id  = 'contadorAlertas';
      contador.style.cssText =
        'background:#e24b4a; color:#fff; border-radius:100px;' +
        'font-size:0.65rem; font-weight:800; padding:1px 6px;' +
        'margin-left:4px; vertical-align:middle;';
      contador.textContent = cantidad;
      botonNav.appendChild(contador);
    } else {
      contadorExistente.textContent = cantidad;
    }
  } else if (contadorExistente) {
    contadorExistente.remove();
  }
}

/* Revisar alertas al cargar y cada 10 segundos */
actualizarAlertaPanel();
setInterval(actualizarAlertaPanel, 10000);

/* ══════════════════════════════════════
   11. ANIMACIÓN AL HACER SCROLL
   ══════════════════════════════════════ */

var observadorScroll = new IntersectionObserver(function(entradas) {
  entradas.forEach(function(entrada) {
    if (entrada.isIntersecting) {
      entrada.target.classList.add('visible');
    }
  });
}, { threshold: 0.1 });

/* Observar todos los elementos con clase aparece-arriba */
document.querySelectorAll('.aparece-arriba').forEach(function(elemento) {
  observadorScroll.observe(elemento);
});

/* ══════════════════════════════════════
   12. VERIFICAR SESIÓN AL CARGAR LA PÁGINA
   ══════════════════════════════════════ */

/* Si el usuario ya inició sesión antes, actualizar el navbar automáticamente */
(function verificarSesionGuardada() {
  var tokenGuardado  = localStorage.getItem('eco_token');
  var nombreGuardado = localStorage.getItem('eco_nombre');

  if (tokenGuardado && nombreGuardado) {
    actualizarNavbar(nombreGuardado);
  }
})();

/* ══════════════════════════════════════
   13. CARGAR CAMIONES DESDE LA BASE DE DATOS
   ══════════════════════════════════════ */

/* Colores asignados a cada camión según su id */
var coloresCamiones = ['#1D9E75', '#EF9F27', '#378add', '#7f77dd', '#e24b4a', '#9FE1CB'];

/* Carga los camiones reales desde el backend y los muestra en el mapa.
   Si el backend no está disponible, mantiene los datos simulados. */
async function cargarCamionesDesdeServidor() {
  try {
    var respuesta = await fetch(URL_BACKEND + '/api/camiones');

    if (!respuesta.ok) return;

    var datos = await respuesta.json();

    if (!datos.ok || datos.camiones.length === 0) return;

    /* Limpiar los marcadores simulados del mapa */
    listaCamiones.forEach(function(c) {
      if (c._marcador) mapa.removeLayer(c._marcador);
    });

    /* Reemplazar con los datos reales del servidor */
    listaCamiones = datos.camiones.map(function(c, indice) {
      return {
        id:     c.placa,
        nombre: c.placa,
        ruta:   c.nombre_ruta || 'Sin ruta asignada',
        color:  coloresCamiones[indice % coloresCamiones.length],
        estado: c.estado_ruta === 'activa' ? 'activo' : 'completo',
        latitud:  parseFloat(c.latitud)  || -12.046374,
        longitud: parseFloat(c.longitud) || -77.042793,
        /* Sin puntos de ruta: el marcador se posiciona por GPS real */
        puntosRuta: [
          [parseFloat(c.latitud) || -12.046374, parseFloat(c.longitud) || -77.042793]
        ]
      };
    });

    /* Colocar marcadores en las posiciones GPS reales */
    listaCamiones.forEach(function(camion) {
      camion._indicePunto = 0;
      camion._progreso    = 0;
      camion._marcador    = L.marker([camion.latitud, camion.longitud], {
        icon: crearIconoCamion(camion.color, camion.nombre)
      })
        .bindPopup(
          '<b>' + camion.nombre + '</b><br>' +
          camion.ruta + '<br>' +
          '<span style="color:' + camion.color + ';">● ' + textoEstado[camion.estado] + '</span>'
        )
        .addTo(mapa);
    });

    /* Actualizar el panel lateral con los camiones reales */
    renderizarListaCamiones();

    console.log('Camiones cargados desde el servidor: ' + listaCamiones.length);

  } catch (error) {
    /* Si el servidor no responde, se mantienen los datos simulados */
    console.log('Backend no disponible. Usando datos simulados.');
  }
}

/* Intentar cargar camiones reales al iniciar */
cargarCamionesDesdeServidor();

/* Actualizar posiciones desde el servidor cada 10 segundos */
setInterval(cargarCamionesDesdeServidor, 10000);
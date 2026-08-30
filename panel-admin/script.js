/* ============================================================
   RUTAS ABIERTAS — Panel de administración
   ------------------------------------------------------------
   Consume la misma API que la app móvil. No hay backend propio del
   panel: es HTML estático que habla con api.rutasabiertas.cl.

   Tres decisiones que conviene no revertir sin pensarlo:

   1. Los tokens viven en sessionStorage, no en localStorage. Un XSS
      en cualquier página de rutasabiertas.cl puede leer localStorage,
      y ahí el token de administrador duraría 90 días. En
      sessionStorage muere al cerrar la pestaña.

   2. Nada de librerías externas para los gráficos. Un <script> de un
      CDN en esta página corre con acceso total al token de
      administrador y a los datos de todas las personas registradas.
      Los gráficos son SVG armado a mano; son dos líneas y barras.

   3. Todo lo que viene de la API se pinta con textContent, nunca con
      innerHTML. Los nombres, correos y descripciones los escriben
      usuarios de la app: concatenarlos en HTML es un XSS almacenado,
      y el peor lugar donde tenerlo es justo acá.
   ============================================================ */

const API = 'https://api.rutasabiertas.cl';
const POR_PAGINA = 25;

/* ------------------------------------------------------------
   SESIÓN
   ------------------------------------------------------------ */
const sesion = {
    get acceso() { return leer('ra_admin_acceso'); },
    get refresco() { return leer('ra_admin_refresco'); },
    get nombre() { return leer('ra_admin_nombre'); },

    guardar(datos) {
        escribir('ra_admin_acceso', datos.access_token);
        escribir('ra_admin_refresco', datos.refresh_token);
        escribir('ra_admin_nombre', datos.user?.name || datos.user?.email || '');
    },

    borrar() {
        ['ra_admin_acceso', 'ra_admin_refresco', 'ra_admin_nombre']
            .forEach(k => { try { sessionStorage.removeItem(k); } catch (e) { } });
    },
};

function leer(clave) {
    try { return sessionStorage.getItem(clave); } catch (e) { return null; }
}

function escribir(clave, valor) {
    try { sessionStorage.setItem(clave, valor || ''); } catch (e) { /* modo privado */ }
}

/* ------------------------------------------------------------
   CLIENTE HTTP
   ------------------------------------------------------------
   El access token dura una hora; el panel se deja abierto mucho más.
   Ante un 401 se renueva y se reintenta una sola vez.

   La renovación se serializa en `renovando`: el refresh token rota en
   cada uso, así que dos peticiones que reciben 401 a la vez pedirían
   dos renovaciones, la segunda con un token ya rotado. El servidor lee
   eso como robo y revoca la cadena entera — la misma trampa que ya
   apareció en la app móvil.
   ------------------------------------------------------------ */
let renovando = null;

async function api(ruta, opciones = {}, reintentar = true) {
    const cabeceras = Object.assign({ 'Accept': 'application/json' }, opciones.headers || {});
    if (opciones.body) cabeceras['Content-Type'] = 'application/json';
    if (sesion.acceso) cabeceras['Authorization'] = `Bearer ${sesion.acceso}`;

    let r;
    try {
        r = await fetch(API + ruta, Object.assign({}, opciones, { headers: cabeceras }));
    } catch (e) {
        throw new ErrorApi(0, 'No se pudo conectar con el servidor. Revisa tu conexión.');
    }

    if (r.status === 401 && reintentar && sesion.refresco) {
        if (await renovar()) return api(ruta, opciones, false);
        cerrarSesion('Tu sesión expiró. Vuelve a entrar.');
        throw new ErrorApi(401, 'Sesión expirada');
    }

    if (r.status === 204) return null;

    let cuerpo = null;
    try { cuerpo = await r.json(); } catch (e) { /* respuesta sin JSON */ }

    if (!r.ok) throw new ErrorApi(r.status, mensajeDe(r.status, cuerpo));
    return cuerpo;
}

class ErrorApi extends Error {
    constructor(codigo, mensaje) {
        super(mensaje);
        this.codigo = codigo;
    }
}

function mensajeDe(codigo, cuerpo) {
    // El 404 del panel no significa "no existe": `get_admin_user` responde 404
    // a quien no es administrador, para no confirmarle que la ruta existe.
    if (codigo === 404) return 'Esta cuenta no tiene permisos de administración.';
    // El detalle del 401 viene en inglés desde FastAPI y no le sirve a nadie.
    if (codigo === 401) return 'Tu sesión expiró. Vuelve a entrar.';
    if (codigo === 400 && cuerpo?.detail) return cuerpo.detail;
    if (typeof cuerpo?.detail === 'string') return cuerpo.detail;
    return 'Ocurrió un error inesperado. Intenta de nuevo.';
}

function renovar() {
    if (renovando) return renovando;

    renovando = (async () => {
        try {
            const r = await fetch(API + '/api/auth/refresh', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh_token: sesion.refresco }),
            });
            if (!r.ok) return false;
            sesion.guardar(await r.json());
            return true;
        } catch (e) {
            return false;
        } finally {
            renovando = null;
        }
    })();

    return renovando;
}

/* ------------------------------------------------------------
   UTILIDADES DE PINTADO
   ------------------------------------------------------------ */
const $ = s => document.querySelector(s);

/** Crea un elemento con texto seguro. Nunca interpreta HTML. */
function el(etiqueta, clase, texto) {
    const n = document.createElement(etiqueta);
    if (clase) n.className = clase;
    if (texto !== undefined && texto !== null) n.textContent = String(texto);
    return n;
}

function fecha(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}

function numero(n) {
    return Number(n || 0).toLocaleString('es-CL');
}

let brindisTimer;
function brindis(texto) {
    const caja = $('#brindis');
    caja.textContent = texto;
    caja.classList.add('visible');
    clearTimeout(brindisTimer);
    brindisTimer = setTimeout(() => caja.classList.remove('visible'), 4000);
}

/* ------------------------------------------------------------
   TEMA
   ------------------------------------------------------------ */
function aplicarTema(tema) {
    document.documentElement.setAttribute('data-theme', tema);
    const icono = $('#theme-btn')?.querySelector('i');
    if (icono) {
        icono.classList.toggle('fa-sun', tema === 'dark');
        icono.classList.toggle('fa-moon', tema !== 'dark');
    }
}

$('#theme-btn').addEventListener('click', () => {
    const siguiente = document.documentElement.getAttribute('data-theme') === 'dark'
        ? 'light' : 'dark';
    aplicarTema(siguiente);
    try { localStorage.setItem('theme', siguiente); } catch (e) { /* modo privado */ }
});

try { aplicarTema(localStorage.getItem('theme') || 'light'); } catch (e) { aplicarTema('light'); }

/* ------------------------------------------------------------
   INICIO DE SESIÓN
   ------------------------------------------------------------ */
$('#ver-pass').addEventListener('click', () => {
    const campo = $('#login-pass');
    const visible = campo.type === 'text';
    campo.type = visible ? 'password' : 'text';
    const b = $('#ver-pass');
    b.setAttribute('aria-pressed', String(!visible));
    b.setAttribute('aria-label', visible ? 'Mostrar contraseña' : 'Ocultar contraseña');
    b.querySelector('i').className = visible ? 'fa-regular fa-eye' : 'fa-regular fa-eye-slash';
});

$('#form-login').addEventListener('submit', async e => {
    e.preventDefault();
    const boton = $('#btn-entrar');
    const error = $('#login-error');
    error.hidden = true;
    boton.disabled = true;
    boton.textContent = 'Entrando…';

    try {
        const r = await fetch(API + '/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: $('#login-email').value.trim(),
                password: $('#login-pass').value,
            }),
        });

        if (!r.ok) {
            // Mismo texto para correo inexistente y contraseña mala: distinguirlos
            // permite averiguar qué correos están registrados.
            throw new Error(r.status === 401
                ? 'Correo o contraseña incorrectos.'
                : 'No se pudo iniciar sesión. Intenta más tarde.');
        }

        const datos = await r.json();
        sesion.guardar(datos);

        // El login no dice si la cuenta es administradora: eso lo responde el
        // panel. Si no lo es, se cierra la sesión acá mismo.
        try {
            await api('/api/admin/stats?dias=7');
        } catch (err) {
            sesion.borrar();
            throw new Error(err.codigo === 404
                ? 'Esta cuenta no tiene permisos de administración.'
                : err.message);
        }

        $('#login-pass').value = '';
        entrar();
    } catch (err) {
        error.textContent = err.message;
        error.hidden = false;
        $('#login-pass').focus();
    } finally {
        boton.disabled = false;
        boton.textContent = 'Entrar';
    }
});

$('#btn-salir').addEventListener('click', async () => {
    // Revocar el refresh token en el servidor, no solo olvidarlo acá: si
    // alguien lo copió, borrarlo del navegador no lo invalida.
    const token = sesion.refresco;
    if (token) {
        try {
            await fetch(API + '/api/auth/logout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh_token: token }),
            });
        } catch (e) { /* igual se cierra localmente */ }
    }
    cerrarSesion();
});

/** Muestra el panel u oculta todo lo suyo (barra, pestañas y contenido). */
function mostrarPanel(visible) {
    ['#barra', '#pestanas', '#vista-panel'].forEach(s => { $(s).hidden = !visible; });
    $('#vista-login').hidden = visible;
}

function cerrarSesion(motivo) {
    sesion.borrar();
    mostrarPanel(false);
    const error = $('#login-error');
    if (motivo) {
        error.textContent = motivo;
        error.hidden = false;
    } else {
        error.hidden = true;
    }
    $('#login-email').focus();
}

function entrar() {
    mostrarPanel(true);
    $('#quien').textContent = sesion.nombre || '';
    cambiarVista('resumen');
}

/* ------------------------------------------------------------
   PESTAÑAS
   ------------------------------------------------------------ */
document.querySelectorAll('.pestana').forEach(boton => {
    boton.addEventListener('click', () => cambiarVista(boton.dataset.vista));
});

function cambiarVista(nombre) {
    document.querySelectorAll('.pestana').forEach(b => {
        const activa = b.dataset.vista === nombre;
        b.classList.toggle('activa', activa);
        if (activa) b.setAttribute('aria-current', 'page');
        else b.removeAttribute('aria-current');
    });
    document.querySelectorAll('.vista').forEach(v => {
        v.hidden = v.id !== `vista-${nombre}`;
    });

    if (nombre === 'resumen') cargarResumen();
    if (nombre === 'usuarios') cargarUsuarios();
    if (nombre === 'reportes') cargarReportes();
}

/* ------------------------------------------------------------
   RESUMEN
   ------------------------------------------------------------ */
$('#dias').addEventListener('change', cargarResumen);

async function cargarResumen() {
    const dias = $('#dias').value;
    let s;
    try {
        s = await api(`/api/admin/stats?dias=${encodeURIComponent(dias)}`);
    } catch (e) {
        return brindis(e.message);
    }

    const tarjetas = [
        { cifra: s.total_usuarios, nombre: 'Personas registradas', nota: `+${numero(s.usuarios_nuevos)} en el período` },
        { cifra: s.total_reportes, nombre: 'Lugares reportados', nota: `+${numero(s.reportes_nuevos)} en el período` },
        { cifra: s.total_validaciones, nombre: 'Validaciones', nota: 'Votos de la comunidad' },
        { cifra: s.reportes_con_foto, nombre: 'Reportes con foto', nota: porcentaje(s.reportes_con_foto, s.total_reportes) },
    ];

    const caja = $('#tarjetas');
    caja.replaceChildren(...tarjetas.map(t => {
        const n = el('article', 'tarjeta');
        n.append(
            el('div', 'tarjeta-cifra', numero(t.cifra)),
            el('div', 'tarjeta-nombre', t.nombre),
            el('div', 'tarjeta-nota', t.nota),
        );
        return n;
    }));

    dibujarSerie($('#graf-usuarios'), s.usuarios_por_dia, 'registros');
    dibujarSerie($('#graf-reportes'), s.reportes_por_dia, 'reportes');
    dibujarCategorias(s.reportes_por_categoria);

    // El filtro de la pestaña Reportes se llena desde acá: `stats` trae todas
    // las categorías que existen, mientras que una página de reportes solo
    // muestra las de esas 25 filas.
    llenarCategorias(Object.keys(s.reportes_por_categoria || {}));
}

function porcentaje(parte, total) {
    if (!total) return 'Sin reportes todavía';
    return `${Math.round((parte / total) * 100)}% del total`;
}

/**
 * Gráfico de líneas en SVG.
 *
 * Se dibuja a mano en vez de traer una librería: son puntos y una
 * polilínea, y cualquier <script> externo en esta página tendría acceso
 * al token de administrador.
 */
function dibujarSerie(caja, serie, etiqueta) {
    if (!serie || !serie.length) {
        caja.replaceChildren(el('p', 'vacio', 'Sin datos en este período.'));
        return;
    }

    const ancho = 600, alto = 180, margen = 26;
    const maximo = Math.max(...serie.map(p => p.total), 1);
    const paso = serie.length > 1 ? (ancho - margen * 2) / (serie.length - 1) : 0;

    const puntos = serie.map((p, i) => {
        const x = margen + i * paso;
        const y = alto - margen - ((p.total / maximo) * (alto - margen * 2));
        return { x, y, p };
    });

    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${ancho} ${alto}`);
    svg.setAttribute('role', 'img');

    const total = serie.reduce((a, p) => a + p.total, 0);
    const titulo = document.createElementNS(ns, 'title');
    titulo.textContent =
        `${numero(total)} ${etiqueta} en ${serie.length} ${serie.length === 1 ? 'día' : 'días'}. ` +
        `Máximo en un día: ${numero(maximo)}.`;
    svg.appendChild(titulo);

    // Línea base, para que el gráfico no flote en el vacío.
    const base = document.createElementNS(ns, 'line');
    base.setAttribute('x1', margen); base.setAttribute('x2', ancho - margen);
    base.setAttribute('y1', alto - margen); base.setAttribute('y2', alto - margen);
    base.setAttribute('stroke', 'currentColor');
    base.setAttribute('stroke-opacity', '.15');
    svg.appendChild(base);

    // El color sale de una clase CSS, no de un atributo con el valor leido de
    // la variable: asi el grafico cambia solo al alternar el tema, sin volver
    // a pedirle los datos a la API.
    if (puntos.length > 1) {
        const area = document.createElementNS(ns, 'polygon');
        area.setAttribute('class', 'serie-area');
        area.setAttribute('points',
            `${margen},${alto - margen} ` +
            puntos.map(q => `${q.x},${q.y}`).join(' ') +
            ` ${ancho - margen},${alto - margen}`);
        svg.appendChild(area);

        const linea = document.createElementNS(ns, 'polyline');
        linea.setAttribute('class', 'serie-linea');
        linea.setAttribute('points', puntos.map(q => `${q.x},${q.y}`).join(' '));
        svg.appendChild(linea);
    }

    puntos.forEach(q => {
        const c = document.createElementNS(ns, 'circle');
        c.setAttribute('class', 'serie-punto');
        c.setAttribute('cx', q.x); c.setAttribute('cy', q.y); c.setAttribute('r', '3.5');
        const t = document.createElementNS(ns, 'title');
        t.textContent = `${fecha(q.p.fecha)}: ${numero(q.p.total)}`;
        c.appendChild(t);
        svg.appendChild(c);
    });

    caja.replaceChildren(svg);
}

function dibujarCategorias(porCategoria) {
    const caja = $('#por-categoria');
    const filas = Object.entries(porCategoria || {});
    if (!filas.length) {
        caja.replaceChildren(el('p', 'vacio', 'Todavía no hay reportes.'));
        return;
    }

    const maximo = Math.max(...filas.map(([, n]) => n), 1);
    caja.replaceChildren(...filas.map(([nombre, n]) => {
        const fila = el('div', 'barra-fila');
        const pista = el('div', 'barra-pista');
        const relleno = el('div', 'barra-relleno');
        relleno.style.width = `${(n / maximo) * 100}%`;
        pista.appendChild(relleno);
        fila.append(el('span', null, nombre), pista, el('strong', null, numero(n)));
        return fila;
    }));
}

/* ------------------------------------------------------------
   USUARIOS
   ------------------------------------------------------------ */
const estadoUsuarios = { offset: 0, buscar: '' };

$('#buscar-usuarios').addEventListener('input', esperar(e => {
    estadoUsuarios.buscar = e.target.value.trim();
    estadoUsuarios.offset = 0;
    cargarUsuarios();
}, 350));

async function cargarUsuarios() {
    const params = new URLSearchParams({
        limit: POR_PAGINA,
        offset: estadoUsuarios.offset,
    });
    if (estadoUsuarios.buscar) params.set('buscar', estadoUsuarios.buscar);

    const cuerpo = $('#tbody-usuarios');
    cuerpo.replaceChildren(filaMensaje(6, 'Cargando…'));

    let pagina;
    try {
        pagina = await api(`/api/admin/users?${params}`);
    } catch (e) {
        cuerpo.replaceChildren(filaMensaje(6, e.message));
        return;
    }

    if (!pagina.items.length) {
        cuerpo.replaceChildren(filaMensaje(6,
            estadoUsuarios.buscar ? 'Nadie coincide con esa búsqueda.' : 'Todavía no hay personas registradas.'));
    } else {
        cuerpo.replaceChildren(...pagina.items.map(filaUsuario));
    }

    pintarPaginacion($('#pag-usuarios'), pagina, estadoUsuarios, cargarUsuarios, 'personas');
}

function filaUsuario(u) {
    const tr = document.createElement('tr');

    const persona = document.createElement('td');
    persona.append(el('div', 'celda-principal', u.name || 'Sin nombre'),
        el('div', 'celda-sub', u.email));
    tr.appendChild(persona);

    const perfil = document.createElement('td');
    if (u.is_admin) perfil.appendChild(el('span', 'etiqueta etiqueta-admin', 'Administrador'));
    else perfil.appendChild(el('span', 'etiqueta', u.disability || 'Sin indicar'));
    tr.appendChild(perfil);

    tr.appendChild(el('td', null, numero(u.aportes)));
    tr.appendChild(el('td', null, numero(u.validaciones)));
    tr.appendChild(el('td', null, fecha(u.created_at)));

    const acciones = document.createElement('td');
    if (!u.is_admin) {
        const boton = el('button', 'btn-fila', 'Eliminar');
        boton.type = 'button';
        boton.setAttribute('aria-label', `Eliminar la cuenta de ${u.name || u.email}`);
        boton.addEventListener('click', () => confirmar({
            titulo: 'Eliminar cuenta',
            texto: `Se eliminará la cuenta de ${u.name || u.email} junto con sus ` +
                `${numero(u.aportes)} aporte(s) y ${numero(u.validaciones)} validación(es). ` +
                `Los aportes desaparecen del mapa. Esta acción no se puede deshacer.`,
            alConfirmar: async () => {
                await api(`/api/admin/users/${u.id}`, { method: 'DELETE' });
                brindis('Cuenta eliminada.');
                cargarUsuarios();
            },
        }));
        acciones.appendChild(boton);
    }
    tr.appendChild(acciones);

    return tr;
}

/* ------------------------------------------------------------
   REPORTES
   ------------------------------------------------------------ */
const estadoReportes = { offset: 0, buscar: '', categoria: '', conFoto: false };

$('#buscar-reportes').addEventListener('input', esperar(e => {
    estadoReportes.buscar = e.target.value.trim();
    estadoReportes.offset = 0;
    cargarReportes();
}, 350));

$('#categoria').addEventListener('change', e => {
    estadoReportes.categoria = e.target.value;
    estadoReportes.offset = 0;
    cargarReportes();
});

$('#con-foto').addEventListener('change', e => {
    estadoReportes.conFoto = e.target.checked;
    estadoReportes.offset = 0;
    cargarReportes();
});

async function cargarReportes() {
    const params = new URLSearchParams({
        limit: POR_PAGINA,
        offset: estadoReportes.offset,
    });
    if (estadoReportes.buscar) params.set('buscar', estadoReportes.buscar);
    if (estadoReportes.categoria) params.set('categoria', estadoReportes.categoria);
    if (estadoReportes.conFoto) params.set('solo_con_foto', 'true');

    const cuerpo = $('#tbody-reportes');
    cuerpo.replaceChildren(filaMensaje(6, 'Cargando…'));

    let pagina;
    try {
        pagina = await api(`/api/admin/reports?${params}`);
    } catch (e) {
        cuerpo.replaceChildren(filaMensaje(6, e.message));
        return;
    }

    if (!pagina.items.length) {
        cuerpo.replaceChildren(filaMensaje(6, 'No hay reportes que coincidan.'));
    } else {
        cuerpo.replaceChildren(...pagina.items.map(filaReporte));
    }

    pintarPaginacion($('#pag-reportes'), pagina, estadoReportes, cargarReportes, 'reportes');
}

function filaReporte(r) {
    const tr = document.createElement('tr');

    const lugar = document.createElement('td');
    const titulo = el('div', 'celda-principal', r.title);
    if (r.photo_path) {
        const camara = el('i', 'fa-solid fa-camera');
        camara.setAttribute('aria-hidden', 'true');
        camara.style.marginLeft = '.4rem';
        camara.style.color = 'var(--text-muted)';
        titulo.appendChild(camara);
        titulo.appendChild(el('span', 'visualmente-oculto', ' (con foto)'));
    }
    lugar.append(titulo, el('div', 'celda-sub', recortar(r.description, 90)));
    tr.appendChild(lugar);

    const cat = document.createElement('td');
    cat.appendChild(el('span', 'etiqueta', r.category));
    tr.appendChild(cat);

    const autor = document.createElement('td');
    autor.append(el('div', null, r.author_name || 'Cuenta eliminada'),
        el('div', 'celda-sub', r.author_email || '—'));
    tr.appendChild(autor);

    const votos = el('td', 'votos');
    votos.append(el('span', 'voto-si', `▲ ${numero(r.confirms)}`),
        el('span', null, '  '),
        el('span', 'voto-no', `▼ ${numero(r.rejects)}`));
    tr.appendChild(votos);

    tr.appendChild(el('td', null, fecha(r.created_at)));

    const acciones = document.createElement('td');
    const boton = el('button', 'btn-fila', 'Eliminar');
    boton.type = 'button';
    boton.setAttribute('aria-label', `Eliminar el reporte ${r.title}`);
    boton.addEventListener('click', () => confirmar({
        titulo: 'Eliminar reporte',
        texto: `«${r.title}» se quitará del mapa y dejará de verse en la app. ` +
            `Esta acción no se puede deshacer.`,
        alConfirmar: async () => {
            await api(`/api/admin/reports/${r.id}`, { method: 'DELETE' });
            brindis('Reporte eliminado.');
            cargarReportes();
        },
    }));
    acciones.appendChild(boton);
    tr.appendChild(acciones);

    return tr;
}

/** Llena el filtro con las categorías que de verdad existen en la base. */
function llenarCategorias(nombres) {
    const select = $('#categoria');
    const vistas = new Set(Array.from(select.options).map(o => o.value));
    nombres.forEach(nombre => {
        if (!nombre || vistas.has(nombre)) return;
        vistas.add(nombre);
        const o = document.createElement('option');
        o.value = nombre;
        o.textContent = nombre;
        select.appendChild(o);
    });
}

function recortar(texto, largo) {
    if (!texto) return 'Sin descripción';
    return texto.length > largo ? texto.slice(0, largo) + '…' : texto;
}

/* ------------------------------------------------------------
   TABLA: PIEZAS COMPARTIDAS
   ------------------------------------------------------------ */
function filaMensaje(columnas, texto) {
    const tr = el('tr', 'fila-vacia');
    const td = el('td', null, texto);
    td.colSpan = columnas;
    tr.appendChild(td);
    return tr;
}

function pintarPaginacion(caja, pagina, estado, recargar, unidad) {
    caja.replaceChildren();
    if (!pagina.total) return;

    const desde = pagina.offset + 1;
    const hasta = Math.min(pagina.offset + pagina.items.length, pagina.total);

    const anterior = el('button', 'btn btn-tenue', 'Anterior');
    anterior.type = 'button';
    anterior.disabled = pagina.offset === 0;
    anterior.addEventListener('click', () => {
        estado.offset = Math.max(0, estado.offset - POR_PAGINA);
        recargar();
    });

    const siguiente = el('button', 'btn btn-tenue', 'Siguiente');
    siguiente.type = 'button';
    siguiente.disabled = hasta >= pagina.total;
    siguiente.addEventListener('click', () => {
        estado.offset += POR_PAGINA;
        recargar();
    });

    caja.append(anterior,
        el('span', null, `${desde}–${hasta} de ${numero(pagina.total)} ${unidad}`),
        siguiente);
}

/** Espera a que la persona deje de escribir antes de consultar la API. */
function esperar(fn, ms) {
    let t;
    return function (...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), ms);
    };
}

/* ------------------------------------------------------------
   CONFIRMACIÓN
   ------------------------------------------------------------
   Borrar una cuenta arrastra sus aportes en cascada. El modal dice
   exactamente qué se pierde antes de que alguien apriete el botón.
   ------------------------------------------------------------ */
let alConfirmarActual = null;
let focoPrevio = null;

function confirmar({ titulo, texto, alConfirmar }) {
    $('#modal-titulo').textContent = titulo;
    $('#modal-texto').textContent = texto;
    alConfirmarActual = alConfirmar;
    focoPrevio = document.activeElement;
    $('#modal').hidden = false;
    $('#modal-cancelar').focus();
}

function cerrarModal() {
    $('#modal').hidden = true;
    alConfirmarActual = null;

    // Devolver el foco a donde estaba: si no, el lector de pantalla queda al
    // principio del documento y hay que volver a navegar toda la tabla.
    if (focoPrevio && document.contains(focoPrevio)) {
        focoPrevio.focus();
        return;
    }

    // Tras eliminar, el botón que abrió el modal ya no existe. Sin este
    // respaldo el foco cae en <body> y quien usa lector de pantalla se queda
    // sin saber que la acción terminó.
    const pestanaActiva = document.querySelector('.pestana.activa');
    if (pestanaActiva) pestanaActiva.focus();
}

$('#modal-cancelar').addEventListener('click', cerrarModal);

$('#modal-confirmar').addEventListener('click', async () => {
    const accion = alConfirmarActual;
    if (!accion) return;
    const boton = $('#modal-confirmar');
    boton.disabled = true;
    boton.textContent = 'Eliminando…';
    try {
        await accion();
        cerrarModal();
    } catch (e) {
        cerrarModal();
        brindis(e.message);
    } finally {
        boton.disabled = false;
        boton.textContent = 'Eliminar';
    }
});

document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#modal').hidden) cerrarModal();

    // El foco no debe escaparse del modal mientras está abierto.
    if (e.key === 'Tab' && !$('#modal').hidden) {
        const focos = $('#modal').querySelectorAll('button');
        const primero = focos[0], ultimo = focos[focos.length - 1];
        if (e.shiftKey && document.activeElement === primero) {
            e.preventDefault(); ultimo.focus();
        } else if (!e.shiftKey && document.activeElement === ultimo) {
            e.preventDefault(); primero.focus();
        }
    }
});

$('#modal').addEventListener('click', e => {
    if (e.target === $('#modal')) cerrarModal();
});

/* ------------------------------------------------------------
   ARRANQUE
   ------------------------------------------------------------ */
(async function iniciar() {
    if (!sesion.acceso) return;
    try {
        await api('/api/admin/stats?dias=7');
        entrar();
    } catch (e) {
        // Token viejo o cuenta sin permisos: vuelta al login.
        sesion.borrar();
    }
})();

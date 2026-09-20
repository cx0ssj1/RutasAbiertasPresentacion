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
    if (nombre === 'testers') cargarTesters();
    if (nombre === 'aprobaciones') cargarAprobaciones();
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

    // El techo lleva un 15% de aire sobre el máximo. Sin eso, cuando todos los
    // días valen lo mismo —el caso normal al principio, un registro por día— la
    // línea queda clavada en el borde superior y parece un gráfico roto o algo
    // saturado, cuando en realidad no pasa nada.
    const techo = maximo * 1.15;
    const paso = serie.length > 1 ? (ancho - margen * 2) / (serie.length - 1) : 0;

    const puntos = serie.map((p, i) => {
        const x = margen + i * paso;
        const y = alto - margen - ((p.total / techo) * (alto - margen * 2));
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

    // Referencia numérica del máximo y del rango de fechas: sin esto la altura
    // de la línea no significa nada para quien la mira.
    const marca = (x, y, texto, ancla) => {
        const n = document.createElementNS(ns, 'text');
        n.setAttribute('class', 'serie-marca');
        n.setAttribute('x', x); n.setAttribute('y', y);
        n.setAttribute('text-anchor', ancla || 'start');
        n.textContent = texto;
        svg.appendChild(n);
    };
    marca(margen, margen - 8, numero(maximo));
    marca(margen, alto - 8, fecha(serie[0].fecha));
    if (serie.length > 1) {
        marca(ancho - margen, alto - 8, fecha(serie[serie.length - 1].fecha), 'end');
    }

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
    tr.appendChild(el('td', 'celda-fecha', fecha(u.created_at)));

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

    tr.appendChild(el('td', 'celda-fecha', fecha(r.created_at)));

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
let etiquetaAccionActual = 'Eliminar';
let focoPrevio = null;

function confirmar({ titulo, texto, alConfirmar, etiquetaConfirmar, peligro = true }) {
    $('#modal-titulo').textContent = titulo;
    $('#modal-texto').textContent = texto;

    // Un botón rojo que dice "Eliminar" para confirmar el envío de un correo
    // confunde más de lo que ayuda: el color y el texto tienen que decir lo
    // que va a pasar.
    const boton = $('#modal-confirmar');
    etiquetaAccionActual = etiquetaConfirmar || 'Eliminar';
    boton.textContent = etiquetaAccionActual;
    boton.classList.toggle('btn-peligro', peligro);
    boton.classList.toggle('btn-primario', !peligro);
    boton.classList.toggle('btn-auto', !peligro);

    alConfirmarActual = alConfirmar;
    focoPrevio = document.activeElement;
    $('#modal').hidden = false;
    // El foco arranca en Cancelar, nunca en la acción: un Enter de más no
    // debe disparar algo que no tiene vuelta atrás.
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
    boton.textContent = 'Un momento…';
    try {
        await accion();
        cerrarModal();
    } catch (e) {
        cerrarModal();
        brindis(e.message);
    } finally {
        boton.disabled = false;
        boton.textContent = etiquetaAccionActual;
    }
});

document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#modal').hidden) cerrarModal();
    if (e.key === 'Escape' && !$('#modal-tester').hidden) cerrarModalTester();
    if (e.key === 'Escape' && !$('#modal-enlace').hidden) cerrarModalEnlace();

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
   BETA TESTERS
   ------------------------------------------------------------
   Es la única pantalla del panel que le escribe a personas reales, así que
   todo acá está pensado alrededor de un solo error: mandarle el correo
   equivocado, o dos veces, a alguien que se anotó de buena fe.

   Por eso: la plantilla la elige el servidor según el sistema declarado, el
   estado de cada fila dice si ya se le respondió, y el envío masivo nunca
   toca a quien ya fue contactado.
   ------------------------------------------------------------ */

const estadoTesters = {
    offset: 0,
    buscar: '',
    sistema: '',
    soloPendientes: false,
};

$('#buscar-testers').addEventListener('input', esperar(e => {
    estadoTesters.buscar = e.target.value.trim();
    estadoTesters.offset = 0;
    cargarTesters();
}, 350));

$('#filtro-sistema').addEventListener('change', e => {
    estadoTesters.sistema = e.target.value;
    estadoTesters.offset = 0;
    cargarTesters();
});

$('#solo-pendientes').addEventListener('change', e => {
    estadoTesters.soloPendientes = e.target.checked;
    estadoTesters.offset = 0;
    cargarTesters();
});

async function cargarTesters() {
    const params = new URLSearchParams({
        limit: POR_PAGINA,
        offset: estadoTesters.offset,
    });
    if (estadoTesters.buscar) params.set('buscar', estadoTesters.buscar);
    if (estadoTesters.sistema) params.set('sistema', estadoTesters.sistema);
    if (estadoTesters.soloPendientes) params.set('solo_pendientes', 'true');

    const cuerpo = $('#tbody-testers');
    cuerpo.replaceChildren(filaMensaje(6, 'Cargando…'));

    let pagina;
    try {
        pagina = await api(`/api/admin/testers?${params}`);
    } catch (e) {
        cuerpo.replaceChildren(filaMensaje(6, e.message));
        return;
    }

    if (!pagina.items.length) {
        cuerpo.replaceChildren(filaMensaje(6,
            estadoTesters.buscar || estadoTesters.sistema || estadoTesters.soloPendientes
                ? 'Nadie coincide con esos filtros.'
                : 'Todavía no hay inscripciones.'));
    } else {
        cuerpo.replaceChildren(...pagina.items.map(filaTester));
    }

    pintarResumenTesters(pagina);
    pintarPaginacion($('#pag-testers'), pagina, estadoTesters, cargarTesters, 'inscripciones');
}

/** Cuántos esperan respuesta, arriba de la tabla y en la pestaña. */
function pintarResumenTesters(pagina) {
    const resumen = $('#resumen-testers');
    const chincheta = $('#chincheta-testers');
    const boton = $('#btn-responder-todos');

    resumen.replaceChildren();
    if (pagina.pendientes > 0) {
        const n = el('strong', null, numero(pagina.pendientes));
        resumen.append(
            n,
            document.createTextNode(
                pagina.pendientes === 1
                    ? ' inscripción esperando respuesta.'
                    : ' inscripciones esperando respuesta.'),
        );
        chincheta.textContent = numero(pagina.pendientes);
        chincheta.hidden = false;
        boton.disabled = false;
    } else {
        resumen.textContent = pagina.total
            ? 'Todas las inscripciones fueron respondidas.'
            : 'Sin inscripciones todavía.';
        // Sin pendientes la chincheta desaparece: un cero permanente deja de
        // mirarse a los dos días.
        chincheta.hidden = true;
        boton.disabled = true;
    }
}

function filaTester(t) {
    const tr = document.createElement('tr');

    const persona = document.createElement('td');
    persona.append(el('div', 'celda-principal', t.nombre),
        el('div', 'celda-sub', t.email));
    if (t.comuna) persona.appendChild(el('div', 'celda-sub', t.comuna));
    tr.appendChild(persona);

    const sistema = document.createElement('td');
    sistema.appendChild(el('span', 'etiqueta', t.sistema || 'Sin indicar'));
    tr.appendChild(sistema);

    // El perfil y las necesidades de accesibilidad son datos sensibles. Se
    // muestran porque son el criterio para elegir a quién invitar, pero el
    // texto largo va recortado: la tabla no es el lugar para leerlo entero.
    const perfil = document.createElement('td');
    perfil.appendChild(el('div', null, t.perfil || '—'));
    if (t.accesibilidad) {
        const nota = el('div', 'celda-sub', recortar(t.accesibilidad, 70));
        nota.title = t.accesibilidad;
        perfil.appendChild(nota);
    }
    tr.appendChild(perfil);

    const estado = document.createElement('td');
    if (t.contactado_at) {
        const etiqueta = el('span', 'estado estado-respondido', 'Respondido');
        estado.appendChild(etiqueta);
        estado.appendChild(el('span', 'estado-detalle',
            `${t.contacto_tipo === 'ios' ? 'Plantilla iOS' : 'Plantilla Android'} · ${fecha(t.contactado_at)}`));
    } else {
        estado.appendChild(el('span', 'estado estado-pendiente', 'Sin responder'));
    }
    tr.appendChild(estado);

    tr.appendChild(el('td', 'celda-fecha', fecha(t.created_at)));

    // El contenedor flex va DENTRO del <td>, no en el <td>. Un `display:flex`
    // sobre una celda le quita su comportamiento de celda y la fila se
    // desarma: los botones se salen de la tabla.
    const acciones = document.createElement('td');
    const grupo = el('div', 'acciones-fila');

    const responder = el('button', 'btn-fila-accion',
        t.contactado_at ? 'Reenviar' : 'Responder');
    responder.type = 'button';
    responder.setAttribute('aria-label',
        `${t.contactado_at ? 'Reenviar' : 'Responder'} el correo a ${t.nombre}`);
    responder.addEventListener('click', () => responderA(t));
    grupo.appendChild(responder);

    const borrar = el('button', 'btn-fila', 'Eliminar');
    borrar.type = 'button';
    borrar.setAttribute('aria-label', `Eliminar la inscripción de ${t.nombre}`);
    borrar.addEventListener('click', () => confirmar({
        titulo: 'Eliminar inscripción',
        texto: `Se eliminará la inscripción de ${t.nombre} (${t.email}), ` +
            `incluidos su perfil y sus necesidades de accesibilidad. ` +
            `Esta acción no se puede deshacer.`,
        alConfirmar: async () => {
            await api(`/api/admin/testers/${t.id}`, { method: 'DELETE' });
            brindis('Inscripción eliminada.');
            cargarTesters();
        },
    }));
    grupo.appendChild(borrar);

    acciones.appendChild(grupo);
    tr.appendChild(acciones);
    return tr;
}

/** Envía el correo a una persona, confirmando antes. */
function responderA(t) {
    const plantilla = (t.sistema || '').toLowerCase().includes('ios')
        ? 'la de iOS (todavía no hay app para su teléfono)'
        : 'la de Android (le avisamos si queda seleccionado)';

    const yaRespondido = Boolean(t.contactado_at);

    confirmar({
        titulo: yaRespondido ? 'Reenviar el correo' : 'Enviar el correo',
        texto: yaRespondido
            ? `A ${t.nombre} ya se le respondió el ${fecha(t.contactado_at)}. ` +
              `Si continúas, recibirá el mismo correo otra vez.`
            : `Se enviará a ${t.email} la plantilla ${plantilla}.`,
        etiquetaConfirmar: yaRespondido ? 'Reenviar' : 'Enviar',
        peligro: yaRespondido,
        alConfirmar: async () => {
            const r = await api(`/api/admin/testers/${t.id}/responder`, {
                method: 'POST',
                body: JSON.stringify({ plantilla: 'auto', reenviar: yaRespondido }),
            });
            brindis(r.enviados
                ? `Correo enviado a ${t.email}.`
                : (r.detalle[0] || 'No se envió nada.'));
            cargarTesters();
        },
    });
}

$('#btn-responder-todos').addEventListener('click', async () => {
    // Se pide el número justo antes de confirmar, no el que se pintó hace
    // rato: entre medio pudo entrar otra inscripción.
    let pendientes = 0;
    try {
        const p = await api('/api/admin/testers?limit=1&solo_pendientes=true');
        pendientes = p.pendientes;
    } catch (e) {
        return brindis(e.message);
    }

    if (!pendientes) {
        cargarTesters();
        return brindis('No hay inscripciones pendientes.');
    }

    confirmar({
        titulo: 'Responder a los pendientes',
        texto: `Se enviarán ${pendientes} correo(s), uno por persona, con la ` +
            `plantilla que corresponda a su sistema. Quienes ya recibieron ` +
            `respuesta no serán contactados de nuevo.`,
        etiquetaConfirmar: 'Enviar',
        alConfirmar: async () => {
            const r = await api('/api/admin/testers/responder-pendientes', {
                method: 'POST',
                body: JSON.stringify({ plantilla: 'auto' }),
            });
            const partes = [`${r.enviados} enviado(s)`];
            if (r.omitidos) partes.push(`${r.omitidos} omitido(s)`);
            if (r.fallidos) partes.push(`${r.fallidos} fallido(s)`);
            brindis(partes.join(', ') + '.');
            cargarTesters();
        },
    });
});

/* ---------- ALTA MANUAL ---------- */
$('#btn-agregar-tester').addEventListener('click', () => {
    $('#form-tester').reset();
    $('#tester-error').hidden = true;
    $('#modal-tester').hidden = false;
    $('#tester-nombre').focus();
});

$('#tester-cancelar').addEventListener('click', cerrarModalTester);

$('#modal-tester').addEventListener('click', e => {
    if (e.target === $('#modal-tester')) cerrarModalTester();
});

function cerrarModalTester() {
    $('#modal-tester').hidden = true;
}

$('#form-tester').addEventListener('submit', async e => {
    e.preventDefault();
    const error = $('#tester-error');
    const boton = $('#tester-guardar');
    error.hidden = true;

    const datos = {
        nombre: $('#tester-nombre').value.trim(),
        email: $('#tester-email').value.trim(),
        sistema: $('#tester-sistema').value,
        comuna: $('#tester-comuna').value.trim(),
        perfil: $('#tester-perfil').value.trim(),
    };

    if (datos.nombre.length < 2 || !datos.email) {
        error.textContent = 'El nombre y el correo son obligatorios.';
        error.hidden = false;
        return;
    }

    boton.disabled = true;
    boton.textContent = 'Agregando…';
    try {
        await api('/api/admin/testers', {
            method: 'POST',
            body: JSON.stringify(datos),
        });
        cerrarModalTester();
        brindis('Inscripción agregada.');
        cargarTesters();
    } catch (err) {
        error.textContent = err.message;
        error.hidden = false;
    } finally {
        boton.disabled = false;
        boton.textContent = 'Agregar';
    }
});

/* ------------------------------------------------------------
   APROBACIONES
   ------------------------------------------------------------
   El segundo correo: el que lleva el enlace para entrar a la prueba
   cerrada de Google Play. Es otro mensaje y otra decisión que el acuse de
   recibo de la pestaña Testers —responder no es seleccionar—, así que
   vive en su propia pantalla y se marca en su propia columna.

   Todo acá gira alrededor de dos errores caros:

   1. Mandar el correo sin enlace, o con uno roto. El correo de aprobación
      no dice nada más que "entrá por acá": sin enlace es peor que no
      mandarlo, y no se puede retirar de cuarenta bandejas.
   2. Mandárselo a quien tiene iPhone. La prueba es de Google Play; a esa
      persona se le estarían dando instrucciones que no puede seguir.
   ------------------------------------------------------------ */

/* Google exige 12 personas en opt-in continuo durante 14 días seguidos para
   dejar publicar desde una cuenta personal, y si una se sale el contador
   vuelve a cero para todas. Por eso el número se mira acá y no en una
   planilla aparte. */
const META_TESTERS = 12;

/* El tope que acepta la API en `limit`. Pedir más responde 422. */
const TOPE_LISTA = 100;

/* El enlace no se guarda en el servidor: viaja en cada petición y el panel lo
   recuerda en el navegador. Va en localStorage —y no en sessionStorage como
   los tokens— porque no es un secreto: es la misma URL pública que va dentro
   de cada correo enviado. Tener que pegarla de nuevo en cada sesión es lo que
   lleva a pegar cualquier cosa con tal de seguir. */
const CLAVE_ENLACE = 'ra_enlace_prueba';

/* Respaldo en memoria para el modo privado, donde `setItem` lanza. Sin esto
   el enlace se "guardaría" sin guardarse y los botones quedarían apagados
   para siempre sin explicación. */
let enlaceEnMemoria = '';

function leerEnlace() {
    if (enlaceEnMemoria) return enlaceEnMemoria;
    try { return (localStorage.getItem(CLAVE_ENLACE) || '').trim(); }
    catch (e) { return ''; }
}

function guardarEnlace(url) {
    enlaceEnMemoria = url;
    try {
        if (url) localStorage.setItem(CLAVE_ENLACE, url);
        else localStorage.removeItem(CLAVE_ENLACE);
    } catch (e) { /* modo privado: dura lo que la pestaña */ }
}

/**
 * Mismo criterio que `_validar_enlace` en el servidor: http(s), con dominio y
 * sin espacios en el medio.
 *
 * Se repite acá para que el error aparezca al pegarlo, y no después de pedir
 * la confirmación de un envío a cuarenta personas. Un salto de línea adentro
 * de la URL es lo que suele pasar al copiarla de Play Console, y pasa
 * inadvertido hasta que alguien intenta abrirla.
 */
function enlaceValido(url) {
    if (!url || /\s/.test(url)) return false;
    // El `://` se exige a mano, antes de `new URL()`, porque los dos
    // validadores tienen que coincidir con el del servidor y no coinciden
    // solos: `new URL()` sigue la norma WHATWG y NORMALIZA `https:/play...`
    // o `https:play...` a `https://play...`, mientras que el `urlparse` de
    // Python los deja sin host y responde 400.
    //
    // Sin esta línea el panel guardaba tan tranquilo un enlace que el servidor
    // iba a rechazar en cada envío, y quien lo pegó no tenía forma de saber
    // por qué no salía ningún correo.
    if (!/^https?:\/\//i.test(url)) return false;
    try {
        const u = new URL(url);
        return (u.protocol === 'http:' || u.protocol === 'https:') && Boolean(u.host);
    } catch (e) {
        return false;
    }
}

/**
 * Normaliza el sistema declarado con el mismo criterio que usa el servidor,
 * que compara `lower(sistema)` exacto.
 *
 * Importa que sea idéntico: si acá «Android 13» contara como Android y allá
 * no, la pantalla prometería un envío que la tanda masiva no va a hacer.
 */
function sistemaDe(t) {
    const s = (t.sistema || '').trim().toLowerCase();
    return (s === 'android' || s === 'ios') ? s : '';
}

const estadoAprob = { sistema: 'android', soloPendientes: false, items: [], total: 0, cargando: false };

$('#aprob-sistema').addEventListener('change', e => {
    estadoAprob.sistema = e.target.value;
    pintarAprobaciones();
});

$('#aprob-pendientes').addEventListener('change', e => {
    estadoAprob.soloPendientes = e.target.checked;
    pintarAprobaciones();
});

/**
 * Trae la lista completa en una sola petición, sin paginar.
 *
 * El contador de aprobados tiene que ser global —saber si vas en 7 o en 13 es
 * toda la información de esta pantalla—, y una prueba cerrada se cuenta en
 * decenas de personas, no en miles. Paginar obligaría a pedir la cuenta
 * aparte para algo que entra de una. Si alguna vez hay más de `TOPE_LISTA`,
 * la nota bajo la tabla lo dice en vez de mentir con un número corto.
 */
async function cargarAprobaciones() {
    const cuerpo = $('#tbody-aprobaciones');
    estadoAprob.cargando = true;
    cuerpo.replaceChildren(filaMensaje(5, 'Cargando…'));

    let pagina;
    try {
        pagina = await api(`/api/admin/testers?limit=${TOPE_LISTA}&offset=0`);
    } catch (e) {
        estadoAprob.cargando = false;
        cuerpo.replaceChildren(filaMensaje(5, e.message));
        return;
    }

    estadoAprob.cargando = false;
    estadoAprob.items = pagina.items || [];
    estadoAprob.total = pagina.total || 0;
    pintarAprobaciones();
}

function pintarAprobaciones() {
    const items = estadoAprob.items;
    const enlace = leerEnlace();
    const hayEnlace = enlaceValido(enlace);

    const visibles = items.filter(t => {
        if (estadoAprob.sistema && sistemaDe(t) !== estadoAprob.sistema) return false;
        if (estadoAprob.soloPendientes && t.aprobado_at) return false;
        return true;
    });

    const cuerpo = $('#tbody-aprobaciones');
    if (estadoAprob.cargando) {
        cuerpo.replaceChildren(filaMensaje(5, 'Cargando…'));
    } else if (!visibles.length) {
        cuerpo.replaceChildren(filaMensaje(5, items.length
            ? 'Nadie coincide con esos filtros.'
            : 'Todavía no hay inscripciones.'));
    } else {
        cuerpo.replaceChildren(...visibles.map(t => filaAprobacion(t, hayEnlace)));
    }

    // Se cuenta sobre la lista entera, no sobre lo que se está viendo: el
    // avance no cambia porque alguien mueva un filtro.
    const aprobados = items.filter(t => t.aprobado_at).length;
    const faltanAndroid = items.filter(
        t => sistemaDe(t) === 'android' && !t.aprobado_at).length;

    pintarMeta(aprobados);
    pintarAvisoEnlace(enlace, hayEnlace);
    pintarResumenAprobaciones(faltanAndroid, hayEnlace);

    const nota = $('#nota-aprobaciones');
    const avisos = [];
    if (estadoAprob.total > items.length) {
        avisos.push(`Se muestran las ${numero(items.length)} inscripciones más ` +
            `recientes de ${numero(estadoAprob.total)}. Las anteriores no entran en esta cuenta.`);
    }

    // Quien se inscribió sin declarar sistema queda fuera por partida doble:
    // no aparece con el filtro puesto, y la tanda masiva va por «android», así
    // que tampoco la alcanza. Sin este aviso esa gente espera un correo que
    // nadie va a mandar, y nadie se entera hasta que reclama.
    const sinSistema = items.filter(t => !sistemaDe(t)).length;
    if (sinSistema && estadoAprob.sistema) {
        avisos.push(sinSistema === 1
            ? '1 inscripción no declaró sistema: no aparece en esta lista ni entra ' +
              'en el envío masivo. Para verla, elegí «Todos los sistemas».'
            : `${numero(sinSistema)} inscripciones no declararon sistema: no aparecen ` +
              'en esta lista ni entran en el envío masivo. Para verlas, elegí ' +
              '«Todos los sistemas».');
    }

    nota.textContent = avisos.join(' ');
    nota.hidden = avisos.length === 0;
}

/** El avance hacia los 12 que exige Google. */
function pintarMeta(aprobados) {
    const tope = Math.min(aprobados, META_TESTERS);
    const faltan = META_TESTERS - aprobados;

    $('#meta-numero').textContent = `${numero(aprobados)} de ${META_TESTERS}`;
    $('#meta-texto').textContent = faltan > 0
        ? `personas recibieron el enlace. ${faltan === 1 ? 'Falta 1.' : `Faltan ${faltan}.`}`
        : 'personas recibieron el enlace. Alcanza, si todas se quedan los 14 días.';

    const pista = $('#meta-pista');
    // El máximo se escribe desde acá y no solo en el HTML: si alguna vez la
    // meta cambia, `META_TESTERS` es el único lugar que hay que tocar.
    pista.setAttribute('aria-valuemax', String(META_TESTERS));
    pista.setAttribute('aria-valuenow', String(tope));
    pista.setAttribute('aria-valuetext', `${aprobados} de ${META_TESTERS}`);
    // Redondeado: un ancho con dieciséis decimales no se ve distinto y deja el
    // atributo `style` ilegible para quien inspeccione la página.
    $('#meta-barra').style.width = `${Math.round((tope / META_TESTERS) * 100)}%`;
}

/** Qué URL va a salir, o por qué no puede salir ninguna. */
function pintarAvisoEnlace(enlace, hayEnlace) {
    const aviso = $('#aviso-enlace');
    if (hayEnlace) {
        aviso.className = 'nota-enlace';
        aviso.textContent = `Se enviará este enlace: ${enlace}`;
    } else {
        aviso.className = 'aviso aviso-atencion';
        aviso.textContent = enlace
            ? 'El enlace guardado no es una URL válida: tiene que empezar con ' +
              'https:// y no llevar espacios. Corrígelo en «Enlace de la prueba».'
            : 'Falta el enlace de la prueba. Sin él no se puede aprobar a nadie: ' +
              'el correo de aprobación no dice nada más que por dónde entrar.';
    }
    aviso.hidden = false;
    $('#btn-enlace').classList.toggle('btn-pendiente', !hayEnlace);
}

function pintarResumenAprobaciones(faltanAndroid, hayEnlace) {
    const resumen = $('#resumen-aprobaciones');
    resumen.replaceChildren();

    if (faltanAndroid > 0) {
        resumen.append(
            el('strong', null, numero(faltanAndroid)),
            document.createTextNode(faltanAndroid === 1
                ? ' persona de Android espera el enlace.'
                : ' personas de Android esperan el enlace.'),
        );
    } else {
        resumen.textContent = estadoAprob.items.length
            ? 'Todos los de Android ya recibieron el enlace.'
            : 'Sin inscripciones todavía.';
    }

    $('#btn-aprobar-todos').disabled = !hayEnlace || faltanAndroid === 0;
}

function filaAprobacion(t, hayEnlace) {
    const tr = document.createElement('tr');
    const aprobado = Boolean(t.aprobado_at);
    const sistema = sistemaDe(t);
    if (aprobado) tr.className = 'fila-aprobada';

    const persona = document.createElement('td');
    persona.append(el('div', 'celda-principal', t.nombre),
        el('div', 'celda-sub', t.email));
    if (t.comuna) persona.appendChild(el('div', 'celda-sub', t.comuna));
    tr.appendChild(persona);

    const celdaSistema = document.createElement('td');
    celdaSistema.appendChild(el('span', 'etiqueta', t.sistema || 'Sin indicar'));
    tr.appendChild(celdaSistema);

    const estado = document.createElement('td');
    if (aprobado) {
        estado.appendChild(el('span', 'estado estado-respondido', 'Enviado'));
        estado.appendChild(el('span', 'estado-detalle', fecha(t.aprobado_at)));
    } else {
        estado.appendChild(el('span', 'estado estado-pendiente', 'Sin enviar'));
        // El motivo va en la celda, no en el `title` del botón desactivado: un
        // botón desactivado no recibe foco, así que ahí nadie lo leería.
        if (sistema === 'ios') {
            estado.appendChild(el('span', 'estado-detalle',
                'La prueba cerrada es de Google Play'));
        } else if (!sistema) {
            estado.appendChild(el('span', 'estado-detalle', 'No declaró su sistema'));
        }
    }
    tr.appendChild(estado);

    tr.appendChild(el('td', 'celda-fecha', fecha(t.created_at)));

    // El contenedor flex va DENTRO del <td>: un `display:flex` sobre la celda
    // le quita su comportamiento de celda y la fila se desarma.
    const acciones = document.createElement('td');
    const grupo = el('div', 'acciones-fila');

    const boton = el('button', 'btn-fila-accion', aprobado ? 'Reenviar' : 'Aprobar');
    boton.type = 'button';

    if (sistema === 'ios') {
        boton.disabled = true;
        boton.title = 'La prueba cerrada es de Google Play: no hay nada que instalar desde un iPhone.';
        boton.setAttribute('aria-label',
            `No se puede aprobar a ${t.nombre}: declaró iPhone y la prueba es de Google Play`);
    } else if (!hayEnlace) {
        boton.disabled = true;
        boton.title = 'Falta configurar el enlace de la prueba.';
        boton.setAttribute('aria-label',
            `No se puede aprobar a ${t.nombre}: falta configurar el enlace de la prueba`);
    } else {
        boton.setAttribute('aria-label', aprobado
            ? `Reenviar el enlace de la prueba a ${t.nombre}`
            : `Aprobar a ${t.nombre} y enviarle el enlace de la prueba`);
        boton.addEventListener('click', () => aprobarA(t));
    }

    grupo.appendChild(boton);
    acciones.appendChild(grupo);
    tr.appendChild(acciones);
    return tr;
}

/** Aprueba a una persona, confirmando antes. */
function aprobarA(t) {
    const enlace = leerEnlace();
    if (!enlaceValido(enlace)) return pedirEnlace();

    const yaAprobado = Boolean(t.aprobado_at);

    confirmar({
        titulo: yaAprobado ? 'Reenviar el enlace' : 'Aprobar y enviar el enlace',
        texto: yaAprobado
            ? `A ${t.nombre} ya se le envió el enlace el ${fecha(t.aprobado_at)}. ` +
              `Si continúas, recibirá el mismo correo otra vez.`
            : `Se enviará a ${t.email} el correo de aprobación, con el enlace de ` +
              `la prueba y el pedido de mantener la app instalada 14 días seguidos.`,
        etiquetaConfirmar: yaAprobado ? 'Reenviar' : 'Enviar',
        // Reenviar sí es el error caro; aprobar por primera vez es el trabajo
        // normal de esta pantalla y no merece un botón rojo.
        peligro: yaAprobado,
        alConfirmar: async () => {
            const r = await api(`/api/admin/testers/${t.id}/aprobar`, {
                method: 'POST',
                body: JSON.stringify({ enlace, reenviar: yaAprobado }),
            });
            brindis(r.enviados
                ? `Enlace enviado a ${t.email}.`
                : (r.detalle[0] || 'No se envió nada.'));
            cargarAprobaciones();
        },
    });
}

$('#btn-aprobar-todos').addEventListener('click', async () => {
    const enlace = leerEnlace();
    if (!enlaceValido(enlace)) return pedirEnlace();

    // Se vuelve a pedir la lista justo antes de confirmar, en vez de usar la
    // que se pintó hace rato: entre medio pudo entrar otra inscripción, y el
    // número que alguien confirma tiene que ser el que se va a enviar.
    let faltan = 0;
    try {
        const p = await api(`/api/admin/testers?limit=${TOPE_LISTA}&offset=0`);
        faltan = (p.items || []).filter(
            t => sistemaDe(t) === 'android' && !t.aprobado_at).length;
    } catch (e) {
        return brindis(e.message);
    }

    if (!faltan) {
        cargarAprobaciones();
        return brindis('No queda nadie de Android por aprobar.');
    }

    confirmar({
        titulo: 'Aprobar a los de Android',
        texto: `Se enviarán ${faltan} correo(s) con el enlace de la prueba, uno por ` +
            `persona. Quienes ya fueron aprobados no reciben nada de nuevo, y los ` +
            `de iPhone quedan fuera de la tanda.`,
        etiquetaConfirmar: `Enviar ${faltan}`,
        alConfirmar: async () => {
            const r = await api('/api/admin/testers/aprobar-pendientes', {
                method: 'POST',
                body: JSON.stringify({ enlace, sistema: 'android' }),
            });
            const partes = [`${r.enviados} enviado(s)`];
            if (r.omitidos) partes.push(`${r.omitidos} omitido(s)`);
            if (r.fallidos) partes.push(`${r.fallidos} fallido(s)`);
            brindis(partes.join(', ') + '.');
            cargarAprobaciones();
        },
    });
});

/* ---------- EL ENLACE ---------- */

/** Abre el modal explicando por qué, cuando falta el enlace para enviar. */
function pedirEnlace() {
    brindis('Primero configura el enlace de la prueba.');
    abrirModalEnlace();
}

let focoPrevioEnlace = null;

function abrirModalEnlace() {
    $('#enlace-url').value = leerEnlace();
    $('#enlace-error').hidden = true;
    focoPrevioEnlace = document.activeElement;
    $('#modal-enlace').hidden = false;
    $('#enlace-url').focus();
    $('#enlace-url').select();
}

function cerrarModalEnlace() {
    $('#modal-enlace').hidden = true;
    // Devolver el foco a donde estaba: si no, el lector de pantalla queda al
    // principio del documento y hay que volver a recorrer la tabla entera.
    if (focoPrevioEnlace && document.contains(focoPrevioEnlace)) focoPrevioEnlace.focus();
    focoPrevioEnlace = null;
}

$('#btn-enlace').addEventListener('click', abrirModalEnlace);
$('#enlace-cancelar').addEventListener('click', cerrarModalEnlace);

$('#modal-enlace').addEventListener('click', e => {
    if (e.target === $('#modal-enlace')) cerrarModalEnlace();
});

$('#enlace-quitar').addEventListener('click', () => {
    guardarEnlace('');
    cerrarModalEnlace();
    brindis('Enlace quitado. Los envíos quedan desactivados.');
    pintarAprobaciones();
});

$('#form-enlace').addEventListener('submit', e => {
    e.preventDefault();
    const url = $('#enlace-url').value.trim();
    const error = $('#enlace-error');

    if (!enlaceValido(url)) {
        error.textContent = 'Tiene que ser una URL completa, sin espacios, que ' +
            'empiece con https://. Para dejar el panel sin enlace, usa «Quitar».';
        error.hidden = false;
        $('#enlace-url').focus();
        return;
    }

    guardarEnlace(url);
    cerrarModalEnlace();
    brindis('Enlace guardado.');
    pintarAprobaciones();
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

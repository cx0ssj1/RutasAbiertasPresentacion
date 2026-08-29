/* ============================================================
   RUTAS ABIERTAS — Programa de beta testers
   ============================================================ */

/* ------------------------------------------------------------
   CONFIGURACIÓN — lo único que hay que tocar para recibir datos
   ------------------------------------------------------------
   FORM_ENDPOINT: recibe la inscripción por POST (JSON) y la reenvía
   por correo al equipo. No guarda nada: el formulario recoge datos
   de discapacidad y no retenerlos es la forma más simple de
   tratarlos bien.
   Si se deja vacío, el formulario abre el cliente de correo del
   usuario con los datos ya escritos, dirigido a CONTACT_EMAIL.
   ------------------------------------------------------------ */
const FORM_ENDPOINT = 'https://api.rutasabiertas.cl/api/testers';
const CONTACT_EMAIL = 'rutas.abiertas1@gmail.com';

// ---------- MENÚ MÓVIL ----------
const menuToggle = document.querySelector('.menu-toggle');
const navLinks = document.getElementById('nav-links');

menuToggle.addEventListener('click', () => {
    const open = navLinks.classList.toggle('active');
    menuToggle.setAttribute('aria-expanded', String(open));
    const icon = menuToggle.querySelector('i');
    icon.classList.toggle('fa-bars', !open);
    icon.classList.toggle('fa-times', open);
});

navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
        navLinks.classList.remove('active');
        menuToggle.setAttribute('aria-expanded', 'false');
        const icon = menuToggle.querySelector('i');
        icon.classList.add('fa-bars');
        icon.classList.remove('fa-times');
    });
});

// ---------- TEMA CLARO / OSCURO ----------
const themeBtn = document.getElementById('theme-btn');
const htmlElement = document.documentElement;
const themeIcon = themeBtn.querySelector('i');

function applyTheme(theme) {
    const isDark = theme === 'dark';
    htmlElement.setAttribute('data-theme', theme);
    themeIcon.classList.toggle('fa-sun', isDark);
    themeIcon.classList.toggle('fa-moon', !isDark);
}

themeBtn.addEventListener('click', () => {
    const next = htmlElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    applyTheme(next);
    try { localStorage.setItem('theme', next); } catch (e) { /* modo privado */ }
});

let savedTheme = 'light';
try { savedTheme = localStorage.getItem('theme') || 'light'; } catch (e) { /* modo privado */ }
applyTheme(savedTheme);

// ---------- NAVBAR AL HACER SCROLL ----------
const navbar = document.getElementById('navbar');
const onScroll = () => navbar.classList.toggle('scrolled', window.scrollY > 20);
onScroll();
window.addEventListener('scroll', onScroll, { passive: true });

// ---------- REVELADO AL HACER SCROLL ----------
const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            obs.unobserve(entry.target);
        }
    });
}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

// ---------- AVISO PARA iOS ----------
const iosNote = document.getElementById('ios-note');
document.querySelectorAll('input[name="so"]').forEach(radio => {
    radio.addEventListener('change', () => {
        iosNote.hidden = radio.value !== 'iOS' || !radio.checked;
    });
});

// ---------- VALIDACIÓN DEL FORMULARIO ----------
const form = document.getElementById('tester-form');
const submitBtn = document.getElementById('submit-btn');
const errorBox = document.getElementById('form-errors');
const errorList = document.getElementById('form-errors-list');
const successBox = document.getElementById('form-success');
const successMsg = document.getElementById('success-msg');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const RULES = [
    {
        id: 'nombre',
        errId: 'nombre-err',
        label: 'Nombre completo',
        test: v => v.trim().length >= 3,
        message: 'Escribe tu nombre completo (al menos 3 caracteres).'
    },
    {
        id: 'email',
        errId: 'email-err',
        label: 'Correo de tu cuenta de Google',
        test: v => EMAIL_RE.test(v.trim()),
        message: 'Revisa el correo: debe tener el formato nombre@dominio.cl'
    },
    {
        id: 'so',
        errId: 'so-err',
        label: 'Qué teléfono usas',
        radio: true,
        test: () => !!form.querySelector('input[name="so"]:checked'),
        message: 'Indica si usas Android o iPhone.'
    },
    {
        id: 'consentimiento',
        errId: 'consent-err',
        label: 'Autorización de uso de datos',
        checkbox: true,
        test: () => document.getElementById('consentimiento').checked,
        message: 'Necesitamos tu autorización para poder contactarte.'
    }
];

function clearErrors() {
    errorBox.hidden = true;
    errorList.innerHTML = '';
    RULES.forEach(rule => {
        const err = document.getElementById(rule.errId);
        err.hidden = true;
        err.textContent = '';
        const input = document.getElementById(rule.id);
        if (input) input.removeAttribute('aria-invalid');
    });
}

function validate() {
    clearErrors();
    const fails = [];

    RULES.forEach(rule => {
        const input = document.getElementById(rule.id);
        const value = rule.radio || rule.checkbox ? '' : input.value;
        if (rule.test(value)) return;

        fails.push(rule);
        const err = document.getElementById(rule.errId);
        err.textContent = rule.message;
        err.hidden = false;
        if (input && !rule.radio) input.setAttribute('aria-invalid', 'true');
        if (rule.radio) {
            form.querySelectorAll('input[name="so"]').forEach(r => r.setAttribute('aria-invalid', 'true'));
        }
    });

    if (fails.length) {
        fails.forEach(rule => {
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.href = '#' + rule.id;
            a.textContent = rule.label + ': ' + rule.message;
            a.addEventListener('click', ev => {
                ev.preventDefault();
                const target = document.getElementById(rule.id);
                if (target) target.focus();
            });
            li.appendChild(a);
            errorList.appendChild(li);
        });
        errorBox.hidden = false;
        errorBox.focus();
    }

    return fails.length === 0;
}

// Limpia el error de un campo apenas el usuario lo corrige
['nombre', 'email'].forEach(id => {
    document.getElementById(id).addEventListener('input', function () {
        if (this.getAttribute('aria-invalid') !== 'true') return;
        const rule = RULES.find(r => r.id === id);
        if (rule.test(this.value)) {
            this.removeAttribute('aria-invalid');
            document.getElementById(rule.errId).hidden = true;
        }
    });
});

// ---------- ENVÍO ----------
function collect() {
    const data = new FormData(form);
    const so = form.querySelector('input[name="so"]:checked');
    const perfiles = Array.from(form.querySelectorAll('input[name="perfil"]:checked')).map(c => c.value);
    return {
        nombre: (data.get('nombre') || '').trim(),
        email: (data.get('email') || '').trim(),
        sistema: so ? so.value : '',
        comuna: (data.get('comuna') || '').trim(),
        perfil: perfiles.join(', '),
        accesibilidad: (data.get('accesibilidad') || '').trim(),
        origen: 'rutasabiertas.cl/testers-form',
        // Campo trampa: el servidor lo revisa también, porque un bot que hable
        // directo con la API nunca ejecuta este script.
        empresa: (data.get('empresa') || '').trim()
    };
}

function showSuccess(text) {
    form.hidden = true;
    errorBox.hidden = true;
    if (text) successMsg.textContent = text;
    successBox.hidden = false;
    successBox.focus();
    successBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function setLoading(on) {
    submitBtn.disabled = on;
    submitBtn.innerHTML = on
        ? '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Enviando...'
        : '<i class="fas fa-paper-plane" aria-hidden="true"></i> Quiero ser tester';
}

function mailtoFallback(payload) {
    const cuerpo = [
        'Quiero inscribirme como beta tester de Rutas Abiertas.',
        '',
        'Nombre: ' + payload.nombre,
        'Correo de Google: ' + payload.email,
        'Teléfono: ' + payload.sistema,
        'Comuna o ciudad: ' + (payload.comuna || '(no indicada)'),
        'Perfil: ' + (payload.perfil || '(no indicado)'),
        'Necesidades de accesibilidad: ' + (payload.accesibilidad || '(no indicadas)'),
        '',
        'Autorizo el uso de estos datos para gestionar el programa de pruebas.'
    ].join('\n');

    const url = 'mailto:' + CONTACT_EMAIL
        + '?subject=' + encodeURIComponent('Inscripción beta tester — ' + payload.nombre)
        + '&body=' + encodeURIComponent(cuerpo);

    window.location.href = url;
    showSuccess('Abrimos tu aplicación de correo con la inscripción ya escrita. Envía ese correo y quedarás en la lista. Si no se abrió, escríbenos a ' + CONTACT_EMAIL + '.');
}

form.addEventListener('submit', async ev => {
    ev.preventDefault();

    // Trampa antispam: los bots rellenan todos los campos, las personas no ven este
    if (form.querySelector('#empresa').value) {
        showSuccess();
        return;
    }

    if (!validate()) return;

    const payload = collect();

    if (!FORM_ENDPOINT) {
        mailtoFallback(payload);
        return;
    }

    setLoading(true);
    try {
        const res = await fetch(FORM_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (res.status === 429) {
            throw new Error('Ya recibimos varias inscripciones desde tu conexión. '
                + 'Espera un rato o escríbenos por correo.');
        }
        if (!res.ok) throw new Error('HTTP ' + res.status);
        showSuccess(payload.sistema === 'iOS'
            ? 'Anotamos tu correo en la lista de espera. Te avisaremos apenas exista la versión para iPhone.'
            : null);
    } catch (err) {
        setLoading(false);
        const detalle = err && err.message && !err.message.startsWith('HTTP')
            ? err.message
            : 'Revisa tu conexión e inténtalo otra vez';
        errorList.innerHTML = '<li>No pudimos enviar la inscripción. ' + detalle
            + ', o escríbenos a <a href="mailto:' + CONTACT_EMAIL + '">' + CONTACT_EMAIL + '</a>.</li>';
        errorBox.hidden = false;
        errorBox.focus();
    }
});

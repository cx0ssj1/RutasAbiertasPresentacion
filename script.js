/* ============================================================
   RUTAS ABIERTAS — interacciones de la presentación
   ============================================================ */

// ---------- MENÚ MÓVIL ----------
const menuToggle = document.querySelector('.menu-toggle');
const navLinks = document.getElementById('nav-links');

menuToggle.addEventListener('click', () => {
    navLinks.classList.toggle('active');
    const icon = menuToggle.querySelector('i');
    icon.classList.toggle('fa-bars');
    icon.classList.toggle('fa-times');
});

// Cerrar el menú al pulsar un enlace (móvil)
navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
        navLinks.classList.remove('active');
        const icon = menuToggle.querySelector('i');
        icon.classList.add('fa-bars');
        icon.classList.remove('fa-times');
    });
});

// ---------- TEMA CLARO / OSCURO ----------
const themeBtn = document.getElementById('theme-btn');
const htmlElement = document.documentElement;
const themeIcon = themeBtn.querySelector('i');
const appScreens = document.querySelectorAll('.app-screen');

function updateImages(isDark) {
    appScreens.forEach(img => {
        const baseName = img.dataset.name;
        if (!baseName) return;
        img.src = isDark ? `/layouts/dark/${baseName}Dark.jpg` : `/layouts/light/${baseName}.jpg`;
    });
}

function setThemeIcon(isDark) {
    themeIcon.classList.toggle('fa-sun', isDark);
    themeIcon.classList.toggle('fa-moon', !isDark);
}

function applyTheme(theme) {
    const isDark = theme === 'dark';
    htmlElement.setAttribute('data-theme', theme);
    setThemeIcon(isDark);
    updateImages(isDark);
}

themeBtn.addEventListener('click', () => {
    const next = htmlElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    applyTheme(next);
    localStorage.setItem('theme', next);
});

applyTheme(localStorage.getItem('theme') || 'light');

// ---------- NAVBAR AL HACER SCROLL ----------
const navbar = document.getElementById('navbar');
const onScroll = () => navbar.classList.toggle('scrolled', window.scrollY > 20);
onScroll();
window.addEventListener('scroll', onScroll, { passive: true });

// ---------- REVELADO AL HACER SCROLL ----------
const reveals = document.querySelectorAll('.reveal');
const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            obs.unobserve(entry.target);
        }
    });
}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

reveals.forEach(el => observer.observe(el));

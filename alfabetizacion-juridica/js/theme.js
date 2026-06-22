/**
 * theme.js — modo claro/oscuro para Alfabetización Jurídica.
 * Aplica el tema guardado de inmediato (sin parpadeo) y enlaza el
 * botón de la navbar una vez que los componentes se han inyectado.
 */
(function () {
    const KEY = 'theme'; // misma clave que la presentación → el tema persiste entre sitios
    const root = document.documentElement;

    function syncIcon(theme) {
        const btn = document.getElementById('theme-btn');
        if (!btn) return;
        const icon = btn.querySelector('i');
        if (!icon) return;
        icon.classList.toggle('fa-sun', theme === 'dark');
        icon.classList.toggle('fa-moon', theme !== 'dark');
    }

    function apply(theme) {
        root.setAttribute('data-theme', theme);
        root.setAttribute('data-bs-theme', theme);
        syncIcon(theme);
    }

    // Aplicar cuanto antes para evitar el flash
    apply(localStorage.getItem(KEY) || 'light');

    window.addEventListener('componentsLoaded', () => {
        const current = localStorage.getItem(KEY) || 'light';
        syncIcon(current);
        const btn = document.getElementById('theme-btn');
        if (!btn) return;
        btn.addEventListener('click', () => {
            const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            localStorage.setItem(KEY, next);
            apply(next);
        });
    });
})();

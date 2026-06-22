/**
 * apoyo.js
 * Gestiona la interactividad de la página de Recursos y Apoyo.
 * Búsqueda con debounce, filtros por categoría y animaciones de scroll.
 */
(function () {
    document.addEventListener('DOMContentLoaded', function () {
        inicializarAnimacionesScroll();
        inicializarBusqueda();
        inicializarFiltros();
    });

    // ==========================================
    // ANIMACIONES DE SCROLL
    // ==========================================
    function inicializarAnimacionesScroll() {
        const observador = new IntersectionObserver((entradas, observer) => {
            entradas.forEach(entrada => {
                if (entrada.isIntersecting) {
                    entrada.target.classList.add('show');
                    observer.unobserve(entrada.target);
                }
            });
        }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

        document.querySelectorAll('.hidden').forEach(el => observador.observe(el));
    }

    // ==========================================
    // BÚSQUEDA
    // ==========================================
    function inicializarBusqueda() {
        const campoBusqueda = document.getElementById('searchInput');
        if (!campoBusqueda) return;

        const buscarDebounced = debounce(realizarBusqueda, 300);
        campoBusqueda.addEventListener('input', buscarDebounced);

        const btnBuscar = document.getElementById('searchBtn');
        if (btnBuscar) btnBuscar.addEventListener('click', realizarBusqueda);

        campoBusqueda.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); realizarBusqueda(); }
        });

        const btnLimpiar = document.getElementById('clearSearch');
        if (btnLimpiar) btnLimpiar.addEventListener('click', () => {
            campoBusqueda.value = '';
            realizarBusqueda();
        });
    }

    function realizarBusqueda() {
        const campo = document.getElementById('searchInput');
        const termino = campo ? campo.value.toLowerCase().trim() : '';
        const items = document.querySelectorAll('.resource-item');
        const sinResultados = document.getElementById('no-results');
        let visibles = 0;

        items.forEach(item => {
            // Cachea el texto del item para no recalcular en cada tecla
            if (!item.dataset.textoBusqueda) {
                item.dataset.textoBusqueda = item.textContent.toLowerCase();
            }
            const coincide = termino === '' || item.dataset.textoBusqueda.includes(termino);
            item.classList.toggle('filtered-out', !coincide);
            if (coincide) visibles++;
        });

        if (sinResultados) {
            sinResultados.classList.toggle('d-none', visibles > 0 || termino === '');
        }

        // Al buscar, quitar el filtro activo visualmente
        if (termino !== '') {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        }
    }

    // ==========================================
    // FILTROS POR CATEGORÍA
    // ==========================================
    function inicializarFiltros() {
        const botones = document.querySelectorAll('.filter-btn');
        botones.forEach(boton => {
            boton.addEventListener('click', function () {
                if (this.classList.contains('active')) return;

                botones.forEach(b => b.classList.remove('active'));
                this.classList.add('active');

                aplicarFiltro(this.dataset.filter);

                // Limpiar campo de búsqueda al cambiar de filtro
                const campo = document.getElementById('searchInput');
                if (campo) campo.value = '';
                const sinResultados = document.getElementById('no-results');
                if (sinResultados) sinResultados.classList.add('d-none');
            });
        });
    }

    function aplicarFiltro(filtro) {
        document.querySelectorAll('.resource-item').forEach(item => {
            const categorias = item.dataset.category || '';
            const mostrar = filtro === 'all' || categorias.includes(filtro);
            item.classList.toggle('filtered-out', !mostrar);
        });
    }

    // ==========================================
    // UTILIDAD: DEBOUNCE
    // ==========================================
    function debounce(fn, delay) {
        let timer;
        return function (...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    }

})();

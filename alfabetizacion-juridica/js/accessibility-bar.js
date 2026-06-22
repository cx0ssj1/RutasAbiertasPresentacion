/**
 * accessibility-bar.js
 * Gestiona la barra de accesibilidad del sitio web:
 *  - Tamaño de texto (+ / -)
 *  - Alto contraste
 *  - Lectura en voz alta (Web Speech API)
 * Las preferencias se persisten en localStorage con la clave 'ucscA11ySettings'.
 */
(function () {
    window.addEventListener('componentsLoaded', () => {

        const A11Y_SETTINGS_KEY = 'ucscA11ySettings';

        const elements = {
            bar: document.getElementById('accessibility-bar'),
            increaseTextBtn: document.getElementById('increase-text'),
            decreaseTextBtn: document.getElementById('decrease-text'),
            contrastBtn: document.getElementById('toggle-contrast'),
            readPageBtn: document.getElementById('read-page'),
            mainContent: document.querySelector('main')
        };

        if (!elements.bar) {
            console.error('Error Crítico: No se encontró #accessibility-bar tras el evento componentsLoaded.');
            return;
        }

        const state = {
            isReading: false,
            synth: window.speechSynthesis
        };

        // ==========================================
        // TAMAÑO DE TEXTO
        // ==========================================
        function applyTextSize(size) {
            document.documentElement.style.fontSize = `${size}%`;
        }

        function changeTextSize(amount) {
            const current = parseFloat(document.documentElement.style.fontSize || '100');
            const next = Math.max(70, Math.min(180, current + amount));
            applyTextSize(next);
            saveSetting('fontSize', next);
        }

        // ==========================================
        // ALTO CONTRASTE
        // ==========================================
        function applyContrast(isActive) {
            document.body.classList.toggle('high-contrast', isActive);
            if (elements.contrastBtn) elements.contrastBtn.classList.toggle('active', isActive);
            saveSetting('highContrast', isActive);
        }

        // ==========================================
        // LECTURA EN VOZ ALTA (Web Speech API)
        // ==========================================
        function startReading() {
            if (!state.synth) {
                alert('Tu navegador no soporta la lectura de texto. Prueba con Chrome o Edge.');
                return;
            }

            state.synth.cancel();

            const texto = elements.mainContent
                ? elements.mainContent.innerText
                : document.body.innerText;

            const utterance = new SpeechSynthesisUtterance(texto);
            utterance.lang = 'es-CL';
            utterance.rate = 0.95;
            utterance.pitch = 1;

            utterance.onstart = () => {
                state.isReading = true;
                updateReadButton(true);
            };

            utterance.onend = () => stopReading();
            utterance.onerror = () => stopReading();

            state.synth.speak(utterance);
        }

        function stopReading() {
            if (state.synth) state.synth.cancel();
            state.isReading = false;
            updateReadButton(false);
        }

        function updateReadButton(reading) {
            if (!elements.readPageBtn) return;
            elements.readPageBtn.classList.toggle('active', reading);
            const span = elements.readPageBtn.querySelector('span');
            if (span) span.textContent = reading ? 'Detener' : 'Leer';
            const icon = elements.readPageBtn.querySelector('i');
            if (icon) {
                icon.className = reading ? 'fa fa-stop-circle' : 'fa fa-volume-up';
            }
        }

        function handleReadToggle() {
            state.isReading ? stopReading() : startReading();
        }

        // ==========================================
        // PERSISTENCIA (localStorage)
        // ==========================================
        function loadSettings() {
            const saved = JSON.parse(localStorage.getItem(A11Y_SETTINGS_KEY));
            if (!saved) return;
            if (saved.fontSize) applyTextSize(saved.fontSize);
            if (saved.highContrast) applyContrast(saved.highContrast);
        }

        function saveSetting(key, value) {
            const settings = JSON.parse(localStorage.getItem(A11Y_SETTINGS_KEY)) || {};
            settings[key] = value;
            localStorage.setItem(A11Y_SETTINGS_KEY, JSON.stringify(settings));
        }

        // ==========================================
        // INICIALIZACIÓN
        // ==========================================
        function init() {
            if (elements.increaseTextBtn) elements.increaseTextBtn.addEventListener('click', () => changeTextSize(10));
            if (elements.decreaseTextBtn) elements.decreaseTextBtn.addEventListener('click', () => changeTextSize(-10));
            if (elements.contrastBtn) elements.contrastBtn.addEventListener('click', () => applyContrast(!document.body.classList.contains('high-contrast')));
            if (elements.readPageBtn) elements.readPageBtn.addEventListener('click', handleReadToggle);

            window.addEventListener('beforeunload', () => {
                if (state.isReading) stopReading();
            });

            loadSettings();
        }

        init();

    });
})();

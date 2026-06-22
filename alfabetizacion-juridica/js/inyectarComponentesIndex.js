// Página: index.html (raíz del sitio legal) → base relativa vacía
const BASE = "";
const withBase = html => html.replaceAll("{{base}}", BASE);

const fetchPromises = [
    fetch("components/navbar/navbar.html").then(res => res.text()),
    fetch("components/footer/footer.html").then(res => res.text()),
    fetch("components/accessibility-bar/accessibility-bar.html").then(res => res.text()),
    fetch("components/modals/language-modal.html").then(res => res.text()),
    fetch("components/modals/normativa-modal.html").then(res => res.text()),
    fetch("components/modals/resource-modal.html").then(res => res.text()),
    fetch("components/modals/disc-modal.html").then(res => res.text())
];

Promise.all(fetchPromises)
    .then(([navbar, footer, accessibilityBar, langModal, normativaModal, resourceModal, discModal]) => {
        document.getElementById("navbar-container").innerHTML = withBase(navbar);
        document.getElementById("footer-container").innerHTML = withBase(footer);
        document.getElementById("accessibility-bar-container").innerHTML = accessibilityBar;
        document.getElementById("language-modal-container").innerHTML = withBase(langModal);
        document.getElementById("normativa-modal-container").innerHTML = withBase(normativaModal);
        document.getElementById("resource-modal-container").innerHTML = withBase(resourceModal);
        document.getElementById("disc-modal").innerHTML = withBase(discModal);

        window.dispatchEvent(new CustomEvent('componentsLoaded'));
        document.body.classList.add('loaded');
    })
    .catch(error => {
        console.error("Error al cargar componentes:", error);
        document.body.classList.add('loaded');
    });

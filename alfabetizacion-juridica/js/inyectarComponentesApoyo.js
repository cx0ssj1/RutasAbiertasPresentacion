// Página: pages/apoyo.html → un nivel de profundidad
const BASE = "../";
const withBase = html => html.replaceAll("{{base}}", BASE);

const fetchPromises = [
    fetch("../components/navbar/navbar.html").then(res => res.text()),
    fetch("../components/footer/footer.html").then(res => res.text()),
    fetch("../components/accessibility-bar/accessibility-bar.html").then(res => res.text()),
    fetch("../components/modals/guiacred-modal.html").then(res => res.text())
];

Promise.all(fetchPromises)
    .then(([navbar, footer, accessibilityBar, guiacredHtml]) => {
        document.getElementById("navbar-container").innerHTML = withBase(navbar);
        document.getElementById("footer-container").innerHTML = withBase(footer);
        document.getElementById("accessibility-bar-container").innerHTML = accessibilityBar;
        document.getElementById("modal-guia").innerHTML = withBase(guiacredHtml);

        window.dispatchEvent(new CustomEvent('componentsLoaded'));
        document.body.classList.add('loaded');
    })
    .catch(error => {
        console.error("Error al cargar componentes:", error);
        document.body.classList.add('loaded');
    });

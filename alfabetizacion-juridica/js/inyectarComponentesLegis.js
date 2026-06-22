// Página: pages/legislacion.html → un nivel de profundidad
const BASE = "../";
const withBase = html => html.replaceAll("{{base}}", BASE);

const fetchPromises = [
    fetch("../components/navbar/navbar.html").then(res => res.text()),
    fetch("../components/footer/footer.html").then(res => res.text()),
    fetch("../components/accessibility-bar/accessibility-bar.html").then(res => res.text())
];

Promise.all(fetchPromises)
    .then(([navbar, footer, accessibilityBar]) => {
        document.getElementById("navbar-container").innerHTML = withBase(navbar);
        document.getElementById("footer-container").innerHTML = withBase(footer);
        document.getElementById("accessibility-bar-container").innerHTML = accessibilityBar;

        window.dispatchEvent(new CustomEvent('componentsLoaded'));
        document.body.classList.add('loaded');
    })
    .catch(error => {
        console.error("Error al cargar componentes:", error);
        document.body.classList.add('loaded');
    });

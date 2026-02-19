const menuToggle = document.querySelector('.menu-toggle');
const navLinks = document.querySelector('.nav-links');

menuToggle.addEventListener('click', () => {
    navLinks.classList.toggle('active');
    const icon = menuToggle.querySelector('i');
    icon.classList.toggle('fa-bars');
    icon.classList.toggle('fa-times');
});

const themeBtn = document.getElementById('theme-btn');
const htmlElement = document.documentElement;
const themeIcon = themeBtn.querySelector('i');
const appScreens = document.querySelectorAll('.app-screen');

function updateImages(isDark) {
    appScreens.forEach(img => {
        const baseName = img.dataset.name;
        if (isDark) {
            img.src = `/layouts/dark/${baseName}Dark.jpg`;
        } else {
            img.src = `/layouts/light/${baseName}.jpg`;
        }
    });
}

function toggleTheme() {
    const currentTheme = htmlElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';

    htmlElement.setAttribute('data-theme', newTheme);

    if (newTheme === 'dark') {
        themeIcon.classList.remove('fa-moon');
        themeIcon.classList.add('fa-sun');
        updateImages(true);
    } else {
        themeIcon.classList.remove('fa-sun');
        themeIcon.classList.add('fa-moon');
        updateImages(false);
    }
    localStorage.setItem('theme', newTheme);
}

themeBtn.addEventListener('click', toggleTheme);

const savedTheme = localStorage.getItem('theme');
if (savedTheme) {
    htmlElement.setAttribute('data-theme', savedTheme);
    if (savedTheme === 'dark') {
        themeIcon.classList.remove('fa-moon');
        themeIcon.classList.add('fa-sun');
        updateImages(true);
    }
}

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
        }
    });
});

document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));
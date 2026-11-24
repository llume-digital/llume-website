const toggle = document.querySelector('.menu-toggle');
const mobileNav = document.querySelector('.mobile-nav');

if (toggle && mobileNav) {
  const closeMenu = () => {
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Abrir menú');
    mobileNav.hidden = true;
  };

  toggle.addEventListener('click', () => {
    const isOpen = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!isOpen));
    toggle.setAttribute('aria-label', isOpen ? 'Abrir menú' : 'Cerrar menú');
    mobileNav.hidden = isOpen;
  });

  mobileNav.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu();
  });
}

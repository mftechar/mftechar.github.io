/* MF Tech AR — interacciones del sitio (sin dependencias) */
(() => {
  const header = document.querySelector('.site-header');
  const menuBtn = document.getElementById('menuBtn');
  const nav = document.getElementById('mainNav');

  // Sombra del header al scrollear
  const onScroll = () => {
    if (header) header.classList.toggle('scrolled', window.scrollY > 12);
  };
  onScroll();
  addEventListener('scroll', onScroll, { passive: true });

  // Menú móvil
  if (menuBtn && nav) {
    menuBtn.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      menuBtn.setAttribute('aria-expanded', String(open));
      menuBtn.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    });
    nav.addEventListener('click', (e) => {
      if (e.target.closest('a') && nav.classList.contains('open')) {
        nav.classList.remove('open');
        menuBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // Botón flotante de WhatsApp: aparece al salir del hero
  const waFloat = document.querySelector('.wa-float');
  const onScroll2 = () => {
    if (waFloat) waFloat.classList.toggle('show', window.scrollY > 420);
  };
  onScroll2();
  addEventListener('scroll', onScroll2, { passive: true });

  // Año del pie
  const year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());

  // Aparición suave al scrollear
  const items = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && items.length) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('in');
            io.unobserve(entry.target);
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 }
    );
    items.forEach((el, i) => {
      el.style.transitionDelay = `${Math.min(i % 6, 5) * 55}ms`;
      io.observe(el);
    });
  } else {
    items.forEach((el) => el.classList.add('in'));
  }
})();

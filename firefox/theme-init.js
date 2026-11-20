(function () {
  const saved = localStorage.getItem('la-theme');
  const sys = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-mode', saved || sys);
})();

(() => {
  const key = 'apatt-theme-v1';
  let theme = 'light';
  try { if (localStorage.getItem(key) === 'dark') theme = 'dark'; } catch (_) {}
  function apply() {
    const dark = theme === 'dark';
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]').content = dark ? '#000000' : '#ffffff';
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      button.textContent = dark ? '白色' : '黑色';
      button.setAttribute('aria-label', dark ? '切换到白色主题' : '切换到黑色主题');
    });
  }
  // Apply before the stylesheet and body paint to avoid a light flash on reload.
  apply();
  document.addEventListener('DOMContentLoaded', () => {
    apply();
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      button.addEventListener('click', () => {
        theme = theme === 'dark' ? 'light' : 'dark';
        try { localStorage.setItem(key, theme); } catch (_) {}
        apply();
      });
    });
  });
})();

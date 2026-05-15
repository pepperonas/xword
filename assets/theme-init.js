(function () {
  try {
    var pref = localStorage.getItem('xword.theme') || 'auto';
    var dark = pref === 'dark' ||
      (pref === 'auto' && window.matchMedia &&
       window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.setAttribute('data-theme', 'dark');
  } catch (e) {}
})();

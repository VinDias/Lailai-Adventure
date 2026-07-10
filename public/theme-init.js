// Aplica o tema salvo ANTES do primeiro paint (script síncrono no <head>).
// Sem isso a página pinta clara (:root é light) até o React montar — flash
// claro e janela em que o dark-mode forçado do navegador decide inverter
// cores (ícones SVG invisíveis em alguns aparelhos). Arquivo externo em vez
// de script inline porque a CSP (helmet) só permite script-src 'self'.
(function () {
  try {
    var t = localStorage.getItem('theme') || 'dark';
    if (t === 'dark') document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = t;
  } catch (e) {
    document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = 'dark';
  }
})();

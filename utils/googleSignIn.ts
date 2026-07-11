// Carrega o script do Google Identity Services (GIS) sob demanda, uma única
// vez. O script só é injetado quando a tela de login renderiza o botão — não
// no boot do app — para não pesar o carregamento inicial.
let gsiPromise: Promise<void> | null = null;

export function loadGoogleSignIn(): Promise<void> {
  if (gsiPromise) return gsiPromise;
  gsiPromise = new Promise((resolve, reject) => {
    if ((window as any).google?.accounts?.id) return resolve();
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gsiPromise = null; // permite nova tentativa em caso de falha de rede
      reject(new Error('Falha ao carregar o Google Sign-In.'));
    };
    document.head.appendChild(script);
  });
  return gsiPromise;
}

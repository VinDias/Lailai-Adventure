
/**
 * Configuração centralizada da URL da API.
 */
const getApiUrl = (): string => {
  // @ts-ignore
  let envUrl = (import.meta as any).env?.VITE_API_URL;
  
  // Se não houver variável, usa o padrão
  if (!envUrl) envUrl = "http://localhost:3000/api";
  
  // Remove a barra final se existir para evitar "api//health"
  return envUrl.endsWith('/') ? envUrl.slice(0, -1) : envUrl;
};

const API_URL = getApiUrl();

export default API_URL;

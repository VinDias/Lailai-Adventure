
const fs = require("fs");
const path = require("path");

/**
 * Cria uma pasta para o conteúdo organizada por tipo e seção.
 * @param {string} type - 'videos' ou 'webtoons'
 * @param {string} section - 'HQCINE', 'VCINE' ou 'HIQUA'
 * @param {string} title - Título do conteúdo
 * @returns {string} - Caminho absoluto da pasta criada
 */
function createContentFolder(type, section, title) {
  if (!title) title = "sem-titulo-" + Date.now();
  if (!section) section = "geral";
  
  const slug = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .trim()
    .replace(/^-+|-+$/g, "");

  // Estrutura: uploads/{type}/{section}/{slug}
  const folderPath = path.join(
    __dirname, 
    "..", 
    "uploads", 
    type, 
    section.toLowerCase(), 
    slug
  );

  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }

  return folderPath;
}

module.exports = { createContentFolder };


const fs = require("fs");
const path = require("path");

/**
 * Cria uma pasta para o conteúdo (vídeo ou webtoon) usando um slug do título.
 * @param {string} type - 'videos' ou 'webtoons'
 * @param {string} title - Título do conteúdo
 * @returns {string} - Caminho absoluto da pasta criada
 */
function createContentFolder(type, title) {
  if (!title) title = "sem-titulo-" + Date.now();
  
  const slug = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove acentos
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .trim()
    .replace(/^-+|-+$/g, "");

  const folderPath = path.join(__dirname, "..", "uploads", type, slug);

  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }

  return folderPath;
}

module.exports = { createContentFolder };

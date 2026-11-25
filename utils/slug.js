/**
 * Slug de pasta no Bunny a partir do título da obra. Saiu de
 * routes/bunnyWebhook.js (frente A, item 3) para o envio de pasta gravar na
 * MESMA pasta da obra que os envios antigos, sem uma segunda cópia da regra.
 */
function toSlug(str) {
  return (str || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

module.exports = { toSlug };

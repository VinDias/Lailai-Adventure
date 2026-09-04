/**
 * Fase 5 Bloco 2, Task 8 (higiene herdada do Bloco 1) — trata CastError de
 * forma consistente nas rotas com `:id`, generalizando o padrão que
 * routes/adminPortal.js já usava (e que a revisão da Task 6 achou incompleto
 * — ver "Dívida T6 (1)" no ledger .superpowers/sdd/2026-09-03-fase5-bloco2/
 * progress.md).
 *
 * CastError no `_id` do parâmetro da rota (ObjectId malformado, ex. "abc")
 * é um id que simplesmente não corresponde a nenhum documento → 404, o
 * MESMO shape de "não encontrado" que o findById devolveria para um id
 * válido mas inexistente (nunca confirma nem nega a existência de outro
 * jeito).
 *
 * CastError em QUALQUER OUTRO campo (ex. `content_rating` recebendo um
 * array no body de POST /admin/aprovacoes/series/:id/aprovar — Mongoose
 * lança CastError ao tentar castar um Array para o String do schema) é erro
 * de VALIDAÇÃO do que o cliente mandou → 400 com mensagem legível. Mapear
 * isso para 404 (o bug encontrado na revisão da T6) mascararia um erro de
 * input do próprio admin como se o recurso não existisse.
 *
 * Devolve `true` (e já respondeu) se `err` for CastError; `false` se não for
 * — o chamador segue para o próximo `if`/o catch genérico.
 */
function responderCastError(err, res, mensagem404) {
  if (err.name !== 'CastError') return false;
  if (err.path === '_id') {
    res.status(404).json({ error: mensagem404 });
  } else {
    res.status(400).json({ error: `Valor inválido para o campo "${err.path}".` });
  }
  return true;
}

module.exports = { responderCastError };

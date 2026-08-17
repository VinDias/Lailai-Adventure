const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Descobre de quem é a requisição: da conta logada ou de um visitante.
 *
 * A conta sempre vence — se o usuário logou, o progresso é dele, mesmo que o
 * aparelho ainda mande o identificador antigo no cabeçalho.
 *
 * O formato do identificador é validado para não deixar entrar lixo (ou tentativa
 * de injeção) num campo que vai para consulta no banco.
 */
module.exports = function getIdentity(req) {
  if (req.user?.id) return { userId: req.user.id };

  const anon = req.headers?.['x-anonymous-id'];
  if (typeof anon === 'string' && UUID_V4.test(anon)) return { anonymousId: anon };

  return null;
};

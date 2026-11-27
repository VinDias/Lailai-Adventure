/**
 * Edição de um episódio JÁ PUBLICADO, feita pelo autor, à espera de aprovação
 * (Fase 7, frente A, item 7). Os painéis novos ficam AQUI, à parte: o
 * episódio no ar (models/Episode.js) não muda até o moderador aprovar, então
 * nenhuma rota pública precisa saber que isto existe.
 *
 * Uma revisão por episódio: o `_id` é o próprio `_id` do episódio. Duas ações
 * do autor ao mesmo tempo num episódio sem revisão não criam duas (a segunda
 * bate na chave e usa a primeira), sem depender de índice único criado à
 * parte. Aprovada ou descartada, o documento é apagado; a história fica no
 * AdminLog.
 *
 * Ver services/revisaoEpisodioService.js.
 */
const mongoose = require('mongoose');
const Episode = require('./Episode');

// O MESMO formato de painel do episódio (uma definição só): os painéis da
// revisão nascem como cópia dos publicados, com os mesmos `_id`.
const PainelSchema = Episode.schema.path('panels').schema;

const RevisaoEpisodioSchema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId, ref: 'Episode' },
  seriesId: { type: mongoose.Schema.Types.ObjectId, ref: 'Series', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  panels: { type: [PainelSchema], default: [] },
  // Capa nova, só quando a pasta reenviada trouxe uma. Sem ela a capa do ar fica.
  thumbnail: { type: String, default: null },
  // editando: o autor mexe. enviada: na fila, ninguém mexe. aprovando: trava
  // de segundos enquanto a troca acontece.
  status: { type: String, enum: ['editando', 'enviada', 'aprovando'], default: 'editando', index: true },
  submittedAt: { type: Date, default: null },
  // Última devolução do moderador: o motivo que o autor vê no Meu Estúdio.
  devolucao: {
    motivo: { type: String, default: null },
    em: { type: Date, default: null },
  },
}, { timestamps: true });

module.exports = mongoose.model('RevisaoEpisodio', RevisaoEpisodioSchema);

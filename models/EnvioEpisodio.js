/**
 * Um envio de pasta de episódio em andamento (frente A, item 3). Guarda o que
 * o servidor espera receber, com o nome que ELE montou no Bunny, e o que já
 * chegou. Os painéis do episódio só mudam no `concluir`, de uma vez; até lá o
 * episódio continua como estava (envio interrompido não deixa nada pela metade).
 *
 * Ver services/envioEpisodioService.js.
 */
const mongoose = require('mongoose');

const ArquivoEsperadoSchema = new mongoose.Schema({
  chave: { type: String, required: true }, // "0", "0-en", "capa"
  tipo: { type: String, enum: ['pagina', 'balao', 'capa'], required: true },
  ordem: { type: Number, default: null }, // posição do painel no episódio (null na capa)
  idioma: { type: String, enum: ['pt', 'en', 'es', 'zh'], default: undefined },
  largura: { type: Number, default: null }, // null = não conferido (capa)
  altura: { type: Number, default: null },
  caminho: { type: String, required: true }, // caminho no Storage
  recebido: { type: Boolean, default: false },
  url: { type: String, default: null },
  bytes: { type: Number, default: 0 }, // tamanho do que chegou (depois do corte)
}, { _id: false });

const EnvioEpisodioSchema = new mongoose.Schema({
  episodeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Episode', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  porAdmin: { type: Boolean, default: false },
  // Item 7: envio do autor para episódio PUBLICADO. O concluir grava a revisão, não o episódio.
  paraRevisao: { type: Boolean, default: false },
  status: { type: String, enum: ['aberto', 'concluindo', 'concluido', 'cancelado'], default: 'aberto', index: true },
  pasta: { type: String, required: true },
  totalPaineis: { type: Number, required: true },
  bytesDeclarados: { type: Number, default: 0 }, // soma dos originais da pasta
  tetoBytes: { type: Number, default: 0 }, // máximo que pode chegar de fato (0 = sem teto)
  arquivos: { type: [ArquivoEsperadoSchema], default: [] },
  concluidoEm: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('EnvioEpisodio', EnvioEpisodioSchema);

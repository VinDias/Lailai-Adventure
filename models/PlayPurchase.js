// Compra de assinatura feita dentro do app Android (Fase 6, T5).
//
// POR QUE ESTA COLEÇÃO EXISTE: o comprovante da Play (`purchaseToken`) é um
// texto que o APP entrega ao servidor. O esqueleto anterior
// (routes/mobilePayment.js) validava o comprovante e liberava o Premium sem
// guardar nada, então o MESMO comprovante liberava quantas contas quisessem:
// bastava repetir a chamada com outro login. O índice único de
// `purchaseToken` abaixo é o que fecha essa porta — a segunda conta que
// tentar o mesmo comprovante bate no índice.
//
// Guarda também o que o Google respondeu, porque o aviso de renovação,
// cancelamento e estorno (RTDN) chega com o COMPROVANTE, nunca com o
// usuário: sem esta tabela não há como saber de quem é a assinatura que
// acabou de vencer.
const mongoose = require('mongoose');

const playPurchaseSchema = new mongoose.Schema({
  purchaseToken: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  productId: { type: String, required: true },

  // `subscriptionState` cru da API v2, guardado sem tradução de propósito:
  // quando algo der errado em produção, o valor que o Google mandou é o que
  // responde a pergunta.
  estado: { type: String, default: null },
  expiraEm: { type: Date, default: null },

  // `acknowledgementState`. Compra NÃO confirmada é estornada pelo Google em
  // 3 dias, então `false` aqui é dívida a cobrar, não detalhe de registro.
  confirmada: { type: Boolean, default: false },

  ultimoPedido: { type: String, default: null },

  // Cadeia de troca de plano e reassinatura: a compra nova aponta para a
  // antiga (`linkedPurchaseToken`), que deixa de valer. Sem guardar isso, um
  // upgrade apareceria como duas assinaturas sem relação nenhuma.
  tokenAnterior: { type: String, default: null },
}, { timestamps: true });

module.exports = mongoose.model('PlayPurchase', playPurchaseSchema);

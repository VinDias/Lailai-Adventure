const mongoose = require('mongoose');

// Mensagem privada editor<->ilustrador (Fase 5 Bloco 1). Thread por (canal,
// dono vigente): ownerUserId trava o histórico ao dono atual — na troca de
// dono (PUT /channels/:id admin com ownerEmail) a thread é arquivada por
// arquivarThreadDoCanal abaixo, e uma thread nova nasce para o sucessor sem
// acesso ao histórico privado do antecessor (LGPD). Rotas ficam para a Task 6;
// este model só define o shape e o helper de arquivamento.
const MensagemPortalSchema = new mongoose.Schema({
  canalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel', required: true, index: true },
  ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  autorTipo: { type: String, enum: ['editor', 'ilustrador'], required: true },
  autorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // Aponta a mensagem para uma série/capítulo específico — preenchido
  // automaticamente na devolução da Fila de Aprovação (Task 7); a curadoria
  // do Bloco 3 reutiliza o mesmo par para avisar por obra.
  refTipo: { type: String, enum: ['series', 'episode'], default: null },
  refId: { type: mongoose.Schema.Types.ObjectId, default: null },
  texto: { type: String, required: true, maxlength: 2000 },
  lidaEm: { type: Date, default: null },
  arquivadaEm: { type: Date, default: null },
}, { timestamps: true });

// Arquiva toda a thread ativa (não arquivada) de um canal — chamado na troca
// de dono (PUT /channels/:id admin, branch ownerEmail). `agora` injetável
// para testes determinísticos.
MensagemPortalSchema.statics.arquivarThreadDoCanal = async function (canalId, agora = new Date()) {
  return this.updateMany(
    { canalId, arquivadaEm: null },
    { $set: { arquivadaEm: agora } }
  );
};

module.exports = mongoose.model('MensagemPortal', MensagemPortalSchema);

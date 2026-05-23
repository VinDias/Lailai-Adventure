import React, { useState } from 'react';

interface LegalPolicyProps {
  open: boolean;
  onClose: () => void;
  initialTab?: 'privacy' | 'terms';
}

const DPO_EMAIL = 'privacidade@lorflux.com';
const LAST_UPDATE = '23 de maio de 2026';

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="mb-6">
    <h3 className="text-sm font-black uppercase tracking-widest text-rose-500 mb-2">{title}</h3>
    <div className="text-sm text-zinc-300 leading-relaxed space-y-2">{children}</div>
  </section>
);

const LegalPolicy: React.FC<LegalPolicyProps> = ({ open, onClose, initialTab = 'privacy' }) => {
  const [tab, setTab] = useState<'privacy' | 'terms'>(initialTab);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[6000] bg-black/95 backdrop-blur-xl flex flex-col animate-apple">
      <header className="flex items-center justify-between px-6 py-5 border-b border-white/10 shrink-0">
        <div className="flex gap-2">
          <button
            onClick={() => setTab('privacy')}
            className={`px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${tab === 'privacy' ? 'bg-rose-600 text-white' : 'bg-white/5 text-zinc-400'}`}
          >Privacidade</button>
          <button
            onClick={() => setTab('terms')}
            className={`px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${tab === 'terms' ? 'bg-rose-600 text-white' : 'bg-white/5 text-zinc-400'}`}
          >Termos de Uso</button>
        </div>
        <button onClick={onClose} aria-label="Fechar" className="p-2 rounded-full bg-white/5 text-zinc-400 hover:text-white">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-8 max-w-2xl mx-auto w-full scrollbar-custom">
        {tab === 'privacy' ? (
          <>
            <h2 className="text-2xl font-black text-white mb-1">Política de Privacidade</h2>
            <p className="text-xs text-zinc-500 mb-8">Última atualização: {LAST_UPDATE} — em conformidade com a Lei nº 13.709/2018 (LGPD).</p>

            <Section title="1. Controlador dos dados">
              <p>A plataforma Lorflux ("nós") é a controladora dos seus dados pessoais, responsável pelas decisões sobre o tratamento realizado neste serviço.</p>
            </Section>

            <Section title="2. Encarregado (DPO)">
              <p>Dúvidas, solicitações e exercício de direitos podem ser direcionados ao nosso Encarregado pelo e-mail <a className="text-rose-400 underline" href={`mailto:${DPO_EMAIL}`}>{DPO_EMAIL}</a>.</p>
            </Section>

            <Section title="3. Dados que coletamos">
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Cadastro:</strong> nome, e-mail e senha (armazenada apenas como hash criptográfico).</li>
                <li><strong>Uso:</strong> curtidas/avaliações, canais criados e preferências (tema, idioma).</li>
                <li><strong>Pagamento:</strong> processado pela Stripe; não armazenamos dados de cartão.</li>
                <li><strong>Técnicos:</strong> endereço IP e registro de consentimento, para segurança e cumprimento legal.</li>
                <li><strong>Cookies:</strong> essenciais (sessão) e, mediante consentimento, de publicidade.</li>
              </ul>
            </Section>

            <Section title="4. Finalidades e bases legais">
              <ul className="list-disc pl-5 space-y-1">
                <li>Fornecer e manter a conta e o serviço — <em>execução de contrato</em> (Art. 7º, V).</li>
                <li>Segurança, prevenção a fraudes e cumprimento legal — <em>obrigação legal / legítimo interesse</em> (Art. 7º, II e IX).</li>
                <li>Publicidade e analytics — <em>consentimento</em> (Art. 7º, I), revogável a qualquer momento.</li>
              </ul>
            </Section>

            <Section title="5. Compartilhamento com terceiros">
              <p>Compartilhamos o mínimo necessário com operadores: <strong>Stripe</strong> (pagamentos), <strong>Google AdSense</strong> (publicidade, somente após consentimento), <strong>Bunny.net</strong> (entrega de mídia) e provedor de <strong>e-mail transacional</strong>. Não vendemos seus dados.</p>
            </Section>

            <Section title="6. Transferência internacional">
              <p>Alguns operadores podem processar dados fora do Brasil. Adotamos salvaguardas contratuais compatíveis com a LGPD (Art. 33).</p>
            </Section>

            <Section title="7. Retenção e eliminação">
              <p>Mantemos seus dados enquanto a conta existir. Logs técnicos são retidos por até 30 dias. Ao excluir sua conta, os dados pessoais são eliminados, ressalvadas obrigações legais (Art. 16).</p>
            </Section>

            <Section title="8. Seus direitos (Art. 18)">
              <p>Você pode, a qualquer momento: confirmar a existência de tratamento, acessar e exportar seus dados, corrigir, eliminar, revogar consentimento e solicitar portabilidade. Use a área <strong>Conta &gt; Privacidade</strong> ou contate o Encarregado.</p>
            </Section>

            <Section title="9. Segurança">
              <p>Adotamos medidas técnicas como criptografia de senhas (bcrypt), tokens de sessão em cookies httpOnly, HTTPS, rate-limiting e controle de acesso por função.</p>
            </Section>

            <Section title="10. Crianças e adolescentes">
              <p>O serviço não é destinado a menores de 18 anos sem consentimento dos responsáveis, nos termos do Art. 14 da LGPD.</p>
            </Section>

            <Section title="11. Alterações">
              <p>Esta política pode ser atualizada. Mudanças relevantes serão comunicadas e poderão exigir novo consentimento.</p>
            </Section>
          </>
        ) : (
          <>
            <h2 className="text-2xl font-black text-white mb-1">Termos de Uso</h2>
            <p className="text-xs text-zinc-500 mb-8">Última atualização: {LAST_UPDATE}.</p>

            <Section title="1. Aceitação">
              <p>Ao criar uma conta ou usar a Lorflux, você concorda com estes Termos e com a Política de Privacidade.</p>
            </Section>
            <Section title="2. Conta">
              <p>Você é responsável por manter a confidencialidade da sua senha e por toda atividade na sua conta. Forneça informações verdadeiras.</p>
            </Section>
            <Section title="3. Uso aceitável">
              <p>É proibido usar a plataforma para fins ilícitos, violar direitos de terceiros, tentar burlar mecanismos de segurança ou redistribuir conteúdo sem autorização.</p>
            </Section>
            <Section title="4. Conteúdo e propriedade">
              <p>O conteúdo disponibilizado é protegido por direitos autorais. O acesso é pessoal e intransferível, especialmente o conteúdo premium.</p>
            </Section>
            <Section title="5. Assinatura premium">
              <p>Assinaturas são processadas pela Stripe e renovadas conforme o ciclo contratado. Você pode cancelar a qualquer momento; o acesso permanece até o fim do período pago.</p>
            </Section>
            <Section title="6. Encerramento">
              <p>Podemos suspender contas que violem estes Termos. Você pode encerrar sua conta a qualquer momento em Conta &gt; Privacidade.</p>
            </Section>
            <Section title="7. Contato">
              <p>Dúvidas: <a className="text-rose-400 underline" href={`mailto:${DPO_EMAIL}`}>{DPO_EMAIL}</a>.</p>
            </Section>
          </>
        )}
      </div>
    </div>
  );
};

export default LegalPolicy;

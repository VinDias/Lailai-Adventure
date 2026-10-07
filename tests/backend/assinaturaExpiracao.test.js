/**
 * Testes: expiração de assinatura (Fase 6, T4).
 *
 * Com o Premium barrando conteúdo no servidor, `isPremium: true` com data
 * vencida vira acesso pago de graça. A varredura existe para o caso de o
 * aviso do Stripe ou da Google Play não chegar.
 */
const db = require('../helpers/db');

let User, servico;

beforeAll(async () => {
  await db.connect();
  require('../../server');
  User = require('../../models/User');
  servico = require('../../services/assinaturaExpiracaoService');
});

afterAll(() => db.closeDatabase());

let contador = 0;
async function criarAssinante(overrides = {}) {
  contador += 1;
  return User.create({
    email: `expira-${contador}-${Date.now()}@lorflux.test`,
    passwordHash: 'x',
    nome: 'Assinante',
    isPremium: true,
    ...overrides,
  });
}

const ONTEM = new Date(Date.now() - 24 * 60 * 60 * 1000);
const AMANHA = new Date(Date.now() + 24 * 60 * 60 * 1000);

describe('encerrarAssinaturasVencidas', () => {
  it('desliga quem venceu', async () => {
    const user = await criarAssinante({ premiumExpiresAt: ONTEM });
    await servico.encerrarAssinaturasVencidas();
    expect((await User.findById(user._id).lean()).isPremium).toBe(false);
  });

  it('não toca em quem está em dia', async () => {
    const user = await criarAssinante({ premiumExpiresAt: AMANHA });
    await servico.encerrarAssinaturasVencidas();
    expect((await User.findById(user._id).lean()).isPremium).toBe(true);
  });

  it('não toca em assinatura SEM prazo (anterior ao campo) — desligar tiraria acesso de quem paga', async () => {
    const user = await criarAssinante({ premiumExpiresAt: null });
    await servico.encerrarAssinaturasVencidas();
    expect((await User.findById(user._id).lean()).isPremium).toBe(true);
  });

  it('é idempotente: rodar de novo não conta ninguém e não muda nada', async () => {
    await criarAssinante({ premiumExpiresAt: ONTEM });
    const primeira = await servico.encerrarAssinaturasVencidas();
    expect(primeira).toBeGreaterThan(0);
    expect(await servico.encerrarAssinaturasVencidas()).toBe(0);
  });

  it('a data de corte é a de agora: vencer daqui a um segundo ainda vale', async () => {
    const user = await criarAssinante({ premiumExpiresAt: new Date(Date.now() + 1000) });
    await servico.encerrarAssinaturasVencidas();
    expect((await User.findById(user._id).lean()).isPremium).toBe(true);
  });
});

describe('iniciarVarreduraDeAssinaturas', () => {
  it('em ambiente de teste é no-op: não cria timer (a suíte não pode herdar varredura de hora em hora)', () => {
    servico.iniciarVarreduraDeAssinaturas();
    servico.iniciarVarreduraDeAssinaturas();
    // Sem timer pendurado, parar é inofensivo e o processo do vitest fecha limpo.
    expect(() => servico.pararVarreduraDeAssinaturas()).not.toThrow();
  });
});

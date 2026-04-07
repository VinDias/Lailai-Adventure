# Configuração de E-mail Profissional — Lorflux
> Hostgator (SMTP) + Cloudflare (DNS)

---

## Passo 1 — Obter as chaves no cPanel da Hostgator

1. Acesse o **cPanel** da sua conta Hostgator
2. Vá em **Email Accounts** → crie o endereço `noreply@lorflux.com` (ou o domínio configurado)
3. Anote a senha gerada — ela vai para `SMTP_PASS` no `.env`
4. Vá em **Email Deliverability** (ou *Email Authentication*)
   - Clique em **Manage** no domínio desejado
   - O cPanel exibirá os registros SPF e DKIM prontos para copiar
   - Copie o **valor do registro TXT do DKIM** (começa com `v=DKIM1; k=rsa; p=...`)
   - Anote o **seletor DKIM** (normalmente `default` ou `mail`)

---

## Passo 2 — Configurar registros DNS no Cloudflare

Acesse o **Cloudflare Dashboard** → selecione o domínio → aba **DNS** → **Add record**

### 2.1 Registro MX (roteamento de e-mail)
| Campo | Valor |
|-------|-------|
| Tipo | `MX` |
| Nome | `@` |
| Servidor de e-mail | `mail.hostgator.com` *(confirme no cPanel)* |
| Prioridade | `10` |
| Proxy | **DNS only** (nuvem cinza — obrigatório para MX) |
| TTL | `Auto` |

### 2.2 Registro SPF (autoriza o Hostgator a enviar pelo domínio)
| Campo | Valor |
|-------|-------|
| Tipo | `TXT` |
| Nome | `@` |
| Conteúdo | `v=spf1 include:hostgator.com ~all` |
| Proxy | DNS only |
| TTL | `Auto` |

> Se já existir um registro TXT com `v=spf1` no `@`, **edite-o** ao invés de criar outro — só pode existir um SPF por domínio.

### 2.3 Registro DKIM (assinatura criptográfica)
| Campo | Valor |
|-------|-------|
| Tipo | `TXT` |
| Nome | `default._domainkey` *(use o seletor que aparecer no cPanel)* |
| Conteúdo | Cole o valor completo gerado pelo cPanel (ex: `v=DKIM1; k=rsa; p=MIGf...`) |
| Proxy | DNS only |
| TTL | `Auto` |

### 2.4 Registro DMARC (política de tratamento — recomendado)
| Campo | Valor |
|-------|-------|
| Tipo | `TXT` |
| Nome | `_dmarc` |
| Conteúdo | `v=DMARC1; p=none; rua=mailto:dmarc@lorflux.com` |
| Proxy | DNS only |
| TTL | `Auto` |

> **Estrategia de hardening progressivo:**
> 1. Semana 1-2: `p=none` (monitoramento — recebe relatorios em `rua`)
> 2. Semana 3-4: `p=quarantine; pct=50` (50% dos e-mails falhando vao pra spam)
> 3. Semana 5+: `p=reject` (rejeita 100% dos e-mails sem SPF/DKIM valido)
>
> Verifique os relatorios DMARC enviados para `dmarc@lorflux.com` antes de escalar.

### 2.5 Registro BIMI (opcional — logo no e-mail)
| Campo | Valor |
|-------|-------|
| Tipo | `TXT` |
| Nome | `default._bimi` |
| Conteudo | `v=BIMI1; l=https://www.lorflux.com/icons/icon-512.png` |
| Proxy | DNS only |
| TTL | `Auto` |

> BIMI so funciona com `p=quarantine` ou `p=reject` no DMARC. E opcional mas melhora branding.

---

## Passo 3 — Configurar o `.env` da aplicação

```env
SMTP_HOST=mail.hostgator.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=noreply@lorflux.com
SMTP_PASS=<senha-criada-no-cpanel>
FROM_EMAIL=noreply@lorflux.com
FROM_NAME=Lorflux
```

---

## Passo 4 — Verificar entregabilidade (aguardar propagação DNS: até 24h)

```bash
# Verificar MX
nslookup -type=MX lorflux.com

# Verificar SPF
nslookup -type=TXT lorflux.com

# Verificar DKIM
nslookup -type=TXT default._domainkey.lorflux.com
```

Ou use a ferramenta online: **https://mxtoolbox.com/emailhealth/**

O resultado esperado nos headers de um e-mail enviado:
```
Authentication-Results: ...
  spf=pass
  dkim=pass
  dmarc=pass
```

---

## Uso no código

O serviço está em `services/emailService.js`.

### Templates prontos

```js
const { sendWelcome, sendPremiumConfirmation, sendPasswordReset, sendEmail } = require('./services/emailService');

// Boas-vindas após cadastro
await sendWelcome(user);

// Confirmação de assinatura premium (chamar no webhook do Stripe)
await sendPremiumConfirmation(user);

// Link de redefinição de senha
await sendPasswordReset(user, `https://lorflux.com/reset?token=${token}`);

// E-mail genérico (qualquer template customizado)
await sendEmail({
  to: 'cliente@exemplo.com',
  subject: 'Assunto aqui',
  html: '<p>Conteúdo HTML</p>'
});
```

### Integração sugerida com o Stripe Webhook

Em `routes/payment.js`, dentro do handler `customer.subscription.created` / `invoice.payment_succeeded`:

```js
const { sendPremiumConfirmation } = require('../services/emailService');

// após atualizar user.isPremium = true no banco:
try {
  await sendPremiumConfirmation(user);
} catch (emailErr) {
  logger.warn('[Stripe Webhook] Falha ao enviar e-mail de confirmação:', emailErr.message);
  // não bloqueia o fluxo — o pagamento já foi processado
}
```

---

## Solução de Problemas

| Sintoma | Causa provável | Solução |
|---------|----------------|---------|
| E-mail cai no spam | SPF ou DKIM não configurados | Verificar registros DNS com mxtoolbox |
| `Error: getaddrinfo ENOTFOUND` | `SMTP_HOST` inválido | Confirmar hostname no cPanel |
| `Error: Invalid login` | `SMTP_USER` / `SMTP_PASS` errado | Recriar senha no cPanel → Email Accounts |
| DKIM `fail` mesmo com registro criado | Registro com Proxy ativo no Cloudflare | Desligar proxy (nuvem cinza) nos registros de e-mail |
| Dois registros SPF no mesmo domínio | Conflito de SPF | Mesclar em um único registro TXT |

---

## Verificacao automatizada

Execute o script de verificacao para checar todos os registros DNS de uma vez:

```bash
node scripts/verifyEmailDns.js
```

Saida esperada:
```
[MX]    PASS  mail.hostgator.com (prioridade 10)
[SPF]   PASS  v=spf1 include:hostgator.com ~all
[DKIM]  PASS  v=DKIM1; k=rsa; p=MIGf...
[DMARC] PASS  v=DMARC1; p=none; rua=mailto:dmarc@lorflux.com
Score:  4/4
```

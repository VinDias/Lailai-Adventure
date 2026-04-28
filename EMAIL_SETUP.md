# Configuração de E-mail Profissional — Lorflux
> Hostinger Business Email (SMTP) + Cloudflare (DNS)

---

## Passo 1 — Painel da Hostinger

1. Acesse [hpanel.hostinger.com](https://hpanel.hostinger.com) → **E-mails**
2. No card do domínio (`@lorflux.com`) clique em **Conectar domínio**
3. A Hostinger exibe a tela de configuração com **2 registros MX, 1 SPF, 1 DKIM** prontos para copiar
4. Mantenha essa tela aberta — você vai precisar dos valores no Passo 2

> Os valores costumam ser:
> - MX: `mx1.hostinger.com` (prio 5) e `mx2.hostinger.com` (prio 10)
> - SPF: `v=spf1 include:_spf.mail.hostinger.com ~all`
> - DKIM: seletor `hostingermail1`, valor `v=DKIM1; k=rsa; p=...`
>
> Mas sempre **copie da própria tela da Hostinger** — eles podem rotacionar chaves.

---

## Passo 2 — Configurar registros DNS no Cloudflare

Acesse o **Cloudflare Dashboard** → selecione o domínio → aba **DNS** → **Add record**.
**Importante:** todos os registros de e-mail devem ficar com **Proxy DESLIGADO** (nuvem cinza, "DNS only"). Proxy laranja quebra MX.

### 2.1 Registros MX (roteamento de e-mail)
| Tipo | Nome | Mail server | Prioridade | Proxy | TTL |
|------|------|-------------|------------|-------|-----|
| MX | `@` | `mx1.hostinger.com` | 5 | DNS only | Auto |
| MX | `@` | `mx2.hostinger.com` | 10 | DNS only | Auto |

### 2.2 Registro SPF (autoriza a Hostinger a enviar pelo domínio)
| Campo | Valor |
|-------|-------|
| Tipo | `TXT` |
| Nome | `@` |
| Conteúdo | `v=spf1 include:_spf.mail.hostinger.com ~all` |
| Proxy | DNS only |
| TTL | `Auto` |

> Se já existir um registro `TXT` com `v=spf1` no `@`, **edite-o** ao invés de criar outro — só pode existir um SPF por domínio.

### 2.3 Registro DKIM (assinatura criptográfica)
| Campo | Valor |
|-------|-------|
| Tipo | `TXT` |
| Nome | `hostingermail1._domainkey` *(use o seletor que aparecer no painel Hostinger)* |
| Conteúdo | Cole o valor completo gerado pelo painel (ex: `v=DKIM1; k=rsa; p=MIGf...`) |
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

> **Hardening progressivo:**
> 1. Semanas 1–2: `p=none` (apenas monitora — recebe relatórios em `rua`)
> 2. Semanas 3–4: `p=quarantine; pct=50` (50% dos e-mails reprovados vão pra spam)
> 3. Semana 5+: `p=reject` (rejeita 100% dos e-mails sem SPF/DKIM válido)
>
> Antes de escalar para `quarantine`/`reject`, leia os relatórios DMARC enviados para `dmarc@lorflux.com`.

### 2.5 Registro BIMI (opcional — logo no e-mail)
| Campo | Valor |
|-------|-------|
| Tipo | `TXT` |
| Nome | `default._bimi` |
| Conteúdo | `v=BIMI1; l=https://www.lorflux.com/icons/icon-512.png` |
| Proxy | DNS only |
| TTL | `Auto` |

> BIMI só funciona com `p=quarantine` ou `p=reject` no DMARC. É opcional, mas melhora branding (logo da empresa aparece no Gmail/Apple Mail).

---

## Passo 3 — Voltar ao painel da Hostinger

Depois de salvar todos os registros no Cloudflare:

1. Volta na tela "Conectar domínio" → clica em **Verificar**
2. A propagação pode levar de 5min a algumas horas (raramente até 24h)
3. Quando o status virar "Conectado", abre **Caixas de e-mail** → **Criar caixa**
4. Cria `noreply@lorflux.com` com uma senha forte e anota

---

## Passo 4 — Configurar o `.env` da aplicação

```env
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=noreply@lorflux.com
SMTP_PASS=<senha-criada-no-painel>
FROM_EMAIL=noreply@lorflux.com
FROM_NAME=Lorflux
```

Reinicia a aplicação:
```bash
pm2 restart lorflux-app
```

---

## Passo 5 — Verificar entregabilidade

```bash
# Verificar MX
nslookup -type=MX lorflux.com

# Verificar SPF
nslookup -type=TXT lorflux.com

# Verificar DKIM
nslookup -type=TXT hostingermail1._domainkey.lorflux.com
```

Ou use a ferramenta online: **[mxtoolbox.com/emailhealth](https://mxtoolbox.com/emailhealth/)**.

O resultado esperado nos headers de um e-mail enviado:
```
Authentication-Results: ...
  spf=pass
  dkim=pass
  dmarc=pass
```

---

## Verificação automatizada

Execute o script para checar todos os registros DNS de uma vez:

```bash
node scripts/verifyEmailDns.js
```

Saída esperada:
```
[MX]    PASS  mx1.hostinger.com (prioridade 5)
[SPF]   PASS  v=spf1 include:_spf.mail.hostinger.com ~all
[DKIM]  PASS  v=DKIM1; k=rsa; p=MIGf...
[DMARC] PASS  v=DMARC1; p=none; rua=mailto:dmarc@lorflux.com
Score:  4/4
```

Se você usar um seletor DKIM diferente do padrão `hostingermail1`, passe por argumento:
```bash
node scripts/verifyEmailDns.js lorflux.com hostingermail2
```

---

## Uso no código

O serviço está em `services/emailService.js` (provider-agnóstico — qualquer SMTP funciona).

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

## Solução de problemas

| Sintoma | Causa provável | Solução |
|---------|----------------|---------|
| E-mail cai no spam | SPF ou DKIM não configurados | Verificar registros DNS com mxtoolbox |
| `Error: getaddrinfo ENOTFOUND` | `SMTP_HOST` inválido | Confirmar `smtp.hostinger.com` no .env |
| `Error: Invalid login` | `SMTP_USER` / `SMTP_PASS` errados | Recriar senha no painel Hostinger → Caixas de e-mail |
| DKIM `fail` mesmo com registro criado | Proxy ativo no Cloudflare | Desligar proxy (nuvem cinza) nos registros de e-mail |
| Dois registros SPF no mesmo domínio | Conflito de SPF | Mesclar em um único registro TXT |
| Hostinger reclama de "domínio não conectado" | DNS ainda propagando | Aguardar até 24h e clicar em "Verificar" novamente |

---

## Migração de outro provedor (Hostgator → Hostinger, etc.)

Se você está migrando de outro provedor:
1. **Não delete a caixa antiga** até confirmar que a nova está recebendo
2. No Cloudflare, atualize os 4 registros (MX, SPF, DKIM, DMARC) **de uma vez** — não fica em estado intermediário
3. Aguarde a propagação (até 24h) antes de descontinuar o provedor antigo
4. O `services/emailService.js` é provider-agnóstico — só o `.env` muda

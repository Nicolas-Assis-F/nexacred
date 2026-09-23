# NexaCred — Brief de continuidade (Codex)

> **Como usar este documento:** você (Codex) vai continuar o desenvolvimento do NexaCred,
> um sistema de gestão de leads e campanhas de **crédito consignado**. Leia primeiro
> `README.md` (raiz) — é a fonte de verdade sobre arquitetura, segurança e fluxo. Depois
> execute as épicas deste brief **na ordem sugerida**, respeitando as **Regras invioláveis**.
> Foco principal desta fase: **qualidade visual/UX profissional**, uma **landing page**, um
> **fluxo de WhatsApp com menos cliques** e a habilitação de **disparo real de mensagens**
> (com todas as travas de compliance).

---

## 1. Contexto do produto

NexaCred é operado por uma empresa de crédito consignado. O sistema importa bases de
servidores (planilhas `.xlsb` gigantes), normaliza e protege PII (CPF/telefone/e-mail),
segmenta, dispara campanhas e gerencia conversas — tudo com forte postura de **LGPD e
compliance**. Hoje as campanhas usam um provider **mock**; existe um **laboratório WhatsApp
(Baileys)** para testes manuais.

**Stack:** Monorepo pnpm. Backend NestJS (`apps/api`), frontend Next.js 15 + React 19 +
Tailwind v4 + shadcn/Radix (`apps/web`), Postgres + Prisma (`packages/database`),
Redis + BullMQ, importer Python/pyxlsb (`workers/importer`), sender TS (`workers/sender`),
lab WhatsApp Baileys (`workers/whatsapp`), MinIO/S3, tudo em Docker Compose.

**Estado atual (já pronto e funcionando):**
- Importação XLSB streaming (linha a linha, lotes, checkpoints) — validada.
- Dashboard de analytics com métricas reais, gráfico de 30 dias, funil de conversas e sinais de compliance.
- Telas: Importações (wizard 3 passos), Leads, Segmentos, Campanhas, Templates, Conversas (inbox), Supressões, Usuários, Auditoria, Configurações, Laboratório WhatsApp.
- Design light com tema teal, `AppShell` com sidebar agrupada, componentes em `apps/web/components/ui.tsx` e `resource.tsx`.
- Laboratório WhatsApp com Baileys: conecta por QR e envia **mensagem de teste customizável** só para números em allowlist, com consentimento, limites e opt-out.
- Seed de dados de demonstração (`SEED_DEMO=true`) popula ~30 dias de atividade.

---

## 2. Regras invioláveis (NÃO quebrar)

1. **ComplianceGate antes de todo envio.** Nenhum provider (mock, SMS, e-mail, WhatsApp) pode
   ser chamado sem passar por `packages/compliance` → `ComplianceService.canSend(...)`. Vale
   inclusive para resposta manual e para disparo real. Reavalie o gate **imediatamente antes
   de cada chamada** ao provider.
2. **PII protegida.** Nunca exponha CPF completo por padrão, nunca escreva CPF/telefone
   completos em logs, URLs, métricas ou payloads para serviços externos/LLM. CPF é
   `cpfEncrypted` (AES-GCM) + `cpfHash` (HMAC-SHA256) + `cpfLast4`. Contatos idem.
3. **TypeScript strict.** `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
   estão ligados. **Proibido usar `any`** para silenciar erro. Sem TODOs em feature crítica.
4. **Disciplina de qualidade.** Após cada etapa rode: `pnpm typecheck`, `pnpm lint`,
   `pnpm test`. Corrija tudo antes de avançar. Não faça mock onde deve haver persistência real
   (exceto o `MockMessagingProvider`).
5. **Gotcha do Docker (importante).** Os containers em execução ficam desatualizados em
   relação ao disco. **Sempre** rode `docker compose up -d --build` (ou `make rebuild`) e valide
   no navegador antes de considerar pronto. Não confie no que já está no ar.
6. **Portas.** Postgres (5432) e Redis (6379) **não** são publicados no host (a máquina de dev
   já tem serviços locais nessas portas). Serviços falam pela rede interna (`postgres:5432`,
   `redis:6379`). Não republique essas portas.
7. **Segredos.** Nada de secret no repositório. `.env` é gitignored. Use `.env.example`.
8. **Idioma.** Toda UI em **pt-BR**. Datas/números em `America/Sao_Paulo` / `pt-BR`.
9. **RBAC.** Ações sensíveis dependem de perfil (ADMIN, MANAGER, OPERATOR, COMPLIANCE, VIEWER)
   e geram `AuditLog`. Ver `apps/api/src/common/rbac.ts` e `packages/shared/src/permissions.ts`.

---

## 3. Como rodar e validar

```bash
cp .env.example .env      # se ainda não existir
make start                # docker compose up --build -d
# Painel:  http://localhost:3000
# API/Swagger: http://localhost:3001/docs
# Login:   admin@nexacred.local / DevOnly-ChangeMe123!
make rebuild              # após mudar código
make logs                 # acompanhar
make reset                # APAGA dados e sobe do zero (cuidado)
```

Testes: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e` (Playwright, exige stack no ar).
WhatsApp lab: preencha `WHATSAPP_TEST_NUMBERS=+55DDDNUMERO` no `.env` e rode `make whatsapp`.

---

## 4. Mapa de arquivos (onde mexer)

```
apps/web/app/                 páginas (page.tsx = dashboard; login, imports, leads, segments,
                              campaigns, templates, conversations, suppressions, users, audit,
                              settings, testing = laboratório WhatsApp)
apps/web/app/globals.css      tema/tokens globais (Tailwind v4 @import)
apps/web/components/          app-shell.tsx (layout+sidebar), ui.tsx (Button/Card/Input/Badge),
                              resource.tsx (Title/DataTable/CreateForm/Field/Select),
                              status.tsx (badges), chart.tsx, page-header.tsx
apps/web/lib/                 api.ts, client.ts (proxy de sessão HttpOnly), utils.ts
apps/api/src/                 módulos Nest (auth, imports, leads, segments, campaigns,
                              conversations, suppressions, testing, webhooks, dashboard,
                              users, audit, common, health)
packages/messaging/src/       interfaces/messaging-provider.ts  ← PORT de providers
                              providers/{mock,sms,email}         ← implementações
packages/compliance/src/      ComplianceService (gate) — NÃO burlar
packages/shared/src/          crypto (AES/HMAC), normalization, domain (bot/opt-out), schemas
packages/database/prisma/     schema.prisma, migrations, seed.ts
workers/sender/src/           preparação de campanha, envio, webhooks, reconciliação
workers/whatsapp/src/         index.ts (lab Baileys: connect/send/QR), policy.ts (canTest)
docker-compose.yml  Makefile  infraestrutura
```

---

## 5. Direção de design (obrigatória — mantenha coeso)

**Marca / paleta atual** (mantenha e formalize como design tokens):
- Teal escuro (sidebar/hero): `#142b30`; superfícies escuras: `#163c38`.
- Verde-menta de destaque: `#b7f7d5` / `#c4f7df`.
- Primário de ação: `teal-700`; sucesso: emerald; alerta: amber; erro: red; neutro: slate.
- Fonte: Inter. Cantos arredondados (12–16px). Sombra sutil. Números tabulares.
- Estética alvo: **fintech B2B profissional** (pense Linear/Stripe/Ramp), limpo, muito
  espaçamento, tipografia forte, microinterações discretas. Nada de "template genérico".

**Design system:**
- Crie tokens de cor em `globals.css` (CSS variables) e suporte **dark mode** (`next-themes` ou
  data-attribute). Redefina tokens no dark. Hoje o app é só light — adicionar dark é um plus.
- Consolide os componentes em um kit shadcn/ui coeso (Button, Card, Input, Select, Dialog,
  DropdownMenu, Tabs, Tooltip, Toast, Badge, Table, Sheet, Skeleton, Progress, Avatar). O
  projeto já tem Radix (`@radix-ui/*`) e `class-variance-authority` — padronize em cima disso.
- Atenção: o projeto usa **Tailwind v4** (`@tailwindcss/postcss`), sem `tailwind.config.js` no
  padrão v3. Ao trazer componentes shadcn/21st.dev, adapte os tokens/variáveis para v4.

**Bibliotecas sugeridas (use com bom senso, sem inchar demais):**
- **21st.dev** (https://21st.dev) — registro de componentes React/Tailwind/shadcn. Use para
  fontes de **hero sections, bento grids, feature sections, pricing, testimonials, navbars,
  marquees, backgrounds animados, cards animados**. Copie o componente, **adapte à paleta
  NexaCred e traduza para pt-BR**. Prefira instalar via shadcn CLI/registry quando possível.
- **motion / framer-motion** — microinterações e transições (respeite `prefers-reduced-motion`).
- **sonner** — toasts (substituir alerts espalhados).
- **cmdk** — command palette (⌘K) para navegação rápida.
- **@tanstack/react-table** + **@tanstack/react-query** — tabelas server-side ricas e cache.
- **react-hook-form** + **zod** — formulários (o projeto já usa zod em `packages/shared`).
- **recharts** — já em uso no dashboard; mantenha para gráficos.
- **lucide-react** — ícones (já em uso).
Evite: libs pesadas de UI que conflitem com Tailwind/shadcn (MUI, Chakra). Mantenha bundle sob controle.

---

## 6. Épicas (com tarefas e critérios de aceite)

### EPIC A — Landing Page profissional (pré-login) 🎯 prioridade alta
Criar uma LP pública de marketing em `apps/web/app/(marketing)/page.tsx` (ou rota `/`
redirecionando logados para `/dashboard`). Conteúdo: navbar, hero forte com CTA
("Entrar" / "Falar com vendas"), seção de recursos (importação em massa, compliance/LGPD,
campanhas multicanal, WhatsApp, analytics), prova social/estatísticas, seção de segurança
(criptografia, opt-out, auditoria), FAQ, footer.
- Use componentes do 21st.dev adaptados à paleta. Animações discretas (motion).
- Responsiva (mobile-first), acessível, pt-BR, SEO básico (metadata, Open Graph).
- Não expor nada sensível; é página pública.
- **Aceite:** LP no ar em `/`, botão leva ao `/login`; usuário logado vai direto ao painel;
  Lighthouse ≥ 90 em Perf/Best Practices/SEO; sem erro de typecheck/lint.

### EPIC B — Overhaul visual do painel (design system) 🎯 prioridade alta
Elevar todas as telas ao mesmo nível das melhores (dashboard/imports). Hoje algumas telas
(leads, segments, templates, users, suppressions, audit, settings) usam componentes genéricos
em `resource.tsx`.
- Padronizar tokens, tipografia, espaçamentos, estados vazios, skeletons de carregamento,
  toasts de sucesso/erro (sonner), foco/acessibilidade.
- Tabelas ricas com `@tanstack/react-table` (ordenação, colunas, densidade), mantendo
  paginação server-side já existente na API.
- Adicionar **dark mode** com toggle no header.
- Command palette (⌘K) para navegar entre telas e buscar leads.
- **Aceite:** todas as telas visualmente coesas; dark mode funcional; nenhuma regressão de
  dados; typecheck/lint/test verdes; validado no navegador após `make rebuild`.

### EPIC C — Fluxo WhatsApp com menos cliques + QR melhor 🎯 prioridade alta
Arquivo-chave: `apps/web/app/testing/page.tsx` + `workers/whatsapp/src/index.ts` +
`apps/api/src/testing/testing.controller.ts`.
- **Menos cliques:** ao abrir o Laboratório desconectado, iniciar conexão automaticamente (ou
  1 clique grande). Status em tempo real (SSE ou polling curto) com etapas visuais
  (Conectando → QR → Pareado → Pronto).
- **QR melhor:** atualização automática quando expira (hoje expira em ~45s e exige reconectar
  manual); QR maior, com contador e reload transparente; instrução visual de "Aparelhos
  conectados".
- Persistir sessão para evitar reparear a cada uso; reconexão automática robusta.
- Enviar mensagem em 1 passo (número já selecionado por padrão quando só há 1; consentimento
  lembrado por sessão de teste).
- **Aceite:** conectar e enviar um teste em ≤ 2 cliques; QR se renova sozinho; histórico de
  status (enviado/entregue/lido) claro; guardrails do lab mantidos.

### EPIC D — Disparo real de mensagens (WhatsApp) ⚠️ compliance-crítico
Objetivo do cliente: usar o sistema para **disparo real** de campanhas via WhatsApp — mas com
todas as travas. **Não** transforme o lab em canhão de spam.
- Implementar um **`BaileysMessagingProvider`** em `packages/messaging/src/providers/whatsapp/`
  conforme a interface `MessagingProvider` (`send`, `parseWebhook`, validação de assinatura/status).
- Integrar ao **worker sender** (`workers/sender`) como opção de canal, registrado no ponto de
  composição — **nunca** seleção arbitrária pelo frontend.
- **Toda mensagem passa pelo `ComplianceService`**: consentimento específico para canal
  WhatsApp/finalidade `CREDIT_MARKETING`, supressão global, janela de horário, limites por
  hora/dia, frequência, destinatário não repetido, opt-out.
- Materializar `CampaignRecipient` (congelar público), IDs idempotentes, retry só em erro
  transitório, backoff exponencial, pausar sem apagar jobs, workers idempotentes.
- **Opt-in real:** só disparar para contatos com consentimento comprovado (`Consent` GRANTED).
  Respostas de opt-out (`SAIR/PARAR/...`) → `Suppression` imediata (lógica já em
  `packages/shared` domain/bot).
- Confirmação explícita de usuário autorizado (MANAGER/ADMIN) antes de RUNNING; tudo em `AuditLog`.
- Rate limiting compatível com risco de bloqueio do WhatsApp; começar conservador; documentar
  no README que Baileys é não-oficial e sujeito a restrições de conta.
- **Aceite:** uma campanha WhatsApp real, restrita a contatos consentidos, dispara via fila
  passando pelo gate; opt-out bloqueia na hora; preview mostra elegíveis vs bloqueados;
  auditoria completa; testes cobrindo gate, idempotência, opt-out, limites.

### EPIC E — Extras / "coloque mais coisas" (inspire-se)
Priorize os que agregam valor real ao operador:
- **Onboarding/checklist** na primeira sessão (importar base → consentir → segmentar → campanha).
- **Exportação** (CSV/Excel) com RBAC e auditoria (sem CPF completo salvo permissão específica).
- **Bulk actions** em Leads/Conversas (bloquear, atribuir, mudar status em lote).
- **Saved views/filtros** em Leads e Conversas.
- **Notificações** (nova resposta, opt-out, campanha concluída) — toasts + centro de notificações.
- **Detalhe do Lead** rico (timeline: importações, consentimentos, mensagens, supressões).
- **Templates** com editor melhor (variáveis `{{nome}}`, preview por canal, contador).
- **Métricas de campanha** por campanha (funil de entrega/resposta, custo por resposta mock).
- **Healthchecks/observabilidade** na UI (status dos workers, filas BullMQ).
- **i18n-ready** e acessibilidade (WCAG AA: foco, contraste, aria, teclado).

### EPIC F — Higiene técnica
- Incluir `fixtures/` na imagem do importer (testes de streaming falham no container por falta
  do arquivo — `infrastructure/Dockerfile.importer`).
- Cobrir com testes: novo provider, fluxo de disparo, componentes críticos.
- Atualizar `README.md` e `docs/validation.md` a cada entrega.

---

## 7. Ordem sugerida

1. **EPIC C** (fluxo WhatsApp com menos cliques) — rápido e alto impacto para os testes de hoje.
2. **EPIC A** (Landing Page) — vitrine profissional.
3. **EPIC B** (overhaul visual + dark mode + design system).
4. **EPIC D** (disparo real — o mais sensível; só depois do design estável e com testes fortes).
5. **EPIC E/F** (extras + higiene) — incrementalmente.

## 8. Definition of Done (por entrega)
- `pnpm typecheck` + `pnpm lint` + `pnpm test` verdes; sem `any` para mascarar erro.
- `make rebuild` e **validação visual no navegador** (não confie no build antigo).
- Sem regressão de dados nem de compliance; PII protegida; auditoria registrada.
- README/validation atualizados; textos em pt-BR; responsivo e acessível.

## 9. Não faça
- Não burle o ComplianceGate nem envie sem consentimento.
- Não logue/serialize CPF ou telefone completos; não mande PII para LLM/serviços externos.
- Não publique portas de Postgres/Redis no host; não comite `.env`/segredos.
- Não use `any` para calar o TypeScript; não deixe feature crítica com mock ou TODO.
```

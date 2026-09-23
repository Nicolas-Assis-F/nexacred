# NexaCred

Gestão de leads, importação XLSB, campanhas e atendimento com NestJS, Next.js, PostgreSQL, Prisma, Redis/BullMQ e Python. Dashboard de analytics com métricas reais, filtros de período, funil de conversas e interface responsiva. WhatsApp usa Baileys para testes manuais, campanhas e respostas na inbox. SMS/e-mail continuam simulados. A página pública fica em `/`; após login o painel abre em `/dashboard`.

## Executar em desenvolvimento

Requisitos: Docker Engine com Compose v2, 6 GB de RAM livres recomendados e espaço para a planilha descompactada. No Ubuntu, use o plugin `docker compose`.

```bash
git clone https://github.com/Nicolas-Assis-F/nexacred.git
cd nexacred
cp .env.example .env
make start          # sobe tudo em segundo plano (equivale a: docker compose up --build -d)
```

Sem `make`? Use `cp .env.example .env && docker compose up --build`. Rode `make help` para ver todos os atalhos (`start`, `stop`, `logs`, `rebuild`, `reset`, `whatsapp`).

- Painel: http://localhost:3000
- API / Swagger: http://localhost:3001/docs
- MinIO: http://localhost:9001
- Login inicial: `admin@nexacred.local` / `DevOnly-ChangeMe123!`

O seed de desenvolvimento popula leads, uma campanha e ~30 dias de atividade fictícia (mensagens, respostas, opt-outs e funil de conversas) para o dashboard não nascer vazio. Nada disso inicia envio real.

O serviço `secrets` gera chaves aleatórias no primeiro boot; elas ficam no volume `runtime_secrets`. Não apague esse volume: os dados antigos não poderão ser descriptografados sem a chave. Valores explícitos de chaves no ambiente têm precedência. O exemplo `.env` contém apenas credenciais públicas de desenvolvimento. Não publique essa instalação sem trocar credenciais, configurar TLS e desativar o seed.

O Compose espera PostgreSQL, MinIO e Redis, aplica migrations versionadas e executa seed idempotente. O seed cria somente dados fictícios, sem iniciar campanhas. A planilha do usuário não faz parte do repositório.

## Primeiro fluxo

1. Entre no painel e importe uma `.xlsb`. Selecione o arquivo, informe a aba ou deixe vazio para a primeira e ajuste os campos visuais de mapeamento. CPF e nome são obrigatórios. Acompanhe upload e processamento; erros aparecem por linha. Importações que falharam podem ser retomadas enquanto o arquivo estiver retido no MinIO.
2. Abra **Leads**, selecione uma pessoa e registre consentimento, data real, origem e referência da prova. Importação **não cria consentimento**.
3. Crie um segmento e um template com o mesmo canal da campanha. `{{nome}}` é a variável permitida.
4. Crie a campanha, veja o preview, aprove e confirme explicitamente o início. Use janela 0–24 para testar a qualquer hora. Janelas normais usam `America/Sao_Paulo`.
5. O sender materializa destinatários e revalida elegibilidade: WhatsApp é enviado pelo aparelho conectado; SMS/e-mail são simulados. Acesse **Conversas**, selecione o contato e simule `SIM` ou `SAIR`.
6. `SAIR`, `PARAR`, `CANCELAR`, `REMOVER` e `NÃO QUERO` registram supressão. Reimportar a pessoa não desfaz o bloqueio. Opt-outs não são removidos pelo painel.

Há uma fixture sintética de 1.306 colunas em `fixtures/leads-synthetic.xlsb` para validar mapeamento, duplicação e linha inválida. É uma fixture mínima do parser, não um catálogo comercial.

## Estrutura

```text
apps/api              REST, autenticação, RBAC, upload, auditoria
apps/web              painel Next.js e proxy de sessão HttpOnly
workers/importer      Python, XLSB incremental, lotes e checkpoints
workers/sender        preparação, envio WhatsApp/mock, webhooks, reconciliação
workers/whatsapp      ponte Baileys, QR, sessão e registro durável de envios
packages/database     schema, migrations, seed e consultas de domínio
packages/shared       normalização, AES-GCM, HMAC, regras do bot
packages/compliance   gate independente, sem acesso a fornecedor
packages/messaging    port de providers e implementações Baileys/mock
infrastructure        imagens Docker e inicialização
```

```mermaid
flowchart TD
  Web["Painel Next.js"] --> API["API NestJS"]
  API --> DB["PostgreSQL"]
  API --> S3["MinIO / S3"]
  API --> Queue["Redis / BullMQ"]
  Queue --> Importer["Importer Python"]
  S3 --> Importer
  Importer --> DB
  Queue --> Sender["Sender e webhooks"]
  Sender --> Gate["ComplianceGate"]
  Gate --> Provider["Baileys para WhatsApp / mock para SMS e e-mail"]
  Sender --> DB
  Sender --> Chatwoot["Chatwoot opcional: notas"]
```

## Importação e dados pessoais

Upload em disco temporário e streaming para MinIO: o request não carrega o arquivo inteiro na memória. O processamento é assíncrono. O adaptador `StreamingWorkbook` usa o parser BIFF12 do pyxlsb, copia partes ZIP em blocos de 1 MB e mantém shared strings em SQLite temporário. Evita o `open_workbook()` original do pyxlsb 1.0.10, que lê partes inteiras em memória.

Batches de 500–2.000 linhas; dados, erros e progresso confirmados na mesma transação. Após interrupção, o job retoma pelo checkpoint. A releitura até o checkpoint custa I/O, mas não duplica os dados. Advisory lock protege importações concorrentes do mesmo ID. O total definitivo só é conhecido ao final. Cabeçalhos são lidos por nome; IDs de coluna não são fixos. O arquivo ZIP tem limite de tamanho descompactado configurável.

CPF validado, cifrado AES-256-GCM, HMAC-SHA256 para identidade e quatro dígitos para máscara. Contatos são cifrados e deduplicados por HMAC; não há coluna de telefone/e-mail normalizado em plaintext. A política atual de reimportação atualiza dados operacionais, preserva status, consentimentos e supressões e registra `LeadSource`. `IMPORT_UPDATE_POLICY=preserve` pode preservar os dados existentes; padrão `replace`.

Arquivos temporários locais são removidos ao terminar. Retenção de objetos usa lifecycle MinIO: padrão 7 dias; valor zero remove após importação. O ciclo do MinIO não é exclusão imediata no segundo exato. Arquivos criptografados, backups e chaves precisam ter retenção e acesso próprios em produção.

## Campanhas, filas e idempotência

Filas: `import-processing`, `campaign-preparation`, `message-send`, `webhook-processing`. O banco conserva o estado de mensagens, destinatários e eventos; o sender reconcilia trabalho pendente a cada 3 segundos. Os jobs usam IDs estáveis, tentativas e backoff exponencial. IDs de job não contêm dois-pontos.

O público é materializado em páginas de 500 e fica congelado após a preparação. Há UNIQUE por campanha/contato e campanha/hash de contato. O mesmo contato compartilhado por pessoas distintas recebe uma única mensagem por campanha. A primeira aprovação estabelece o limite temporal de inclusão de leads; não se incluem leads criados depois dela.

O gate é reavaliado imediatamente antes de **cada** chamada ao provider, inclusive resposta manual: pessoa ativa, contato válido, consentimento específico para canal/finalidade `CREDIT_MARKETING`, supressão global, status, datas, horário, frequência e quotas. Esta instalação exige consentimento. O consentimento mais recente aplicável decide autorização; uma revogação não é vencida por um registro antigo.

Um advisory lock no PostgreSQL serializa decisões de envio e processamento de opt-out entre réplicas. Limites usam janelas móveis de 1 e 24 horas; frequência padrão de 24h entre campanhas. Pausa, horários e quotas adiam jobs sem consumir tentativas. Cancelamento bloqueia jobs pendentes. O mock usa IDs determinísticos entre reinicializações. Eventos atrasados não rebaixam uma entrega confirmada; webhooks são únicos por provider/eventId e aplicados atomicamente.

**Limite deliberado:** serialização prioriza consistência em vez de alto throughput. Fornecedor real exige idempotência remota e reconciliação de resultado incerto antes de aumentar concorrência. A garantia do mock não equivale a exactly-once em uma rede externa.

## WhatsApp: conectar e enviar sem números no ambiente

1. Entre como ADMIN e abra **Central WhatsApp** (`/testing`). Clique em **Conectar WhatsApp**.
2. No celular: WhatsApp → Aparelhos conectados → Conectar aparelho. Escaneie o QR, que é renovado automaticamente.
3. Digite o telefone com DDD, escreva a mensagem e confirme a autorização do destinatário. Clique em **Enviar mensagem de teste**.

Não precisa configurar Meta, token comercial ou cadastrar destinatários no `.env`. `WHATSAPP_TEST_NUMBERS` é opcional e legado; a tela usa o telefone informado no formulário. O servidor normaliza o número e consulta seu JID no WhatsApp, evitando enviar para uma identidade incorreta quando o número brasileiro usa uma representação diferente no serviço.

A sessão persiste no volume `whatsapp_session`; reiniciar o serviço restaura a conexão automaticamente. Quedas temporárias usam reconexão com espera progressiva; logout ou sessão aberta em outro serviço exigem ação do operador. O QR tem 320 px, contador e renovação automática. O laboratório requer ADMIN e limita testes a 5/h e 20/dia. Consentimento de teste não cria autorização de marketing. Supressões globais do banco e pedidos de saída recebidos pelo aparelho bloqueiam testes.

### Campanhas e atendimento reais

- Em **Leads**, registre consentimento específico para **WhatsApp**, finalidade `CREDIT_MARKETING`, data, origem e prova. Consentimento de SMS não autoriza WhatsApp.
- Em **Templates**, crie uma mensagem com canal WhatsApp. Use `{{nome}}`; a instrução de saída é adicionada automaticamente se ausente.
- Em **Campanhas**, selecione WhatsApp, segmento e template compatíveis. Revise elegíveis/bloqueados, aprove e confirme o envio real (ADMIN/MANAGER). O início exige aparelho conectado.
- A fila reavalia `ComplianceService` antes de cada chamada: lead/contato ativo, consentimento, supressões, janela em Brasília, limites e frequência. Não há escolha livre de provider pelo navegador.
- A ponte aplica ainda limite global conservador de 20 tentativas/h e 100/dia para campanhas/atendimento, contando testes nesse total. As quotas da campanha podem ser menores. Sem conexão ou com quota esgotada, a fila aguarda sem consumir tentativas. Pausar mantém os jobs; cancelar impede novos envios.
- Respostas reais aparecem em **Conversas**. `SAIR`, `PARAR` e demais expressões de opt-out bloqueiam imediatamente o número na ponte e são sincronizadas para supressão global e revogação no banco. Respostas manuais passam pelo mesmo gate.

### Entrega, idempotência e resultado incerto

O ID remoto deriva do destinatário materializado (ou da mensagem manual); não depende do ID de um job ou de uma transação que pode falhar. Antes de chamar Baileys, a ponte grava a tentativa no disco. Repetir o mesmo ID consulta a tentativa existente e rejeita troca de destinatário/conteúdo. Uma tentativa pendente na reinicialização vira **sem confirmação**; não há reenvio cego.

**Enviado** significa aceite do cliente; **Entregue/Lido** dependem dos recibos reais. Não se fabricam eventos de entrega no WhatsApp. Um timeout após o início do transporte gera `RESULT_UNCERTAIN`, sem retry automático, e pode ser reconciliado por um recibo posterior. Confira o aparelho antes de liberar uma nova tentativa na Central. Não há promessa de exactly-once remota.

Eventos de entrada/entrega ficam em uma outbox cifrada e persistente. O sender verifica HMAC, grava no banco com chave única e só então confirma o recebimento. Grupos e broadcasts são ignorados; LIDs são resolvidos quando o WhatsApp fornece mapeamento de telefone. Mensagens sem telefone resolvível não podem ser atribuídas automaticamente.

O volume contém credenciais e tentativas com telefone/texto cifrados. Não compartilhe nem apague esse volume em operação. Use apenas **uma instância** da ponte por sessão. Logs de protocolo e dumps de sessão do libsignal são silenciados; o log operacional usa somente eventos seguros. O serviço não expõe porta pública.

Baileys 7.0.0-rc14 é uma integração **não oficial**, sujeita a desconexões e restrições de conta. Esta instalação é de uma única organização; não substitui infraestrutura distribuída nem um provedor oficial. Referência técnica: [WhiskeySockets/Baileys](https://github.com/WhiskeySockets/Baileys).

## Interface

Página pública responsiva, painel em `/dashboard`, fonte Inter local, paleta teal/menta, tema claro/escuro persistente, atalhos `Ctrl/⌘ K` para navegação/busca de leads, tabelas com ordenação da página atual e densidade ajustável, estados vazios e notificações. As estatísticas da página pública são **ilustrativas**, identificadas como exemplo; o painel usa dados da API. A paginação de leads continua no servidor.

## Conversas e Chatwoot

A inbox local permite histórico, atribuição, nota, status, resposta WhatsApp real ou simulação de SMS/e-mail e bloqueio. O bot usa regras determinísticas; registra uma sugestão para o operador na nota. Não envia respostas automáticas nem aprova crédito, calcula score, define taxas ou promete aprovação.

Chatwoot é opcional e utiliza uma instalação existente:

1. Crie uma inbox do tipo **API** no Chatwoot.
2. Configure `CHATWOOT_ENABLED=true`, `CHATWOOT_URL`, `CHATWOOT_ACCOUNT_ID`, `CHATWOOT_INBOX_ID` e `CHATWOOT_API_TOKEN` no `.env`.
3. Recrie o sender: `docker compose up -d --force-recreate sender`.
4. Abra o Chatwoot por **Configurações**. Conversas novas serão associadas a contatos pseudônimos e mensagens serão espelhadas como **notas privadas**.

Não são enviados CPF cadastral, telefone, e-mail, margem ou score ao Chatwoot. Textos livres passam por remoção de sequências numéricas longas e e-mails antes da sincronização; isso não substitui revisão de privacidade. A sincronização é unidirecional: responda pelo NexaCred. Respostas digitadas no Chatwoot **não** disparam mensagens. Notas podem se repetir se o processo cair entre confirmação remota e checkpoint local. Não foi validado contra uma conta real sem credenciais; o adaptador segue as APIs oficiais de contatos, conversas e mensagens.

Referências: https://developers.chatwoot.com/api-reference/contacts/create-contact · https://developers.chatwoot.com/api-reference/conversations/create-new-conversation · https://developers.chatwoot.com/api-reference/messages/create-new-message

## Segurança e permissões

| Perfil | Ações adicionais |
|---|---|
| ADMIN | Todas as ações |
| MANAGER | Importar, segmentos, templates, campanhas, atendimento |
| OPERATOR | Atendimento |
| COMPLIANCE | PII autorizada, consentimentos, supressões, auditoria |
| VIEWER | Consultas sem PII completa |

JWT expira em 8h e verifica usuário ativo/perfil atual no banco. O browser usa cookie HttpOnly; o proxy verifica Origin em mutações. A API aceita Bearer e não autentica por cookie. Senhas usam Argon2; login tem limite de 5 tentativas/minuto/IP, a API tem throttling, Helmet e validação. Chaves não são devolvidas pela API. Webhooks mock exigem `x-webhook-secret`; simulação no painel exige perfil de atendimento. Payload bruto é armazenado cifrado. Auditoria não possui endpoints de edição/exclusão.

Antes de produção: trocar credenciais, TLS e `COOKIE_SECURE=true`, desativar seed, configurar proxy confiável/rate limiting distribuído, backup com teste de restauração, chaves em KMS através de `CryptoPort`, retenção de mensagens/PII, revisão de permissões e contratos de canais. Compose é ambiente de desenvolvimento de uma única organização, não multi-tenant.

## Desenvolvimento e testes

Node 24, pnpm 10.17.1, Python 3.13. Dependências Node estão travadas no lockfile.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm db:generate
pnpm -r --filter '!@nexacred/web' build
pnpm typecheck
pnpm lint
pnpm test
python -m venv .venv
.venv/bin/pip install -r workers/importer/requirements.txt
PYTHONPATH=workers/importer .venv/bin/pytest workers/importer/tests -q
pnpm build
```

E2E exige Compose em execução:

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

O E2E usa banco real, filas reais, MinIO, importador Python e provider mock: upload → deduplicação → consentimento → segmento → campanha → entrega → resposta → opt-out → reimportação sem reativação. O GitHub Actions executa lint, tipos, unitários, build Docker e Playwright. Resultados de execução estão em `docs/validation.md`; a existência de testes não significa que todos já foram executados com sucesso.

Migrations:

```bash
# Desenvolvimento, após editar schema:
pnpm --filter @nexacred/database migrate
# Aplicar migrations versionadas:
docker compose run --rm migrate
# Inspecionar serviços:
docker compose ps
docker compose logs -f api importer sender
```

## Novo MessagingProvider

Implemente `MessagingProvider` em `packages/messaging`: `send`, `parseWebhook` e validação de assinatura. Interfaces SMS/e-mail são contratos, não integrações habilitadas. Avalie autorização contratual do canal para o produto antes de conectar. Use ID idempotente persistido; distinga erros permanentes/transitórios; valide assinatura sobre bytes originais quando exigido; nunca contorne o gate. O registro do provider deve ocorrer no ponto de composição do worker. Não existe seleção arbitrária de fornecedor pelo frontend.

## Escopo atual

Não há exportação em massa, recuperação de senha, multiempresa, atribuição automática por equipe, edição de campanha aprovada nem múltiplos aparelhos WhatsApp simultâneos. A Central compartilha a sessão com campanhas e atendimento. A interface permite janelas por hora; `startAt`/`endAt` também existem na API. O Chatwoot não é instalado pelo Compose. O serviço não é um mecanismo de decisão de crédito. Antes de usar dados reais, valide o fluxo integrado, capacidade e restauração no seu ambiente.

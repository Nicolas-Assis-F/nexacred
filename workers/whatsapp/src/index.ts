import { createServer } from 'node:http';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  type WASocket,
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import pino from 'pino';
import { classify, maskPhone } from '@nexacred/shared';
import { allowedNumbers, canTest } from './policy.js';

const enabled = process.env.WHATSAPP_LAB_ENABLED === 'true';
const secret = process.env.MOCK_WEBHOOK_SECRET ?? '';
if (secret.length < 32) throw new Error('Internal service key missing');
const allowlist = allowedNumbers(process.env.WHATSAPP_TEST_NUMBERS ?? '');
const directory = resolve(process.env.WHATSAPP_DATA_DIR ?? '/data');
const authDirectory = resolve(directory, 'auth');
const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
// The upstream protocol logger can contain remote identities; do not forward it.
const protocolLogger = pino({ level: 'silent' });
type Attempt = {
  id: string;
  targetHash: string;
  at: number;
  status: 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'UNCERTAIN';
  providerId?: string;
};
type State = { attempts: Attempt[]; suppressed: string[] };
let state: State = { attempts: [], suppressed: [] };
let socket: WASocket | undefined;
let status = 'DISCONNECTED';
let qr: string | null = null;
let qrExpiresAt: number | null = null;
let note = 'Conecte seu número para começar.';
let queue = Promise.resolve();
let stopped = false;
let reconnect: ReturnType<typeof setTimeout> | undefined;
const hash = (s: string) => createHmac('sha256', secret).update(s).digest('hex');
const statePath = resolve(directory, 'lab-state.json');
const DEFAULT_TEST_MESSAGE =
  'NexaCred: mensagem de teste de conexão solicitada por você. Nenhuma oferta está sendo enviada.';
const OPT_OUT_FOOTER = 'Para interromper os testes, responda SAIR.';
const MAX_MESSAGE_LENGTH = 700;
// Builds the outbound text: uses an optional operator-provided message (so the team can
// preview the real first-contact copy), always appending the opt-out line if it is missing.
function buildMessage(custom: unknown): string {
  if (custom === undefined || custom === null || custom === '')
    return `${DEFAULT_TEST_MESSAGE} ${OPT_OUT_FOOTER}`;
  if (typeof custom !== 'string') throw new Error('Mensagem de teste inválida.');
  // Strip control characters that could break the transport, keeping tab/newline/return.
  const cleaned = [...custom]
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code === 9 || code === 10 || code === 13 || code >= 32;
    })
    .join('')
    .trim();
  if (!cleaned) throw new Error('Escreva a mensagem de teste ou use a padrão.');
  if (cleaned.length > MAX_MESSAGE_LENGTH)
    throw new Error(`A mensagem de teste deve ter até ${MAX_MESSAGE_LENGTH} caracteres.`);
  return /\bSAIR\b/i.test(cleaned) ? cleaned : `${cleaned}\n\n${OPT_OUT_FOOTER}`;
}
async function persist() {
  await writeFile(statePath + '.tmp', JSON.stringify(state), { mode: 0o600 });
  await rename(statePath + '.tmp', statePath);
}
function serialize<T>(work: () => Promise<T>): Promise<T> {
  const result = queue.then(work);
  queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
await mkdir(directory, { recursive: true, mode: 0o700 });
try {
  state = JSON.parse(await readFile(statePath, 'utf8')) as State;
  for (const a of state.attempts) if (a.status === 'PENDING') a.status = 'UNCERTAIN';
  await persist();
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== 'ENOENT')
    throw new Error('Test ledger cannot be loaded; refusing to send');
}
function summary() {
  return {
    enabled,
    status,
    qr,
    qrExpiresAt,
    note,
    allowlist: allowlist.map((p) => ({ id: hash(p), label: maskPhone(p) })),
    attempts: state.attempts
      .slice(-20)
      .reverse()
      .map((a) => ({
        id: a.id,
        at: a.at,
        status: a.status,
        target: maskPhone(allowlist.find((p) => hash(p) === a.targetHash) ?? ''),
      })),
    limits: { hourly: 5, daily: 20 },
  };
}
async function connect() {
  if (!enabled) throw new Error('Habilite WHATSAPP_LAB_ENABLED no servidor.');
  if (socket || status === 'CONNECTING') return;
  stopped = false;
  status = 'CONNECTING';
  qr = null;
  note = 'Preparando conexão…';
  try {
    const { state: auth, saveCreds } = await useMultiFileAuthState(authDirectory);
    const client = makeWASocket({
      auth,
      logger: protocolLogger,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      browser: ['NexaCred Test Lab', 'Chrome', '1.0.0'],
      getMessage: async () => undefined,
    });
    socket = client;
    client.ev.on('creds.update', () => {
      void serialize(saveCreds).catch(() => {
        note = 'Falha ao salvar sessão. Reconecte.';
      });
    });
    client.ev.on('connection.update', (update) => {
      void serialize(async () => {
        if (socket !== client) return;
        if (update.qr) {
          qr = await QRCode.toDataURL(update.qr, { margin: 2, width: 264 });
          qrExpiresAt = Date.now() + 45000;
          status = 'QR_READY';
          note = 'No WhatsApp, abra Aparelhos conectados e escaneie o QR Code.';
        }
        if (update.connection === 'open') {
          status = 'CONNECTED';
          qr = null;
          qrExpiresAt = null;
          note = 'Conexão pronta para testes manuais.';
        }
        if (update.connection === 'close') {
          socket = undefined;
          qr = null;
          qrExpiresAt = null;
          const code = (
            update.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined
          )?.output?.statusCode;
          if (code === DisconnectReason.loggedOut) {
            status = 'DISCONNECTED';
            note = 'Sessão encerrada. Conecte novamente.';
            await rm(authDirectory, { recursive: true, force: true });
          } else if (!stopped && code === DisconnectReason.restartRequired) {
            status = 'DISCONNECTED';
            reconnect = setTimeout(
              () =>
                void connect().catch(() => {
                  status = 'ERROR';
                  note = 'Não foi possível reconectar.';
                }),
              1500,
            );
          } else {
            status = 'DISCONNECTED';
            note = 'Conexão interrompida. Clique em conectar para tentar novamente.';
          }
        }
      }).catch(() => {
        note = 'Erro na conexão. Tente reconectar.';
      });
    });
    client.ev.on('messages.upsert', (event) => {
      void serialize(async () => {
        for (const message of event.messages) {
          if (message.key.fromMe) continue;
          const remote = message.key.remoteJid ?? '';
          const alternative = (message.key as { remoteJidAlt?: string }).remoteJidAlt;
          const jid = remote.endsWith('@s.whatsapp.net')
            ? remote
            : (alternative ??
              (remote.endsWith('@lid')
                ? await client.signalRepository.lidMapping.getPNForLID(remote)
                : null));
          if (!jid?.endsWith('@s.whatsapp.net')) continue;
          const phone = '+' + jid.split('@')[0]!.split(':')[0]!;
          if (!allowlist.includes(phone)) continue;
          const text =
            message.message?.conversation ?? message.message?.extendedTextMessage?.text ?? '';
          if (classify(text) === 'OPT_OUT' && !state.suppressed.includes(hash(phone))) {
            state.suppressed.push(hash(phone));
            await persist();
          }
        }
      }).catch(() => logger.error('Unable to persist incoming opt-out'));
    });
    client.ev.on('messages.update', (events) => {
      void serialize(async () => {
        for (const event of events) {
          const a = state.attempts.find((a) => a.providerId === event.key.id);
          if (!a) continue;
          const n = event.update.status;
          if (n && n >= 4) a.status = 'READ';
          else if (n && n >= 3 && a.status !== 'READ') a.status = 'DELIVERED';
        }
        await persist();
      }).catch(() => logger.error('Unable to persist receipt'));
    });
  } catch {
    socket = undefined;
    status = 'ERROR';
    note = 'Falha ao iniciar sessão. Confira a rede e tente novamente.';
    throw new Error(note);
  }
}
async function send(input: Record<string, unknown>) {
  if (typeof input.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(input.id))
    throw new Error('Identificador de teste inválido.');
  const previous = state.attempts.find((a) => a.id === input.id);
  if (previous) return previous;
  const phone = allowlist.find((p) => hash(p) === input.targetId);
  if (!phone) throw new Error('Número não cadastrado para testes.');
  const text = buildMessage(input.message);
  const now = Date.now();
  const result = canTest({
    enabled,
    connected: status === 'CONNECTED' && !!socket,
    phone,
    allowlist,
    consent: input.consent === true,
    suppressed: state.suppressed.includes(hash(phone)),
    hourly: state.attempts.filter((a) => a.at > now - 3600000).length,
    daily: state.attempts.filter((a) => a.at > now - 86400000).length,
  });
  if (!result.allowed) throw new Error('Envio bloqueado: ' + result.reasons.join(', '));
  const attempt: Attempt = { id: input.id, targetHash: hash(phone), at: now, status: 'PENDING' };
  state.attempts.push(attempt);
  await persist();
  // The message is operator-authored but always carries the opt-out line; the lab stays
  // manual and allowlisted so it never becomes an automated credit campaign channel.
  try {
    const response = await socket!.sendMessage(
      phone.slice(1) + '@s.whatsapp.net',
      { text },
      { messageId: 'NEXA' + randomUUID().replaceAll('-', '').toUpperCase() },
    );
    attempt.status = 'SENT';
    if (response?.key.id) attempt.providerId = response.key.id;
    await persist();
    logger.info({ testId: attempt.id }, 'manual test accepted');
  } catch {
    attempt.status = 'UNCERTAIN';
    await persist();
    note = 'Resultado incerto. Confira o aparelho antes de iniciar outro teste.';
  }
  return attempt;
}
const server = createServer(async (req, res) => {
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');
  const supplied = Buffer.from(req.headers.authorization?.replace(/^Bearer /, '') ?? '');
  if (req.url === '/health') {
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  if (
    supplied.length !== Buffer.byteLength(secret) ||
    !timingSafeEqual(supplied, Buffer.from(secret))
  ) {
    res.writeHead(401);
    res.end('{"message":"Unauthorized"}');
    return;
  }
  try {
    if (req.method === 'GET' && req.url === '/status') {
      res.end(JSON.stringify(summary()));
      return;
    }
    if (req.method !== 'POST') {
      res.writeHead(404);
      res.end('{}');
      return;
    }
    let raw = '';
    for await (const chunk of req) {
      raw += String(chunk);
      if (Buffer.byteLength(raw) > 4096) throw new Error('Payload muito grande.');
    }
    const body = JSON.parse(raw || '{}') as Record<string, unknown>;
    const result = await serialize(async () => {
      if (req.url === '/connect') {
        await connect();
        return summary();
      }
      if (req.url === '/disconnect') {
        stopped = true;
        if (reconnect) clearTimeout(reconnect);
        const client = socket;
        socket = undefined;
        if (client) {
          await client.logout().catch(() => undefined);
          client.end(undefined);
        }
        status = 'DISCONNECTED';
        qr = null;
        qrExpiresAt = null;
        await rm(authDirectory, { recursive: true, force: true });
        return summary();
      }
      if (req.url === '/send') return send(body);
      throw new Error('Ação não encontrada.');
    });
    res.end(JSON.stringify(result));
  } catch (error) {
    res.writeHead(400);
    res.end(
      JSON.stringify({ message: error instanceof Error ? error.message : 'Falha no laboratório' }),
    );
  }
});
server.listen(3010, '0.0.0.0', () =>
  logger.info('WhatsApp lab ready; no automatic connection or send'),
);
process.on('SIGTERM', () => {
  stopped = true;
  if (reconnect) clearTimeout(reconnect);
  socket?.end(undefined);
  server.close();
});

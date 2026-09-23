import { createServer } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, rm, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  type WASocket,
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import pino from 'pino';
import { classify, EncryptionService, maskPhone } from '@nexacred/shared';
import { allowedNumbers } from './policy.js';
import { dispatch, DispatchError, type Attempt } from './dispatch.js';

// libsignal 6 writes complete session keys through console.info/warn/error.
// This isolated transport process uses pino for safe operational messages instead.
for (const method of ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const) {
  console[method] = () => undefined;
}

const enabled = process.env.WHATSAPP_LAB_ENABLED === 'true';
const secret = process.env.MOCK_WEBHOOK_SECRET ?? '';
if (secret.length < 32) throw new Error('Internal service key missing');
const crypto = new EncryptionService(
  process.env.PII_ENCRYPTION_KEY ?? '',
  process.env.PII_HMAC_SECRET ?? '',
);
const allowlist = allowedNumbers(process.env.WHATSAPP_TEST_NUMBERS ?? '');
const directory = resolve(process.env.WHATSAPP_DATA_DIR ?? '/data');
const authDirectory = resolve(directory, 'auth');
const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
const protocolLogger = pino({ level: 'silent' });
type BridgeEvent = { id: string; encrypted: string };
type State = { attempts: Attempt[]; suppressed: string[]; events: BridgeEvent[] };
let state: State = { attempts: [], suppressed: [], events: [] };
let socket: WASocket | undefined;
let status = 'DISCONNECTED';
let qr: string | null = null;
let qrExpiresAt: number | null = null;
let note = 'Conecte seu WhatsApp para começar.';
let queue = Promise.resolve();
let stopped = false;
let reconnect: ReturnType<typeof setTimeout> | undefined;
let reconnectCount = 0;
const hash = (s: string) => createHmac('sha256', secret).update(s).digest('hex');
const statePath = resolve(directory, 'lab-state.json');
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
  state.events ??= [];
  for (const a of state.attempts) if (a.status === 'PENDING') a.status = 'UNCERTAIN';
  await persist();
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== 'ENOENT')
    throw new Error('Ledger cannot be loaded; refusing to send');
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
      .slice(-30)
      .reverse()
      .map((a) => ({
        id: a.id,
        at: a.at,
        status: a.status,
        target: a.target ?? maskPhone(allowlist.find((p) => hash(p) === a.targetHash) ?? ''),
        kind: a.kind ?? 'TEST',
      })),
    limits: { hourly: 5, daily: 20 },
  };
}
function scheduleReconnect() {
  if (stopped || reconnect) return;
  const delay = Math.min(30000, 1500 * 2 ** Math.min(reconnectCount++, 5));
  note = 'Restabelecendo a conexão automaticamente…';
  reconnect = setTimeout(() => {
    reconnect = undefined;
    void serialize(connect).catch(() => scheduleReconnect());
  }, delay);
}
function appendEvent(id: string, event: Record<string, unknown>) {
  if (!state.events.some((e) => e.id === id))
    state.events.push({
      id,
      encrypted: crypto.encrypt(
        JSON.stringify({ ...event, eventId: id, occurredAt: new Date().toISOString() }),
      ),
    });
}
async function connect() {
  if (!enabled) throw new DispatchError('DISABLED', 'WhatsApp desativado no servidor.');
  if (socket || status === 'CONNECTING') return;
  if (reconnect) clearTimeout(reconnect);
  reconnect = undefined;
  stopped = false;
  status = 'CONNECTING';
  qr = null;
  note = 'Preparando conexão segura…';
  try {
    const { state: auth, saveCreds } = await useMultiFileAuthState(authDirectory);
    const client = makeWASocket({
      auth: { creds: auth.creds, keys: makeCacheableSignalKeyStore(auth.keys, protocolLogger) },
      logger: protocolLogger,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      browser: ['NexaCred', 'Chrome', '1.0.0'],
      connectTimeoutMs: 30000,
      defaultQueryTimeoutMs: 8000,
      qrTimeout: 45000,
      getMessage: async (key) => {
        const attempt = state.attempts.find((a) => a.providerId === key.id);
        return attempt?.bodyEncrypted
          ? { conversation: crypto.decrypt(attempt.bodyEncrypted) }
          : undefined;
      },
    });
    socket = client;
    client.ev.on('creds.update', () => {
      void serialize(saveCreds).catch(() => {
        note = 'Não foi possível salvar a sessão.';
      });
    });
    client.ev.on('connection.update', (update) => {
      // A closed socket must not be considered connected while sends are queued.
      if (socket === client && update.connection === 'close') status = 'DISCONNECTED';
      void serialize(async () => {
        if (socket !== client) return;
        if (update.qr) {
          qr = await QRCode.toDataURL(update.qr, {
            margin: 3,
            width: 320,
            errorCorrectionLevel: 'M',
          });
          qrExpiresAt = Date.now() + 45000;
          status = 'QR_READY';
          note = 'Abra Aparelhos conectados no WhatsApp e escaneie o QR.';
        }
        if (update.connection === 'open') {
          status = 'CONNECTED';
          qr = null;
          qrExpiresAt = null;
          reconnectCount = 0;
          note = 'Seu WhatsApp está pronto para enviar e receber mensagens.';
        }
        if (update.connection === 'close') {
          socket = undefined;
          qr = null;
          qrExpiresAt = null;
          const code = (
            update.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined
          )?.output?.statusCode;
          if (code === DisconnectReason.loggedOut) {
            stopped = true;
            note = 'Sessão encerrada no aparelho. Conecte novamente.';
            await rm(authDirectory, { recursive: true, force: true });
          } else if (code === DisconnectReason.connectionReplaced) {
            stopped = true;
            note = 'Esta sessão foi aberta em outro serviço. Reconecte quando estiver livre.';
          } else scheduleReconnect();
        }
      }).catch(() => {
        status = 'ERROR';
        note = 'Não foi possível atualizar a conexão.';
      });
    });
    client.ev.on('messages.upsert', (event) => {
      for (const message of event.messages) {
        if (message.key.fromMe || !message.key.id) continue;
        // Resolve LID before persisting. Group/broadcast messages are not customer replies.
        void (async () => {
          const remote = message.key.remoteJid ?? '';
          if (remote.endsWith('@g.us') || remote.endsWith('@broadcast')) return;
          const jid = remote.endsWith('@s.whatsapp.net')
            ? remote
            : (message.key.remoteJidAlt ??
              (remote.endsWith('@lid')
                ? await client.signalRepository.lidMapping.getPNForLID(remote)
                : null));
          if (!jid?.endsWith('@s.whatsapp.net')) return;
          const phone = '+' + jid.split('@')[0]!.split(':')[0]!;
          const text =
            message.message?.conversation ?? message.message?.extendedTextMessage?.text ?? '';
          if (!text) return;
          const matched = state.attempts.find((a) => a.jidHash === hash(phone));
          const originalPhone = matched?.phoneEncrypted
            ? crypto.decrypt(matched.phoneEncrypted)
            : phone;
          if (classify(text) === 'OPT_OUT') {
            // Immediately visible to the gate, even when an outbound lookup is in flight.
            for (const identity of [hash(phone), hash(originalPhone)])
              if (!state.suppressed.includes(identity)) state.suppressed.push(identity);
          }
          await serialize(async () => {
            appendEvent('in-' + message.key.id, {
              type: 'INBOUND_REPLY',
              from: originalPhone,
              body: text.slice(0, 4000),
            });
            await persist();
          });
        })().catch(() => {
          status = 'ERROR';
          logger.error('Unable to persist incoming message; sending blocked');
        });
      }
    });
    client.ev.on('messages.update', (events) => {
      void serialize(async () => {
        for (const event of events) {
          const a = state.attempts.find((a) => a.providerId === event.key.id);
          if (!a) continue;
          const n = event.update.status;
          if (n && n >= 4) a.status = 'READ';
          else if (n && n >= 3 && a.status !== 'READ') a.status = 'DELIVERED';
          if (n && n >= 3 && a.kind === 'CAMPAIGN')
            appendEvent(`delivery-${a.id}`, { type: 'DELIVERED', messageId: a.providerId });
        }
        await persist();
      }).catch(() => logger.error('Unable to persist receipt'));
    });
  } catch {
    socket = undefined;
    status = 'ERROR';
    note = 'Falha de conexão. Verifique a rede.';
    throw new DispatchError('CONNECTION_FAILED', note);
  }
}
async function send(input: Record<string, unknown>, kind: 'TEST' | 'CAMPAIGN') {
  const legacyPhone = allowlist.find((p) => hash(p) === input.targetId);
  const attempt = await dispatch({ ...input, phone: input.phone ?? legacyPhone }, kind, {
    attempts: state.attempts,
    enabled,
    connected: () => status === 'CONNECTED' && !!socket,
    suppressed: (identity) => state.suppressed.includes(identity),
    hash,
    encrypt: (s) => crypto.encrypt(s),
    persist,
    resolve: async (phone) => {
      const result = await socket!.onWhatsApp(phone.slice(1));
      return result?.find((r) => r.exists)?.jid;
    },
    send: async (jid, text, messageId) => {
      await socket!.sendMessage(jid, { text }, { messageId });
    },
  });
  return { id: attempt.id, status: attempt.status };
}
const server = createServer(async (req, res) => {
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');
  if (req.url === '/health') {
    res.end('{"status":"ok"}');
    return;
  }
  const supplied = Buffer.from(req.headers.authorization?.replace(/^Bearer /, '') ?? '');
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
    if (req.method === 'GET' && req.url === '/events') {
      const payload = JSON.stringify(state.events.slice(0, 100));
      res.end(
        JSON.stringify({
          payload,
          signature: createHmac('sha256', secret).update(payload).digest('hex'),
        }),
      );
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
      if (Buffer.byteLength(raw) > 24000)
        throw new DispatchError('PAYLOAD_TOO_LARGE', 'Mensagem muito grande.');
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
        reconnect = undefined;
        const client = socket;
        socket = undefined;
        if (client) {
          await client.logout().catch(() => undefined);
          client.end(undefined);
        }
        status = 'DISCONNECTED';
        qr = null;
        qrExpiresAt = null;
        note = 'Aparelho desconectado.';
        await rm(authDirectory, { recursive: true, force: true });
        return summary();
      }
      if (req.url === '/send') return send(body, 'TEST');
      if (req.url === '/dispatch') return send(body, 'CAMPAIGN');
      if (req.url === '/events/ack' && Array.isArray(body.ids)) {
        state.events = state.events.filter((e) => !(body.ids as unknown[]).includes(e.id));
        await persist();
        return { ok: true };
      }
      throw new DispatchError('NOT_FOUND', 'Ação não encontrada.');
    });
    res.end(JSON.stringify(result));
  } catch (error) {
    res.writeHead(
      error instanceof DispatchError &&
        ['NOT_CONNECTED', 'RATE_LIMIT', 'LOOKUP_UNAVAILABLE'].includes(error.code)
        ? 503
        : 400,
    );
    // Never serialize upstream errors (they can contain phone numbers or session keys).
    res.end(
      JSON.stringify({
        code: error instanceof DispatchError ? error.code : 'BRIDGE_ERROR',
        message:
          error instanceof DispatchError
            ? error.message
            : 'Não foi possível concluir. Consulte o histórico antes de repetir.',
      }),
    );
  }
});
server.listen(3010, '0.0.0.0', () => logger.info('WhatsApp bridge ready'));
if (
  enabled &&
  (await stat(resolve(authDirectory, 'creds.json')).then(
    () => true,
    () => false,
  ))
) {
  void serialize(connect).catch(() => scheduleReconnect());
}
process.on('SIGTERM', () => {
  stopped = true;
  if (reconnect) clearTimeout(reconnect);
  socket?.end(undefined);
  server.close();
});

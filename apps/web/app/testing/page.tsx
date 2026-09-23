'use client';
import { useState } from 'react';
import { QrCode, FlaskConical, ShieldCheck, Smartphone, Send } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { ErrorBox, useResource } from '@/components/resource';
import { api } from '@/lib/client';
type Lab = {
  enabled: boolean;
  status: string;
  qr?: string;
  qrExpiresAt?: number;
  note?: string;
  allowlist: Array<{ id: string; label: string }>;
  attempts: Array<{ id: string; at: number; status: string; target: string }>;
};
const OPT_OUT_FOOTER = 'Para interromper os testes, responda SAIR.';
const DEFAULT_MESSAGE =
  'Olá! Aqui é a equipe NexaCred. Estamos testando nosso canal de atendimento no WhatsApp. Podemos seguir por aqui?';
const labels: Record<string, string> = {
  CONNECTED: 'Conectado',
  DISCONNECTED: 'Desconectado',
  CONNECTING: 'Conectando',
  QR_READY: 'Aguardando leitura',
  ERROR: 'Falha na conexão',
  PENDING: 'Processando',
  SENT: 'Enviado',
  DELIVERED: 'Entregue',
  READ: 'Lido',
  UNCERTAIN: 'Resultado incerto',
};
export default function Testing() {
  const { data, error, load } = useResource<Lab>('/testing/whatsapp', 5000);
  const [busy, setBusy] = useState(false),
    [failure, setFailure] = useState(''),
    [notice, setNotice] = useState(''),
    [target, setTarget] = useState(''),
    [consent, setConsent] = useState(false),
    [message, setMessage] = useState(DEFAULT_MESSAGE),
    [requestId, setRequestId] = useState<string>();
  const trimmed = message.trim();
  const preview = !trimmed
    ? DEFAULT_MESSAGE + '\n\n' + OPT_OUT_FOOTER
    : /\bSAIR\b/i.test(trimmed)
      ? trimmed
      : trimmed + '\n\n' + OPT_OUT_FOOTER;
  async function action(name: string) {
    setBusy(true);
    setFailure('');
    setNotice('');
    try {
      await api('/testing/whatsapp/' + name, {});
      await load();
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function send() {
    const id = requestId ?? crypto.randomUUID();
    setRequestId(id);
    setBusy(true);
    setFailure('');
    setNotice('');
    try {
      const result = await api<{ status: string }>('/testing/whatsapp/send', {
        id,
        targetId: target,
        consent,
        message: trimmed || undefined,
      });
      setNotice(
        `Teste: ${labels[result.status] ?? result.status}. Confira o histórico e o aparelho de destino.`,
      );
      if (result.status !== 'UNCERTAIN' && result.status !== 'PENDING') setRequestId(undefined);
      await load();
    } catch (e) {
      setFailure(
        (e as Error).message +
          ' Ao tentar novamente, o mesmo identificador será usado para evitar duplicidade.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-7">
      <header>
        <p className="eyebrow">CONEXÕES / WHATSAPP</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Laboratório de mensagens
          <span className="ml-3 align-middle rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
            Beta
          </span>
        </h1>
        <p className="mt-2 text-slate-500">
          Conecte um aparelho e acompanhe seu primeiro teste, passo a passo.
        </p>
      </header>
      <ErrorBox error={error || failure} />
      {!data && !error && <Card className="p-8">Carregando conexão…</Card>}
      {data && !data.enabled && (
        <Card className="p-7">
          <FlaskConical className="mb-4 text-teal-700" />
          <h2 className="text-lg font-semibold">Ative seu ambiente de testes</h2>
          <p className="mt-2 text-sm text-slate-500">
            Um administrador precisa configurar os números dos participantes no servidor e iniciar o
            serviço.
          </p>
          <pre className="mt-5 overflow-auto rounded-xl bg-slate-900 p-5 text-xs leading-7 text-emerald-100">
            {
              '# No arquivo .env\nWHATSAPP_LAB_ENABLED=true\nWHATSAPP_TEST_NUMBERS=+55DDDNUMERO\n\n# No terminal do servidor\ndocker compose --profile whatsapp-lab up --build -d'
            }
          </pre>
          <p className="mt-4 text-sm text-slate-500">
            Use até 5 números de teste, separados por vírgula, com DDI e DDD. A tela fica disponível
            somente para administradores.
          </p>
        </Card>
      )}
      {data?.enabled && (
        <div className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
          <Card className="p-7">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="rounded-xl bg-emerald-50 p-3 text-teal-700">
                  <QrCode size={22} />
                </span>
                <div>
                  <p className="eyebrow">PASSO 01</p>
                  <h2 className="font-semibold">Conecte o WhatsApp</h2>
                </div>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs ${data.status === 'CONNECTED' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}
              >
                {labels[data.status] ?? data.status}
              </span>
            </div>
            <div className="my-6 flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5">
              {data.qr && data.qrExpiresAt && data.qrExpiresAt > Date.now() ? (
                <img
                  src={data.qr}
                  alt="QR Code para conectar seu WhatsApp ao laboratório"
                  width={264}
                  height={264}
                />
              ) : (
                <>
                  <Smartphone size={56} strokeWidth={1} className="mb-4 text-teal-700" />
                  <p className="text-center text-sm text-slate-500">
                    {data.status === 'CONNECTED'
                      ? 'Seu aparelho está conectado.'
                      : data.status === 'QR_READY'
                        ? 'Atualizando QR Code…'
                        : 'O QR Code aparecerá aqui.'}
                  </p>
                </>
              )}
            </div>
            <p className="min-h-10 text-sm text-slate-500">{data.note}</p>
            <div className="mt-5 flex gap-3">
              <Button
                disabled={busy || !['DISCONNECTED', 'ERROR'].includes(data.status)}
                onClick={() => void action('connect')}
              >
                Conectar aparelho
              </Button>
              <Button
                variant="outline"
                disabled={busy || data.status === 'DISCONNECTED'}
                onClick={() => void action('disconnect')}
              >
                Desconectar
              </Button>
            </div>
            <p className="mt-4 text-xs text-slate-500">
              No celular: WhatsApp → Aparelhos conectados → Conectar aparelho.
            </p>
          </Card>
          <Card className="p-7">
            <div className="flex items-center gap-3">
              <span className="rounded-xl bg-emerald-50 p-3 text-teal-700">
                <Send size={22} />
              </span>
              <div>
                <p className="eyebrow">PASSO 02</p>
                <h2 className="font-semibold">Envie uma mensagem de teste</h2>
              </div>
            </div>
            <label className="mt-7 block text-sm font-medium">
              Destinatário de teste
              <select
                value={target}
                onChange={(e) => {
                  setTarget(e.target.value);
                  setRequestId(undefined);
                  setConsent(false);
                }}
                disabled={busy || !!requestId}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3"
              >
                <option value="">Escolha um número cadastrado</option>
                {data.allowlist.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            {!data.allowlist.length && (
              <p className="mt-2 text-sm text-amber-700">
                Cadastre um número em WHATSAPP_TEST_NUMBERS e reinicie os serviços.
              </p>
            )}
            <label className="mb-2 mt-6 flex items-center justify-between text-sm font-medium">
              Mensagem de teste
              <span className="text-xs font-normal text-slate-400">{trimmed.length}/700</span>
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, 700))}
              rows={4}
              disabled={busy || !!requestId}
              aria-label="Mensagem de teste"
              placeholder="Escreva a mensagem que quer testar…"
              className="w-full resize-none rounded-xl border border-slate-200 bg-white p-3 text-sm leading-6 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            />
            <p className="mb-2 mt-4 text-xs font-medium text-slate-500">Prévia enviada ao aparelho</p>
            <div className="whitespace-pre-line rounded-2xl rounded-tr-sm border border-emerald-100 bg-emerald-50 p-5 text-sm leading-7 text-emerald-950">
              {preview}
            </div>
            <p className="mt-2 text-xs text-slate-400">
              A linha “responda SAIR” é adicionada automaticamente quando você não a inclui.
            </p>
            <label className="my-6 flex items-start gap-3 text-sm leading-6 text-slate-600">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-1 h-4 w-4 accent-teal-700"
              />
              Confirmo que este número é meu ou pertence a um participante que autorizou receber
              esta mensagem de teste.
            </label>
            <Button
              className="w-full"
              disabled={busy || data.status !== 'CONNECTED' || !target || !consent}
              onClick={() => void send()}
            >
              <Send size={16} />
              {busy
                ? 'Processando…'
                : requestId
                  ? 'Consultar / repetir mesma tentativa'
                  : 'Enviar mensagem de teste'}
            </Button>
            {notice && (
              <p
                role="status"
                className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800"
              >
                {notice}
              </p>
            )}
            <p className="mt-4 text-xs leading-5 text-slate-500">
              Limite de 5 tentativas por hora e 20 por dia. “Enviado” indica aceite pelo cliente; a
              entrega depende da confirmação do WhatsApp. Resultados incertos precisam ser
              conferidos no aparelho.
            </p>
          </Card>
        </div>
      )}
      <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        <ShieldCheck className="mt-1 shrink-0" size={20} />
        <p>
          Baileys é uma integração não oficial e pode apresentar desconexões ou restrições de conta.
          Este laboratório usa envios manuais; as campanhas continuam no provedor de simulação.
          Respostas SAIR bloqueiam novos testes para o destinatário identificado.
        </p>
      </div>
      {!!data?.attempts.length && (
        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 p-6">
            <h2 className="font-semibold">Últimos testes</h2>
            <p className="mt-1 text-sm text-slate-500">
              Acompanhe as confirmações recebidas do aparelho.
            </p>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="p-4">DESTINATÁRIO</th>
                  <th className="p-4">HORÁRIO</th>
                  <th className="p-4">STATUS</th>
                </tr>
              </thead>
              <tbody>
                {data.attempts.map((a) => (
                  <tr key={a.id} className="border-t border-slate-100">
                    <td className="p-4 font-medium">{a.target}</td>
                    <td className="p-4 text-slate-500">{new Date(a.at).toLocaleString('pt-BR')}</td>
                    <td className="p-4">{labels[a.status] ?? a.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Check,
  CheckCheck,
  Clock3,
  LoaderCircle,
  MessageCircle,
  QrCode,
  RefreshCw,
  Send,
  ShieldCheck,
  Smartphone,
  Unplug,
  Wifi,
} from 'lucide-react';
import { Button, Card, Input } from '@/components/ui';
import { ErrorBox, useResource } from '@/components/resource';
import { api } from '@/lib/client';
type Lab = {
  enabled: boolean;
  status: string;
  qr: string | null;
  qrExpiresAt: number | null;
  note: string;
  attempts: Array<{ id: string; at: number; status: string; target: string; kind: string }>;
};
const labels: Record<string, string> = {
  CONNECTED: 'Pronto para enviar',
  DISCONNECTED: 'Aparelho desconectado',
  CONNECTING: 'Conectando',
  QR_READY: 'Escaneie para conectar',
  ERROR: 'Verifique a conexão',
  PENDING: 'Processando',
  SENT: 'Enviado',
  DELIVERED: 'Entregue',
  READ: 'Lido',
  UNCERTAIN: 'Sem confirmação',
};
export default function Testing() {
  const { data, error, load } = useResource<Lab>('/testing/whatsapp', 3000);
  const [busy, setBusy] = useState(false),
    [failure, setFailure] = useState(''),
    [notice, setNotice] = useState('');
  const [phone, setPhone] = useState(''),
    [consent, setConsent] = useState(false);
  const [message, setMessage] = useState(
    'Olá! Aqui é a equipe NexaCred. Esta é a mensagem de teste do nosso atendimento, conforme você autorizou.',
  );
  const [requestId, setRequestId] = useState<string>(),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const connected = data?.status === 'CONNECTED';
  const preview = /\bSAIR\b/i.test(message)
    ? message.trim()
    : message.trim() + '\n\nPara não receber mais mensagens, responda SAIR.';
  const seconds = Math.max(0, Math.ceil(((data?.qrExpiresAt ?? now) - now) / 1000));
  async function connection(action: string) {
    setBusy(true);
    setFailure('');
    try {
      await api('/testing/whatsapp/' + action, {});
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
        phone,
        consent,
        message,
      });
      if (['SENT', 'DELIVERED', 'READ'].includes(result.status)) {
        setNotice('Mensagem enviada. Acompanhe a confirmação de entrega no histórico.');
        setRequestId(undefined);
      } else
        setFailure(
          'O WhatsApp ainda não confirmou o envio. Confira o aparelho antes de criar outra tentativa.',
        );
      await load();
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <section className="channel-hero relative overflow-hidden rounded-2xl p-6 text-white md:p-8">
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-6">
          <div>
            <div className="mb-4 flex items-center gap-2 text-xs font-medium text-[#b7f7d5]">
              <span className="size-1.5 rounded-full bg-current" />
              RELACIONAMENTO · WHATSAPP
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">Boas conversas começam aqui.</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[#afc9c3]">
              Conecte seu aparelho, teste a primeira mensagem e acompanhe cada entrega em um só
              lugar.
            </p>
          </div>
          <Link
            href="/campaigns"
            className="inline-flex items-center gap-3 rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm hover:bg-white/10"
          >
            Ir para campanhas <ArrowRight size={16} />
          </Link>
        </div>
      </section>
      <ErrorBox error={failure || error} />
      {!data && !error && (
        <div className="grid gap-6 lg:grid-cols-[360px_1fr]" aria-label="Carregando WhatsApp">
          <div className="panel h-96 animate-pulse" />
          <div className="panel h-96 animate-pulse" />
        </div>
      )}
      {data && !data.enabled && (
        <Card className="p-8">
          <h2 className="font-semibold">Canal desativado</h2>
          <p className="mt-2 text-sm text-slate-500">
            Peça ao administrador para ativar o serviço WhatsApp nesta instalação.
          </p>
        </Card>
      )}
      {data?.enabled && (
        <div className="grid items-start gap-6 xl:grid-cols-[350px_minmax(0,1fr)]">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 p-5">
              <div className="flex items-center gap-3">
                <span className="rounded-xl bg-teal-50 p-2.5 text-teal-700">
                  <Smartphone size={20} />
                </span>
                <div>
                  <h2 className="font-semibold">Seu aparelho</h2>
                  <p className="mt-1 text-xs text-slate-500">Conexão por QR Code</p>
                </div>
              </div>
              <span
                className={`size-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-amber-400'}`}
              />
            </div>
            <div className="p-6">
              <div
                className={`mb-5 flex items-center justify-center gap-2 rounded-full px-3 py-2 text-xs font-medium ${connected ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-600'}`}
                aria-live="polite"
              >
                {connected ? <Wifi size={14} /> : <Clock3 size={14} />}{' '}
                {labels[data.status] ?? data.status}
              </div>
              {data.qr ? (
                <>
                  <div className="mx-auto max-w-[290px] rounded-2xl border border-slate-200 bg-white p-2">
                    <img
                      src={data.qr}
                      width={320}
                      height={320}
                      alt="QR Code para conectar seu WhatsApp"
                      className="h-auto w-full"
                    />
                  </div>
                  <p className="mt-3 flex items-center justify-center gap-2 text-xs text-slate-500">
                    <RefreshCw size={12} />
                    {seconds ? `Renovação automática em ${seconds}s` : 'Atualizando QR Code…'}
                  </p>
                </>
              ) : (
                <div className="connection-stage flex h-60 flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50">
                  <span
                    className={`grid size-20 place-items-center rounded-3xl ${connected ? 'bg-teal-100 text-teal-700' : 'bg-white text-slate-400 shadow-sm'}`}
                  >
                    {connected ? (
                      <CheckCheck size={36} />
                    ) : data.status === 'CONNECTING' ? (
                      <LoaderCircle size={34} className="animate-spin" />
                    ) : (
                      <QrCode size={38} />
                    )}
                  </span>
                  <p className="max-w-52 text-center text-sm text-slate-500">
                    {connected
                      ? 'Tudo pronto para a próxima conversa.'
                      : 'Conecte seu aparelho para gerar o QR Code.'}
                  </p>
                </div>
              )}
              {!connected && (
                <ol className="my-6 space-y-3 text-xs leading-5 text-slate-500">
                  {[
                    'Abra o WhatsApp no seu celular.',
                    'Vá em Aparelhos conectados → Conectar aparelho.',
                    'Aponte a câmera para o QR Code.',
                  ].map((step, i) => (
                    <li key={step} className="flex gap-3">
                      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600">
                        {i + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
              )}
              <p className="my-4 text-xs leading-5 text-slate-500" role="status">
                {data.note}
              </p>
              {connected ? (
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        'Desconectar este aparelho? Será necessário escanear o QR novamente.',
                      )
                    )
                      void connection('disconnect');
                  }}
                >
                  <Unplug size={15} />
                  Desconectar aparelho
                </Button>
              ) : (
                <Button
                  className="w-full"
                  disabled={busy || ['CONNECTING', 'QR_READY'].includes(data.status)}
                  onClick={() => void connection('connect')}
                >
                  <QrCode size={16} />
                  {data.status === 'QR_READY'
                    ? 'Aguardando leitura do QR'
                    : data.status === 'CONNECTING'
                      ? 'Conectando…'
                      : 'Conectar WhatsApp'}
                </Button>
              )}
            </div>
            <div className="flex gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4 text-xs leading-5 text-slate-500">
              <ShieldCheck size={16} className="shrink-0 text-teal-700" />
              Sua sessão é salva. Você não precisa ler o QR a cada acesso.
            </div>
          </Card>
          <Card className="overflow-hidden">
            <div className="flex items-center gap-3 border-b border-slate-100 p-5">
              <span className="rounded-xl bg-teal-50 p-2.5 text-teal-700">
                <Send size={20} />
              </span>
              <div>
                <h2 className="font-semibold">Sua primeira mensagem</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Um teste real, direto para o destinatário autorizado.
                </p>
              </div>
            </div>
            <div className="grid gap-7 p-6 2xl:grid-cols-2">
              <div className="space-y-5">
                <label className="block text-sm font-medium">
                  Número do destinatário
                  <Input
                    type="tel"
                    inputMode="tel"
                    autoComplete="off"
                    placeholder="(11) 99999-9999"
                    value={phone}
                    disabled={busy || !!requestId}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      setConsent(false);
                      setNotice('');
                    }}
                    className="mt-2 !h-12"
                  />
                  <span className="mt-2 block text-xs font-normal text-slate-500">
                    Digite o DDD e o número. Não é necessário cadastrar antes.
                  </span>
                </label>
                <label className="block text-sm font-medium">
                  <span className="mb-2 flex justify-between">
                    Mensagem
                    <span className="text-xs font-normal text-slate-400">{message.length}/700</span>
                  </span>
                  <textarea
                    aria-label="Mensagem de teste"
                    value={message}
                    maxLength={700}
                    disabled={busy || !!requestId}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={6}
                    className="w-full resize-y rounded-xl border border-slate-200 bg-white p-3 text-sm leading-6 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
                  />
                </label>
                <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4 text-xs leading-5 text-slate-600">
                  <input
                    type="checkbox"
                    checked={consent}
                    disabled={busy || !!requestId}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="mt-0.5 size-4 shrink-0 accent-teal-700"
                  />
                  Confirmo que o destinatário autorizou receber esta mensagem de teste. Esta
                  autorização não libera campanhas de marketing.
                </label>
                <Button
                  className="w-full"
                  size="lg"
                  disabled={busy || !connected || !phone.trim() || !message.trim() || !consent}
                  onClick={() => void send()}
                >
                  {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Send size={16} />}{' '}
                  {busy
                    ? 'Processando…'
                    : requestId
                      ? 'Consultar mesma tentativa'
                      : 'Enviar mensagem de teste'}
                </Button>
                {requestId && !busy && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      if (
                        window.confirm(
                          'Confira no WhatsApp se a mensagem chegou. Liberar o formulário permite uma NOVA mensagem. Continuar?',
                        )
                      ) {
                        setRequestId(undefined);
                        setFailure('');
                      }
                    }}
                  >
                    Revisar dados / liberar nova tentativa
                  </Button>
                )}
                {notice && (
                  <p
                    role="status"
                    className="flex gap-2 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800"
                  >
                    <Check size={18} className="shrink-0" />
                    {notice}
                  </p>
                )}
              </div>
              <div className="min-w-0">
                <p className="eyebrow mb-3">PRÉVIA NO WHATSAPP</p>
                <div className="message-preview rounded-2xl border border-slate-200 p-5">
                  <div className="mb-8 flex items-center gap-3">
                    <span className="grid size-10 place-items-center rounded-full bg-teal-700 text-white">
                      <MessageCircle size={20} />
                    </span>
                    <div>
                      <p className="text-sm font-semibold">NexaCred</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">Atendimento pelo WhatsApp</p>
                    </div>
                  </div>
                  <div className="ml-3 rounded-2xl rounded-tr-sm bg-[#d9fdd3] p-4 text-sm leading-6 text-[#203c32] shadow-sm">
                    <p className="whitespace-pre-wrap break-words">{preview}</p>
                    <span className="mt-3 flex justify-end gap-1 text-[10px] text-[#617b69]">
                      Prévia <CheckCheck size={14} />
                    </span>
                  </div>
                  <p className="mt-6 text-center text-[11px] text-slate-500">
                    A instrução de saída acompanha sua mensagem.
                  </p>
                </div>
                <div className="mt-4 flex gap-3 rounded-xl bg-slate-50 p-4 text-xs leading-5 text-slate-500">
                  <ShieldCheck size={18} className="shrink-0 text-teal-700" />
                  <p>
                    Testes: até 5 por hora e 20 por dia. Para uma campanha, registre o consentimento
                    do contato em Leads e revise o público antes de iniciar.
                  </p>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 p-5">
          <div>
            <h2 className="font-semibold">Atividade do canal</h2>
            <p className="mt-1 text-xs text-slate-500">Confirmações reais recebidas do WhatsApp.</p>
          </div>
          <span className="flex items-center gap-2 text-xs text-slate-500">
            <span className="size-1.5 rounded-full bg-teal-500" />
            Atualiza automaticamente
          </span>
        </div>
        {data?.attempts.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  {['Destinatário', 'Origem', 'Data e hora', 'Status'].map((t) => (
                    <th key={t} className="px-6 py-3 font-medium">
                      {t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.attempts.map((a) => (
                  <tr key={a.id} className="border-t border-slate-100">
                    <td className="px-6 py-4 font-medium">{a.target}</td>
                    <td className="px-6 py-4 text-slate-500">
                      {a.kind === 'CAMPAIGN' ? 'Campanha / atendimento' : 'Teste manual'}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-slate-500">
                      {new Date(a.at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${a.status === 'UNCERTAIN' ? 'bg-amber-50 text-amber-700' : 'bg-teal-50 text-teal-700'}`}
                      >
                        <CheckCheck size={13} />
                        {labels[a.status] ?? a.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <MessageCircle className="mb-2 text-slate-300" size={28} />
            <p className="text-sm font-medium">Sua próxima conversa aparece aqui</p>
            <p className="text-xs text-slate-500">
              Conecte o aparelho e envie uma mensagem autorizada para começar.
            </p>
          </div>
        )}
      </Card>
      <p className="text-xs leading-5 text-slate-500">
        Baileys é uma conexão não oficial e está sujeito a restrições do WhatsApp. “Enviado” indica
        aceite; “Entregue” e “Lido” dependem das confirmações do destinatário. Responder SAIR
        bloqueia novos envios.
      </p>
    </div>
  );
}

'use client';
import { useState } from 'react';
import { Title, ErrorBox, useResource, Row } from '@/components/resource';
import { Status } from '@/components/status';
import { Button, Input } from '@/components/ui';
import { api } from '@/lib/client';
type Conversation = Row & {
  id: string;
  leadId: string;
  contactId: string;
  status: string;
  note: string;
  chatwootId?: number;
  lead: { name: string; cpfLast4: string; organization: string };
  contact: { maskedValue: string };
  messages: Array<{ id: string; direction: string; body: string; status: string }>;
};
export default function Conversations() {
  const { data, error, load } = useResource<Conversation[]>('/conversations', 3000);
  const [id, setId] = useState('');
  const { data: detail, load: reload } = useResource<Conversation>(
    id ? `/conversations/${id}` : '',
    id ? 3000 : 0,
  );
  const { data: users } = useResource<Array<{ id: string; name: string }>>('/users');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  async function act(path: string, body: unknown, method?: string) {
    setBusy(true);
    setActionError('');
    try {
      await api(path, body, method);
      await reload();
      await load();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Title
        title="Conversas"
        subtitle="Histórico e atendimento humano com o contexto de cada conversa."
      />
      <ErrorBox error={error || actionError} />
      <div className="grid xl:grid-cols-[260px_1fr_250px] min-h-[650px] rounded-xl border border-slate-200 overflow-hidden">
        <aside className="bg-white border-r border-slate-200">
          <h2 className="p-4 text-sm border-b border-slate-200">
            Inbox · {data?.length ?? 0} conversas
          </h2>
          {data?.map((c) => (
            <button
              key={c.id}
              onClick={() => setId(c.id)}
              className={`w-full text-left p-4 border-b border-slate-100 hover:bg-slate-50 ${id === c.id ? 'bg-teal-50/60 border-l-2 border-l-teal-500' : ''}`}
            >
              <p className="font-medium text-sm">{c.lead.name}</p>
              <div className="mt-1.5">
                <Status value={c.status} />
              </div>
              <p className="text-xs text-slate-400 truncate mt-3">
                {c.messages[0]?.body ?? 'Sem mensagens'}
              </p>
            </button>
          ))}
          {!data?.length && (
            <p className="p-6 text-sm text-slate-500">
              As conversas aparecem após uma campanha ou uma resposta recebida.
            </p>
          )}
        </aside>
        <section className="bg-slate-50 flex flex-col">
          <header className="p-4 border-b border-slate-200 font-medium">
            {detail?.lead?.name ?? 'Selecione uma conversa'}
          </header>
          <div className="flex-1 space-y-3 p-5 max-h-[470px] overflow-y-auto">
            {detail?.messages?.map((m) => (
              <div
                key={m.id}
                className={`rounded-2xl p-3 max-w-[85%] text-sm shadow-sm ${m.direction === 'OUTBOUND' ? 'ml-auto rounded-br-sm bg-teal-600 text-white' : 'rounded-bl-sm bg-white border border-slate-200'}`}
              >
                <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
                <span
                  className={`block text-[10px] mt-2 ${m.direction === 'OUTBOUND' ? 'text-white/70' : 'text-slate-400'}`}
                >
                  {m.direction === 'INBOUND' ? 'Recebida' : m.status}
                </span>
              </div>
            ))}
          </div>
          {detail?.id && (
            <div className="border-t border-slate-200 p-4 space-y-4">
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void act(`/conversations/${id}/messages`, { body: f.get('body') });
                  e.currentTarget.reset();
                }}
              >
                <Input
                  name="body"
                  aria-label="Resposta do atendente"
                  placeholder="Resposta do atendente"
                  required
                />
                <Button disabled={busy || detail.status === 'OPT_OUT'}>
                  {detail.channel === 'WHATSAPP' ? 'Enviar WhatsApp' : 'Enviar simulação'}
                </Button>
              </form>
              {detail.channel !== 'WHATSAPP' && (
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void act('/webhooks/mock/simulate', {
                      contactId: detail.contactId,
                      body: f.get('body'),
                    });
                    e.currentTarget.reset();
                  }}
                >
                  <Input
                    name="body"
                    aria-label="Simular resposta"
                    placeholder="Simular resposta: SIM, SAIR…"
                    required
                  />
                  <Button disabled={busy} variant="outline">
                    Simular
                  </Button>
                </form>
              )}
            </div>
          )}
        </section>
        <aside className="p-5 border-l border-slate-200 bg-white text-sm">
          {detail?.id && (
            <>
              <h3 className="font-medium mb-4">Dados do lead</h3>
              <p className="text-slate-500">{detail.contact.maskedValue}</p>
              <p className="text-slate-500 mt-2">CPF ***.***.*{detail.lead.cpfLast4}</p>
              <p className="my-4">{detail.lead.organization}</p>
              <label className="text-xs text-slate-500">
                Status
                <select
                  className="w-full bg-slate-50 border border-slate-200 rounded p-2 mt-2 mb-4"
                  value={detail.status}
                  onChange={(e) =>
                    void act(`/conversations/${id}`, { status: e.target.value }, 'PATCH')
                  }
                >
                  {[
                    'NEW',
                    'INTERESTED',
                    'NOT_INTERESTED',
                    'QUALIFYING',
                    'QUALIFIED',
                    'WAITING_HUMAN',
                    'OPT_OUT',
                    'CLOSED',
                  ].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-slate-500">
                Atribuir atendente
                <select
                  className="w-full bg-slate-50 border border-slate-200 rounded p-2 mt-2 mb-4"
                  defaultValue=""
                  onChange={(e) =>
                    void act(`/conversations/${id}/assign`, { userId: e.target.value })
                  }
                >
                  <option value="" disabled>
                    Selecionar
                  </option>
                  {users?.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void act(
                    `/conversations/${id}`,
                    { note: new FormData(e.currentTarget).get('note') },
                    'PATCH',
                  );
                }}
              >
                <label className="text-xs text-slate-500">
                  Nota / sugestão do bot
                  <textarea
                    key={`${id}-${detail.note}`}
                    name="note"
                    defaultValue={detail.note ?? ''}
                    className="w-full h-32 p-2 bg-slate-50 rounded border border-slate-200 mt-2"
                  />
                </label>
                <Button className="my-3" size="sm" variant="outline" disabled={busy}>
                  Salvar nota
                </Button>
              </form>
              <Button
                variant="destructive"
                size="sm"
                disabled={busy}
                onClick={() => {
                  if (window.confirm('Bloquear este contato?'))
                    void act('/suppressions', {
                      contactId: detail.contactId,
                      reason: 'MANUAL',
                      source: 'Atendimento',
                    });
                }}
              >
                Bloquear contato
              </Button>
            </>
          )}
        </aside>
      </div>
    </>
  );
}

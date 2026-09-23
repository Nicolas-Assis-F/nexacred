'use client';
import { useEffect, useState } from 'react';
import { Title, DataTable, ErrorBox, useResource, Row, Field, Select } from '@/components/resource';
import { Status } from '@/components/status';
import { Card, Button } from '@/components/ui';
import Link from 'next/link';
import { api } from '@/lib/client';
type Option = { id: string; name: string; channel?: string };
export default function Campaigns() {
  const { data, error, load } = useResource<Row[]>('/campaigns', 4000);
  const { data: segments } = useResource<Option[]>('/segments');
  const { data: templates } = useResource<Option[]>('/templates');
  const [selected, setSelected] = useState<Row>();
  const [preview, setPreview] = useState<Row>();
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [channel, setChannel] = useState('WHATSAPP');
  const matchingTemplates = (templates ?? []).filter((t) => t.channel === channel);
  const selectedId = selected?.id;
  useEffect(() => {
    if (selectedId) {
      const latest = data?.find((c) => c.id === selectedId);
      if (latest) setSelected(latest);
    }
  }, [data, selectedId]);
  async function action(type: string) {
    if (!selected) return;
    setBusy(true);
    setActionError('');
    try {
      const result = await api<Row>(`/campaigns/${selected.id}/${type}`, {});
      if (type === 'preview') setPreview(result);
      else {
        setSelected(result);
        await load();
      }
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Title
        title="Campanhas"
        subtitle="Configure o público, revise a elegibilidade e confirme o início."
      />
      <Card className="p-6 mb-6">
        <div className="flex gap-3 mb-6 text-xs text-slate-500">
          <span className="text-teal-700">01 Configuração</span>
          <span>→</span>
          <span>02 Preview</span>
          <span>→</span>
          <span>03 Aprovação</span>
          <span>→</span>
          <span>04 Confirmação</span>
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setActionError('');
            try {
              const f = Object.fromEntries(new FormData(e.currentTarget));
              const body = {
                ...f,
                requireConsent: true,
                hourlyLimit: Number(f.hourlyLimit),
                dailyLimit: Number(f.dailyLimit),
                allowedStartHour: Number(f.allowedStartHour),
                allowedEndHour: Number(f.allowedEndHour),
              };
              const c = await api<Row>('/campaigns', body);
              setSelected(c);
              setPreview(await api<Row>(`/campaigns/${c.id}/preview`, {}));
              await load();
            } catch (e) {
              setActionError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="grid md:grid-cols-3 gap-4">
            <Field label="Nome da campanha" name="name" />
            <label className="block text-sm text-slate-500">
              Canal
              <select
                name="channel"
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white p-2.5"
              >
                <option value="WHATSAPP">WhatsApp · envio real</option>
                <option value="SMS">SMS · simulação</option>
                <option value="EMAIL">E-mail · simulação</option>
              </select>
            </label>
            <Select label="Segmento" name="segmentId" options={segments ?? []} />
            <Select
              key={channel}
              label="Template do canal"
              name="templateId"
              options={matchingTemplates.map((t) => ({ ...t, name: `${t.name} · ${t.channel}` }))}
            />
            <Field label="Máximo por hora" name="hourlyLimit" type="number" value={5} />
            <Field label="Máximo em 24 horas" name="dailyLimit" type="number" value={20} />
            <Field
              label="Hora inicial (Brasília)"
              name="allowedStartHour"
              type="number"
              value={9}
            />
            <Field label="Hora final (Brasília)" name="allowedEndHour" type="number" value={18} />
          </div>
          {!matchingTemplates.length && (
            <p className="mt-4 text-sm text-slate-500">
              Crie um{' '}
              <Link className="text-teal-700 underline" href="/templates">
                template para este canal
              </Link>{' '}
              antes de continuar.
            </p>
          )}
          <Button
            disabled={busy || !segments?.length || !matchingTemplates.length}
            className="mt-5"
          >
            Criar rascunho e visualizar elegibilidade
          </Button>
        </form>
      </Card>
      <ErrorBox error={actionError || error} />
      {selected && (
        <Card className="p-6 mb-6 border-teal-200">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">{String(selected.name)}</h2>
            <Status value={String(selected.status)} />
          </div>
          {preview && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 my-5">
              {Object.entries(preview).map(([key, value]) => (
                <div
                  key={key}
                  className={`p-3 rounded-lg ${key === 'eligible' ? 'bg-teal-50 border border-teal-100' : 'bg-slate-50'}`}
                >
                  <p className="text-xs text-slate-500">
                    {(
                      {
                        totalSegmented: 'Leads encontrados',
                        totalContacts: 'Contatos',
                        suppressed: 'Suprimidos',
                        withoutConsent: 'Sem autorização',
                        invalid: 'Inválidos',
                        duplicate: 'Duplicados',
                        eligible: 'Elegíveis',
                      } as Record<string, string>
                    )[key] ?? key}
                  </p>
                  <p className="text-xl mt-2">{String(value)}</p>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-3 flex-wrap my-4">
            <Button variant="outline" disabled={busy} onClick={() => void action('preview')}>
              Atualizar preview
            </Button>
            {selected.status === 'DRAFT' && (
              <Button disabled={busy} onClick={() => void action('approve')}>
                Aprovar campanha
              </Button>
            )}
            {selected.status === 'RUNNING' && (
              <Button disabled={busy} variant="outline" onClick={() => void action('pause')}>
                Pausar
              </Button>
            )}
            {!['CANCELLED', 'COMPLETED'].includes(String(selected.status)) && (
              <Button
                disabled={busy}
                variant="destructive"
                onClick={() => {
                  if (window.confirm('Cancelar esta campanha?')) void action('cancel');
                }}
              >
                Cancelar
              </Button>
            )}
          </div>
          {['APPROVED', 'PAUSED'].includes(String(selected.status)) && (
            <div className="border-t border-slate-200 pt-5">
              <label className="flex gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={confirm}
                  onChange={(e) => setConfirm(e.target.checked)}
                />
                Confirmo o público e autorizo o início desta campanha{' '}
                {selected.channel === 'WHATSAPP'
                  ? 'com envio real pelo WhatsApp conectado'
                  : 'em modo de simulação'}
                .
              </label>
              <Button
                className="mt-4"
                disabled={busy || !confirm}
                onClick={() => {
                  setConfirm(false);
                  void action('start');
                }}
              >
                Confirmar e iniciar campanha
              </Button>
            </div>
          )}
        </Card>
      )}
      <DataTable
        rows={data ?? []}
        columns={[
          ['name', 'Campanha'],
          ['channel', 'Canal'],
          ['status', 'Status'],
          ['hourlyLimit', 'Por hora'],
          ['dailyLimit', 'Em 24 h'],
        ]}
        onClick={(r) => {
          setSelected(r);
          setPreview(undefined);
          setConfirm(false);
        }}
      />
    </>
  );
}

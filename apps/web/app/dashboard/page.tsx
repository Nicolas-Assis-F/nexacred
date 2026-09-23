'use client';
import Link from 'next/link';
import { useState } from 'react';
import {
  ArrowUpRight,
  ArrowRight,
  Users,
  Send,
  MessageCircle,
  UploadCloud,
  CheckCheck,
  Activity,
  RefreshCw,
  FileSpreadsheet,
  ShieldCheck,
  FlaskConical,
  CalendarDays,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Pie,
  PieChart,
  Cell,
} from 'recharts';
import { Button, Card } from '@/components/ui';
import { ErrorBox, useResource } from '@/components/resource';
import { Status } from '@/components/status';
interface Dashboard {
  totals: Record<string, number>;
  rates: { delivery: number | null; failure: number | null; importValidity: number | null };
  daily: Array<{ day: string; sent: number; delivered: number; failed: number; responses: number }>;
  recentCampaigns: Array<{
    id: string;
    name: string;
    channel: string;
    status: string;
    _count: { recipients: number; messages: number };
  }>;
  recentImports: Array<{
    id: string;
    filename: string;
    status: string;
    processedRows: number;
    invalidRows: number;
  }>;
  importSummary: {
    total: number;
    processedRows: number | null;
    validRows: number | null;
    invalidRows: number | null;
    duplicateRows: number | null;
  };
  conversationStatuses: Array<{ status: string; count: number }>;
  generatedAt: string;
}
const number = (n: number | undefined | null) => (n ?? 0).toLocaleString('pt-BR');
const pct = (n: number | null | undefined) =>
  n === null || n === undefined
    ? '—'
    : n.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
export default function DashboardPage() {
  const [days, setDays] = useState(30);
  const { data, error, load } = useResource<Dashboard>('/dashboard?days=' + days, 15000);
  const t = data?.totals;
  const slices = [
    { name: 'Entregues', value: t?.delivered ?? 0, color: '#137d72' },
    { name: 'Aguardando entrega', value: (t?.sent ?? 0) - (t?.delivered ?? 0), color: '#b3dcc6' },
    { name: 'Na fila', value: t?.queued ?? 0, color: '#e3c483' },
    { name: 'Falhas', value: t?.failed ?? 0, color: '#dc8c85' },
  ];
  const hasMessages = slices.some((s) => s.value > 0);
  const convoConfig: Array<[string, string, string]> = [
    ['NEW', 'Novas', '#94a3b8'],
    ['INTERESTED', 'Interessados', '#0f766e'],
    ['QUALIFYING', 'Em qualificação', '#0891b2'],
    ['QUALIFIED', 'Qualificados', '#15803d'],
    ['WAITING_HUMAN', 'Aguardando atendente', '#b45309'],
    ['NOT_INTERESTED', 'Sem interesse', '#a1a1aa'],
    ['OPT_OUT', 'Opt-out', '#dc2626'],
    ['CLOSED', 'Encerradas', '#64748b'],
  ];
  const convoMap = new Map((data?.conversationStatuses ?? []).map((c) => [c.status, c.count]));
  const convoRows = convoConfig
    .map(([key, label, color]) => ({ label, color, count: convoMap.get(key) ?? 0 }))
    .filter((r) => r.count > 0);
  const convoTotal = convoRows.reduce((sum, r) => sum + r.count, 0);
  const convoMax = Math.max(1, ...convoRows.map((r) => r.count));
  const responseRate =
    t && t.sent ? Math.min(100, ((t.responses ?? 0) / t.sent) * 100) : null;
  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="eyebrow mb-2">Seu workspace, em números</div>
          <h1 className="text-[28px] font-semibold tracking-tight">
            Visão geral<span className="text-teal-600">.</span>
          </h1>
          <p className="mt-1.5 text-[13px] text-slate-500">
            Um olhar sobre seus leads, campanhas e oportunidades de conversa.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            aria-label="Atualizar dashboard"
          >
            <RefreshCw size={14} />
          </Button>
          <Button asChild>
            <Link href="/campaigns">
              <Send size={14} />
              Criar campanha
            </Link>
          </Button>
        </div>
      </section>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="size-1.5 rounded-full bg-teal-600" />
          Dados do seu workspace<span className="hidden md:inline text-slate-300">|</span>
          <span className="hidden md:inline">
            {data
              ? 'Atualizado às ' +
                new Date(data.generatedAt).toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : 'Conectando…'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <CalendarDays size={14} className="text-slate-400" />
          <div className="inline-flex gap-1 rounded-lg border border-slate-200 bg-white p-1">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                aria-pressed={days === d}
                onClick={() => setDays(d)}
                className={`rounded-md px-3 py-1.5 text-xs ${days === d ? 'bg-[#e5f2ed] font-semibold text-teal-800' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                {d} dias
              </button>
            ))}
          </div>
        </div>
      </div>
      <ErrorBox error={error} />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          {
            label: 'Base de leads',
            value: t?.totalLeads,
            detail: number(t?.eligibleLeads) + ' com consentimento ativo',
            icon: Users,
            accent: true,
          },
          {
            label: 'Mensagens enviadas',
            value: t?.sent,
            detail: 'No período selecionado · todos os canais',
            icon: Send,
          },
          {
            label: 'Taxa de entrega',
            text: pct(data?.rates.delivery),
            detail: number(t?.delivered) + ' mensagens entregues',
            icon: CheckCheck,
          },
          {
            label: 'Respostas recebidas',
            value: t?.responses,
            detail: number(t?.interested) + ' conversas com interesse na base',
            icon: MessageCircle,
          },
        ].map(({ label, value, text, detail, icon: Icon, accent }) => (
          <Card
            key={label}
            className={`relative overflow-hidden p-5 ${accent ? '!bg-[#163c38] !border-[#163c38] text-white' : ''}`}
          >
            <div className="flex items-center justify-between">
              <p className={`text-xs font-medium ${accent ? 'text-[#c1d9cf]' : 'text-slate-500'}`}>
                {label}
              </p>
              <span
                className={`grid size-8 place-items-center rounded-lg ${accent ? 'bg-white/10 text-[#b7f7d5]' : 'bg-slate-50 text-slate-400'}`}
              >
                <Icon size={16} />
              </span>
            </div>
            <div className="metric-number my-4 text-[34px] font-semibold leading-none">
              {data ? (
                (text ?? number(value))
              ) : (
                <span className="block h-8 w-20 animate-pulse rounded bg-slate-300/30" />
              )}
            </div>
            <p
              className={`text-[10px] leading-relaxed ${accent ? 'text-[#94b5a8]' : 'text-slate-400'}`}
            >
              {detail}
            </p>
            {accent && (
              <div className="pointer-events-none absolute -right-7 -bottom-10 size-28 rounded-full border-[16px] border-white/[.04]" />
            )}
          </Card>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.9fr)_minmax(290px,1fr)]">
        <Card className="p-5 md:p-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-sm font-semibold">Atividade de mensagens</h2>
              <p className="mt-1 text-[11px] text-slate-400">Volume diário · horário de Brasília</p>
            </div>
            <span className="rounded-md bg-slate-50 px-2 py-1 text-[10px] text-slate-500">
              Últimos {days} dias
            </span>
          </div>
          <div className="mt-5 flex flex-wrap gap-5 text-[10px] text-slate-500">
            {[
              ['Enviadas', '#137d72'],
              ['Entregues', '#8abfa8'],
              ['Respostas', '#b39761'],
            ].map(([label, color]) => (
              <span key={label} className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full" style={{ background: color }} />
                {label}
              </span>
            ))}
          </div>
          <div className="mt-5 h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={data?.daily ?? []}
                margin={{ left: -28, right: 4, top: 8, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="sendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#137d72" stopOpacity={0.15} />
                    <stop offset="100%" stopColor="#137d72" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#edf1f3" vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="day"
                  axisLine={false}
                  tickLine={false}
                  minTickGap={30}
                  tick={{ fill: '#8b9ca4', fontSize: 10 }}
                  tickFormatter={(v) => String(v).slice(8, 10) + '/' + String(v).slice(5, 7)}
                />
                <YAxis
                  allowDecimals={false}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#8b9ca4', fontSize: 10 }}
                />
                <Tooltip
                  labelFormatter={(v) => String(v).split('-').reverse().join('/')}
                  contentStyle={{ borderRadius: 12, border: '1px solid #e2e9ec', fontSize: 12 }}
                />
                <Area
                  type="monotone"
                  name="Enviadas"
                  dataKey="sent"
                  stroke="#137d72"
                  strokeWidth={2.5}
                  fill="url(#sendFill)"
                />
                <Area
                  type="monotone"
                  name="Entregues"
                  dataKey="delivered"
                  stroke="#8abfa8"
                  strokeWidth={1.5}
                  fill="transparent"
                />
                <Area
                  type="monotone"
                  name="Respostas"
                  dataKey="responses"
                  stroke="#b39761"
                  strokeWidth={1.5}
                  fill="transparent"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {data && !hasMessages && (
            <p className="text-center text-[11px] text-slate-400">
              Sem mensagens neste período. Inicie uma campanha para acompanhar a evolução.
            </p>
          )}
        </Card>
        <Card className="p-6">
          <h2 className="text-sm font-semibold">Distribuição de envios</h2>
          <p className="mt-1 text-[11px] text-slate-400">Status atual das mensagens do período</p>
          <div className="relative mx-auto h-[195px] max-w-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={hasMessages ? slices : [{ name: 'Sem envios', value: 1, color: '#edf2f0' }]}
                  innerRadius={61}
                  outerRadius={77}
                  paddingAngle={hasMessages ? 4 : 0}
                  dataKey="value"
                  stroke="none"
                >
                  {(hasMessages ? slices : [{ color: '#edf2f0' }]).map((s, i) => (
                    <Cell key={i} fill={s.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
              <span className="metric-number text-[28px] font-semibold">
                {data ? number((t?.sent ?? 0) + (t?.failed ?? 0) + (t?.queued ?? 0)) : '—'}
              </span>
              <span className="text-[10px] text-slate-400">mensagens</span>
            </div>
          </div>
          <div className="space-y-3">
            {slices.map((s) => (
              <div key={s.name} className="flex items-center gap-2 text-xs">
                <span className="size-2 rounded-full" style={{ background: s.color }} />
                <span className="text-slate-500">{s.name}</span>
                <span className="ml-auto font-medium">{number(s.value)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.9fr)_minmax(290px,1fr)]">
        <Card className="p-5 md:p-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-sm font-semibold">Funil de conversas</h2>
              <p className="mt-1 text-[11px] text-slate-400">
                Como as respostas evoluem no atendimento
              </p>
            </div>
            <span className="rounded-md bg-slate-50 px-2 py-1 text-[10px] text-slate-500">
              {number(convoTotal)} conversas
            </span>
          </div>
          {convoRows.length ? (
            <div className="mt-5 space-y-3">
              {convoRows.map((r) => (
                <div key={r.label} className="flex items-center gap-3">
                  <span className="w-40 shrink-0 text-xs text-slate-500">{r.label}</span>
                  <div className="h-6 flex-1 overflow-hidden rounded-md bg-slate-100">
                    <div
                      className="flex h-full items-center rounded-md px-2 text-[10px] font-semibold text-white"
                      style={{
                        width: Math.max(8, (r.count / convoMax) * 100) + '%',
                        background: r.color,
                      }}
                    >
                      {number(r.count)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-6 grid place-items-center py-10 text-center">
              <MessageCircle size={22} className="mb-3 text-slate-300" />
              <p className="text-xs text-slate-400">
                As conversas aparecem aqui assim que os leads respondem.
              </p>
            </div>
          )}
        </Card>
        <Card className="p-6">
          <div className="flex items-center gap-2">
            <ShieldCheck size={17} className="text-teal-600" />
            <h2 className="text-sm font-semibold">Sinais de compliance</h2>
          </div>
          <p className="mt-1 mb-5 text-[11px] text-slate-400">
            Consentimento, opt-out e taxa de resposta
          </p>
          <div className="space-y-4">
            {[
              {
                label: 'Leads elegíveis',
                value: number(t?.eligibleLeads),
                hint: 'com contato válido e consentimento',
              },
              {
                label: 'Pedidos de saída (opt-out)',
                value: number(t?.optOuts),
                hint: 'no período · viram supressão imediata',
              },
              {
                label: 'Taxa de resposta',
                value: pct(responseRate),
                hint: number(t?.responses) + ' respostas recebidas',
              },
            ].map((row) => (
              <div key={row.label} className="rounded-xl bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-500">{row.label}</p>
                  <p className="metric-number text-lg font-semibold">{row.value}</p>
                </div>
                <p className="mt-1 text-[10px] text-slate-400">{row.hint}</p>
              </div>
            ))}
          </div>
          <Link
            href="/suppressions"
            className="mt-5 flex items-center justify-between text-xs font-medium text-teal-700"
          >
            Ver lista de supressões
            <ArrowRight size={14} />
          </Link>
        </Card>
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.9fr)_minmax(290px,1fr)]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between p-6">
            <div>
              <h2 className="text-sm font-semibold">Campanhas recentes</h2>
              <p className="mt-1 text-[11px] text-slate-400">Acompanhe o andamento da operação</p>
            </div>
            <Link
              href="/campaigns"
              className="flex items-center gap-1 text-[11px] font-medium text-teal-700"
            >
              Ver todas
              <ArrowUpRight size={13} />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-y border-slate-100 bg-slate-50/60 text-[10px] uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-6 py-3 font-medium">Campanha</th>
                  <th className="px-3 py-3 font-medium">Canal</th>
                  <th className="px-3 py-3 font-medium">Destinatários</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data?.recentCampaigns.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                  >
                    <td className="px-6 py-4">
                      <Link href="/campaigns" className="font-medium">
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-3 py-4 text-slate-500">
                      {c.channel === 'EMAIL' ? 'E-mail' : 'SMS'}
                      <span className="block text-[9px] text-slate-400">Mock</span>
                    </td>
                    <td className="px-3 py-4 text-slate-500">{number(c._count.recipients)}</td>
                    <td className="px-6 py-4">
                      <Status value={c.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data && !data.recentCampaigns.length && (
            <div className="px-6 py-10 text-center">
              <Activity size={24} className="mx-auto mb-3 text-slate-300" />
              <p className="text-xs text-slate-400">Sua primeira campanha começa por aqui.</p>
              <Link
                className="mt-3 inline-block text-xs text-teal-700 font-medium"
                href="/campaigns"
              >
                Criar campanha →
              </Link>
            </div>
          )}
        </Card>
        <Card className="p-6">
          <div className="flex items-center gap-2">
            <ShieldCheck size={17} className="text-teal-600" />
            <h2 className="text-sm font-semibold">Qualidade da base</h2>
          </div>
          <p className="mt-1 mb-5 text-[11px] text-slate-400">
            Importações nos últimos {days} dias
          </p>
          <div className="flex justify-between items-end">
            <span className="metric-number text-[30px] font-semibold">
              {pct(data?.rates.importValidity)}
            </span>
            <span className="pb-1 text-[10px] text-slate-400">linhas válidas</span>
          </div>
          <div className="mt-3 mb-5 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-teal-600"
              style={{ width: (data?.rates.importValidity ?? 0) + '%' }}
            />
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              ['Processadas', data?.importSummary.processedRows],
              ['Inválidas', data?.importSummary.invalidRows],
              ['Duplicadas', data?.importSummary.duplicateRows],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg bg-slate-50 py-3">
                <p className="text-base font-semibold">{number(Number(value ?? 0))}</p>
                <p className="mt-1 text-[9px] text-slate-400">{label}</p>
              </div>
            ))}
          </div>
          <Link
            href="/imports"
            className="mt-5 flex justify-between items-center text-xs font-medium text-teal-700"
          >
            Revisar importações
            <ArrowRight size={14} />
          </Link>
        </Card>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {[
          {
            href: '/imports',
            icon: UploadCloud,
            title: 'Traga seus leads',
            text: 'Importe uma base XLSB e acompanhe cada etapa.',
          },
          {
            href: '/testing',
            icon: FlaskConical,
            title: 'Teste a conexão',
            text: 'Conecte uma sessão e valide o envio de teste.',
          },
          {
            href: '/conversations',
            icon: FileSpreadsheet,
            title: 'Continue a conversa',
            text: 'Organize respostas e encaminhe para atendimento.',
          },
        ].map(({ href, icon: Icon, title, text }) => (
          <Link
            key={href}
            href={href}
            className="group panel flex gap-4 p-5 hover:!border-teal-300 transition"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#ebf3ef] text-teal-700">
              <Icon size={19} />
            </span>
            <div>
              <h3 className="text-xs font-semibold flex gap-3 items-center">
                {title}
                <ArrowUpRight size={12} className="text-slate-400 group-hover:text-teal-700" />
              </h3>
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{text}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

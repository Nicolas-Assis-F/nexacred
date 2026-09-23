import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Check,
  CheckCheck,
  FileSpreadsheet,
  Fingerprint,
  Layers3,
  LockKeyhole,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react';
export const metadata = {
  title: 'NexaCred — Sua operação conectada. Cada conversa importa.',
  description:
    'Organize leads, conecte seu WhatsApp e acompanhe campanhas com consentimento, segurança e visibilidade.',
  openGraph: {
    title: 'NexaCred — Cada conversa importa',
    description: 'Dados organizados. Relacionamentos que avançam.',
    locale: 'pt_BR',
    type: 'website',
  },
};
export default async function Home() {
  if ((await cookies()).has('nexacred_token')) redirect('/dashboard');
  return (
    <div className="marketing">
      <nav
        className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 md:px-10"
        aria-label="Navegação principal"
      >
        <Link href="/" className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
          <span className="grid size-9 place-items-center rounded-xl bg-[#163c38] text-[#b7f7d5]">
            <Zap size={22} fill="currentColor" />
          </span>
          nexacred<span className="-ml-2 text-teal-700">.</span>
        </Link>
        <div className="hidden gap-8 text-sm text-slate-500 md:flex">
          <a href="#plataforma">Plataforma</a>
          <a href="#seguranca">Segurança</a>
          <a href="#perguntas">Perguntas frequentes</a>
        </div>
        <Link
          href="/login"
          className="flex items-center gap-2 rounded-full bg-[#163c38] px-5 py-2.5 text-sm font-medium text-white"
        >
          Entrar <ArrowUpRight size={16} />
        </Link>
      </nav>
      <main>
        <section className="mx-auto grid max-w-7xl items-center gap-12 px-6 pb-20 pt-14 md:px-10 lg:grid-cols-[1.05fr_1fr] lg:pb-28 lg:pt-20">
          <div>
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-teal-100 bg-teal-50 px-3.5 py-2 text-xs font-medium text-teal-800">
              <span className="size-1.5 rounded-full bg-teal-600" />
              Da sua base à próxima boa conversa
            </div>
            <h1 className="max-w-xl text-5xl font-semibold leading-[1.08] tracking-[-.055em] md:text-[68px]">
              Sua operação
              <br />
              conectada.
              <br />
              <span className="text-teal-700">
                Cada conversa
                <br className="hidden sm:block" /> importa.
              </span>
            </h1>
            <p className="mt-7 max-w-md text-base leading-7 text-slate-500">
              Transforme dados dispersos em relacionamentos organizados. Leads, WhatsApp e campanhas
              em uma plataforma feita para a sua equipe.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                href="/login"
                className="flex items-center gap-3 rounded-xl bg-[#163c38] px-6 py-3.5 text-sm font-medium text-white shadow-lg shadow-teal-900/10"
              >
                Acessar minha operação <ArrowRight size={17} />
              </Link>
              <a
                href="#plataforma"
                className="flex items-center gap-2 rounded-xl border border-slate-200 px-5 py-3.5 text-sm font-medium"
              >
                Conhecer a plataforma
              </a>
            </div>
            <div className="mt-8 flex flex-wrap gap-5 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <Check size={14} className="text-teal-700" />
                Consentimento por canal
              </span>
              <span className="flex items-center gap-1.5">
                <Check size={14} className="text-teal-700" />
                Dados protegidos
              </span>
            </div>
          </div>
          <div className="relative py-6 lg:py-12">
            <div className="absolute inset-0 rounded-[40px] bg-[#e8f0e7]" />
            <div className="relative ml-4 overflow-hidden rounded-2xl border border-white bg-white shadow-2xl shadow-[#163c38]/10 sm:ml-8">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <span className="flex items-center gap-2 text-xs font-semibold">
                  <Zap size={15} className="text-teal-700" />
                  Visão da operação
                </span>
                <span className="rounded-full bg-teal-50 px-2 py-1 text-[10px] text-teal-700">
                  Exemplo ilustrativo
                </span>
              </div>
              <div className="p-5 sm:p-7">
                <p className="text-xs text-slate-500">Sua equipe, um passo à frente.</p>
                <p className="mt-2 text-xl font-semibold tracking-tight">
                  Menos planilhas. Mais contexto.
                </p>
                <div className="mt-6 grid grid-cols-3 gap-2">
                  {[
                    ['Leads', '2.480'],
                    ['Conversas', '128'],
                    ['Entregas', '96,8%'],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-slate-100 p-3">
                      <p className="text-[10px] text-slate-500">{label}</p>
                      <p className="mt-2 text-xl font-semibold tracking-tight">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-6 rounded-xl bg-[#f5f8f5] px-4 pb-3 pt-5">
                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <span>Relacionamentos em evolução</span>
                    <span>30 dias</span>
                  </div>
                  <svg
                    viewBox="0 0 400 130"
                    className="mt-3 w-full"
                    role="img"
                    aria-label="Gráfico ilustrativo de evolução"
                  >
                    <defs>
                      <linearGradient id="hero-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop stopColor="#87c5a7" stopOpacity=".4" />
                        <stop offset="1" stopColor="#87c5a7" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M0 105 C30 105 25 82 60 85 S100 110 130 65 S175 90 205 50 S235 70 265 35 S295 60 330 22 S370 35 400 8 V130 H0Z"
                      fill="url(#hero-fill)"
                    />
                    <path
                      d="M0 105 C30 105 25 82 60 85 S100 110 130 65 S175 90 205 50 S235 70 265 35 S295 60 330 22 S370 35 400 8"
                      stroke="#267568"
                      strokeWidth="3"
                      fill="none"
                    />
                  </svg>
                  <div className="flex justify-between text-[9px] text-slate-400">
                    <span>01 SET</span>
                    <span>15 SET</span>
                    <span>30 SET</span>
                  </div>
                </div>
                <div className="mt-5 flex items-center gap-3 rounded-xl border border-slate-100 p-3">
                  <span className="grid size-9 place-items-center rounded-full bg-[#e8f0e7] text-teal-700">
                    <Users size={17} />
                  </span>
                  <div className="flex-1">
                    <p className="text-xs font-medium">Público revisado e autorizado</p>
                    <p className="mt-1 text-[10px] text-slate-500">
                      Sua próxima campanha começa com confiança.
                    </p>
                  </div>
                  <ShieldCheck size={18} className="text-teal-700" />
                </div>
              </div>
            </div>
            <div className="relative -mt-6 mr-10 flex w-fit items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-xl shadow-[#163c38]/10">
              <span className="grid size-10 place-items-center rounded-xl bg-[#dff5e8] text-teal-700">
                <MessageCircle size={22} />
              </span>
              <div>
                <p className="text-xs font-semibold">WhatsApp conectado</p>
                <p className="mt-1 flex items-center gap-1 text-[10px] text-slate-500">
                  Pronto para boas conversas <CheckCheck size={13} className="text-teal-700" />
                </p>
              </div>
            </div>
          </div>
        </section>
        <section className="border-y border-slate-200 bg-white">
          <div className="mx-auto grid max-w-7xl gap-5 px-6 py-7 text-sm text-slate-500 sm:grid-cols-3 md:px-10">
            {[
              [FileSpreadsheet, 'Da importação ao atendimento'],
              [MessageCircle, 'WhatsApp conectado por QR'],
              [ShieldCheck, 'Controle em cada etapa'],
            ].map(([Icon, label]) => {
              const Symbol = Icon as typeof Zap;
              return (
                <p key={String(label)} className="flex items-center justify-center gap-3">
                  <Symbol size={19} className="text-teal-700" />
                  {String(label)}
                </p>
              );
            })}
          </div>
        </section>
        <section id="plataforma" className="mx-auto max-w-7xl px-6 py-24 md:px-10">
          <p className="eyebrow text-teal-700">UMA OPERAÇÃO. TODAS AS ETAPAS.</p>
          <div className="mb-10 mt-4 flex flex-wrap items-end justify-between gap-6">
            <h2 className="max-w-xl text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
              Seu time cuida das pessoas.
              <br />O NexaCred organiza o caminho.
            </h2>
            <p className="max-w-sm text-sm leading-6 text-slate-500">
              Do primeiro registro ao histórico de atendimento, cada etapa fica visível para quem
              precisa agir.
            </p>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {[
              [
                FileSpreadsheet,
                '01',
                'Sua base, organizada',
                'Importe planilhas, normalize contatos e encontre duplicidades. Menos trabalho manual para começar.',
              ],
              [
                Layers3,
                '02',
                'O público certo',
                'Crie segmentos e revise quem está elegível. Consentimentos e bloqueios acompanham cada contato.',
              ],
              [
                MessageCircle,
                '03',
                'Conversas que avançam',
                'Conecte o WhatsApp e acompanhe campanhas e atendimento com o histórico reunido.',
              ],
              [
                BarChart3,
                '04',
                'Clareza para decidir',
                'Acompanhe entregas, respostas e o andamento da operação em um painel de indicadores.',
              ],
              [
                Fingerprint,
                '05',
                'Autorização com contexto',
                'Registre a origem, a data e a evidência de cada consentimento, por finalidade e canal.',
              ],
              [
                ShieldCheck,
                '06',
                'Controle para crescer',
                'Permissões por perfil, registros de auditoria e bloqueio de novos envios após um pedido de saída.',
              ],
            ].map(([Icon, n, title, text]) => {
              const Symbol = Icon as typeof Zap;
              return (
                <article
                  key={String(n)}
                  className="panel p-7 transition hover:-translate-y-1 hover:shadow-lg"
                >
                  <div className="mb-8 flex items-center justify-between">
                    <span className="rounded-xl bg-teal-50 p-3 text-teal-700">
                      <Symbol size={23} />
                    </span>
                    <span className="text-xs text-slate-400">{String(n)}</span>
                  </div>
                  <h3 className="text-lg font-semibold tracking-tight">{String(title)}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-500">{String(text)}</p>
                </article>
              );
            })}
          </div>
        </section>
        <section id="seguranca" className="mx-auto max-w-7xl px-6 md:px-10">
          <div className="channel-hero grid gap-10 rounded-3xl p-8 text-white md:grid-cols-2 md:p-14">
            <div>
              <LockKeyhole size={30} className="mb-7 text-[#b7f7d5]" />
              <p className="text-xs tracking-widest text-[#b7f7d5]">CONFIANÇA DESDE A BASE</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">
                Relacionamentos merecem cuidado. Dados também.
              </h2>
            </div>
            <div className="space-y-6">
              {[
                [
                  'Proteção de dados',
                  'CPF e contatos cifrados, com informações mascaradas na operação diária.',
                ],
                [
                  'Cada envio tem critérios',
                  'Consentimento, supressões, frequência e limites verificados antes de enviar.',
                ],
                [
                  'Rastreabilidade para sua equipe',
                  'Ações sensíveis registradas e acesso conforme o perfil de cada pessoa.',
                ],
              ].map(([title, text]) => (
                <div key={title} className="flex gap-4">
                  <Check className="mt-1 shrink-0 text-[#b7f7d5]" size={18} />
                  <div>
                    <h3 className="font-medium">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-[#afc9c3]">{text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section id="perguntas" className="mx-auto max-w-3xl px-6 py-24">
          <p className="eyebrow mb-4 text-center">BOM SABER ANTES DE COMEÇAR</p>
          <h2 className="mb-10 text-center text-3xl font-semibold tracking-tight">
            Tudo começa com clareza.
          </h2>
          {[
            [
              'Preciso cadastrar números no servidor?',
              'Não. Para um teste, digite o telefone na Central WhatsApp e confirme a autorização. Para campanhas, use os contatos importados com consentimento registrado.',
            ],
            [
              'Como conecto meu WhatsApp?',
              'Abra a Central WhatsApp, clique em conectar e escaneie o QR em Aparelhos conectados. A sessão fica salva para os próximos acessos.',
            ],
            [
              'A importação autoriza o envio de campanhas?',
              'Não. O consentimento deve ser registrado separadamente, com canal, finalidade, data e referência da autorização.',
            ],
            [
              'O que acontece quando alguém responde SAIR?',
              'O contato é bloqueado para novos envios. Importar a mesma pessoa novamente não remove a supressão.',
            ],
          ].map(([q, a]) => (
            <details key={q} className="border-b border-slate-200 py-5">
              <summary className="cursor-pointer text-sm font-semibold">{q}</summary>
              <p className="mt-3 text-sm leading-7 text-slate-500">{a}</p>
            </details>
          ))}
        </section>
        <section className="bg-[#e8f0e7] px-6 py-16 text-center">
          <Sparkles size={24} className="mx-auto mb-5 text-teal-700" />
          <h2 className="text-3xl font-semibold tracking-tight">
            Sua próxima boa conversa começa aqui.
          </h2>
          <p className="mt-4 text-sm text-slate-500">
            Dê à sua operação o espaço que ela precisa para avançar.
          </p>
          <Link
            href="/login"
            className="mx-auto mt-7 inline-flex items-center gap-3 rounded-xl bg-[#163c38] px-6 py-3.5 text-sm font-medium text-white"
          >
            Entrar no NexaCred <ArrowRight size={17} />
          </Link>
        </section>
      </main>
      <footer className="mx-auto flex max-w-7xl flex-wrap justify-between gap-4 px-6 py-8 text-xs text-slate-500 md:px-10">
        <span className="font-semibold">
          nexacred. <span className="ml-2 font-normal">Relacionamentos com mais controle.</span>
        </span>
        <span>Gestão de leads · Campanhas · Atendimento</span>
      </footer>
    </div>
  );
}

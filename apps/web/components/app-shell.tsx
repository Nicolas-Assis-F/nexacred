'use client';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { WorkspaceTools } from './workspace-tools';
import { useState } from 'react';
import {
  Activity,
  Ban,
  ChartNoAxesCombined,
  ChevronDown,
  FileClock,
  FileText,
  LayoutList,
  LogOut,
  Menu,
  MessageSquare,
  Settings,
  ShieldCheck,
  Users,
  Workflow,
  X,
  Zap,
  Smartphone,
} from 'lucide-react';
const groups = [
  {
    name: 'Operação',
    links: [
      ['Visão geral', '/dashboard', ChartNoAxesCombined],
      ['Importações', '/imports', FileClock],
      ['Leads', '/leads', Users],
      ['Segmentos', '/segments', LayoutList],
    ],
  },
  {
    name: 'Relacionamento',
    links: [
      ['Campanhas', '/campaigns', Activity],
      ['Templates', '/templates', FileText],
      ['Conversas', '/conversations', MessageSquare],
      ['Central WhatsApp', '/testing', Smartphone],
    ],
  },
  {
    name: 'Gestão',
    links: [
      ['Supressões', '/suppressions', Ban],
      ['Usuários', '/users', ShieldCheck],
      ['Auditoria', '/audit', Workflow],
      ['Configurações', '/settings', Settings],
    ],
  },
] as const;
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  if (pathname === '/') return <>{children}</>;
  if (pathname === '/login')
    return <main className="min-h-screen flex justify-center items-start px-5">{children}</main>;
  const title =
    groups.flatMap((g) => [...g.links]).find(([, href]) => href === pathname)?.[0] ?? 'Workspace';
  return (
    <div className="min-h-screen">
      <a href="#conteudo" className="skip-link">
        Ir para o conteúdo
      </a>
      {open && (
        <button
          aria-label="Fechar navegação"
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[236px] flex-col bg-[#142b30] text-white transition-transform lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <Link href="/dashboard" className="flex items-center gap-3 px-6 h-20">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#b7f7d5] text-[#19473d]">
            <Zap size={22} fill="currentColor" />
          </span>
          <span className="text-xl font-semibold tracking-tight">
            nexacred<span className="text-[#b7f7d5]">.</span>
          </span>
        </Link>
        <div className="mx-4 mb-5 flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-3">
          <span className="grid size-8 place-items-center rounded-md bg-white/10 text-xs font-semibold">
            NC
          </span>
          <div className="flex-1">
            <p className="text-xs font-medium">Minha operação</p>
            <p className="mt-0.5 text-[10px] text-[#91adb2]">Gestão de relacionamento</p>
          </div>
          <ChevronDown size={13} className="text-[#91adb2]" />
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-5">
          {groups.map((g) => (
            <div key={g.name} className="mb-5">
              <p className="px-3 pb-2 text-[10px] font-medium uppercase tracking-[.12em] text-[#708e94]">
                {g.name}
              </p>
              <div className="space-y-0.5">
                {g.links.map(([label, href, Icon]) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
                    aria-current={pathname === href ? 'page' : undefined}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition ${pathname === href ? 'bg-[#c4f7df] text-[#163e34] font-semibold' : 'text-[#abc0c5] hover:bg-white/5 hover:text-white'}`}
                  >
                    <Icon size={16} />
                    {label}
                    {pathname === href && (
                      <span className="ml-auto size-1.5 rounded-full bg-teal-700" />
                    )}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-white/10 p-4">
          <button
            className="flex w-full items-center gap-3 rounded-lg p-2 text-xs text-[#a8bec3] hover:bg-white/5"
            onClick={() =>
              void fetch('/api/auth/logout', { method: 'POST' }).then(() => {
                window.location.href = '/login';
              })
            }
          >
            <LogOut size={16} />
            Sair da plataforma
          </button>
        </div>
      </aside>
      <div className="lg:pl-[236px]">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-slate-200/80 bg-white/95 px-5 backdrop-blur md:px-8">
          <button
            className="lg:hidden"
            aria-label={open ? 'Fechar menu' : 'Abrir menu'}
            onClick={() => setOpen(!open)}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
          <span className="hidden text-xs text-slate-400 sm:block">Operação</span>
          <span className="hidden text-slate-300 sm:block">/</span>
          <span className="text-sm font-medium">{title}</span>
          <WorkspaceTools />
          <span
            className="grid size-8 place-items-center rounded-full bg-[#e8ece5] text-xs font-semibold text-[#547155]"
            aria-hidden="true"
          >
            NC
          </span>
        </header>
        <main id="conteudo" className="mx-auto max-w-[1600px] p-5 md:p-8 fade-in">
          {children}
        </main>
        <footer className="mx-auto flex max-w-[1600px] justify-between px-8 py-5 text-[11px] text-slate-400">
          <span>NexaCred · Relacionamentos com mais controle</span>
          <span>Operação</span>
        </footer>
      </div>
    </div>
  );
}

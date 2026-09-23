'use client';
import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Moon, Search, Sun, X } from 'lucide-react';
const destinations = [
  ['Visão geral', '/dashboard'],
  ['Importações', '/imports'],
  ['Leads', '/leads'],
  ['Segmentos', '/segments'],
  ['Campanhas', '/campaigns'],
  ['Templates', '/templates'],
  ['Conversas', '/conversations'],
  ['Central WhatsApp', '/testing'],
  ['Supressões', '/suppressions'],
  ['Usuários', '/users'],
  ['Auditoria', '/audit'],
  ['Configurações', '/settings'],
];
export function WorkspaceTools() {
  const [dark, setDark] = useState(false),
    [open, setOpen] = useState(false),
    [query, setQuery] = useState('');
  const router = useRouter();
  useEffect(() => {
    setDark(document.documentElement.dataset.theme === 'dark');
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  function navigate(href: string) {
    setOpen(false);
    setQuery('');
    router.push(href);
  }
  return (
    <div className="ml-auto flex items-center gap-2">
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger asChild>
          <button
            aria-label="Buscar no workspace"
            className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-500 hover:bg-slate-50"
          >
            <Search size={15} />
            <span className="hidden sm:inline">Buscar ou navegar</span>
            <kbd className="ml-3 hidden rounded border border-slate-200 px-1 text-[10px] md:inline">
              ⌘ K
            </kbd>
          </button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-[#0b2524]/50 backdrop-blur-sm" />
          <Dialog.Content className="panel fixed left-1/2 top-[18%] z-50 max-h-[70vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 overflow-auto p-5 shadow-2xl">
            <div className="mb-4 flex justify-between">
              <Dialog.Title className="font-semibold">Encontre seu próximo passo</Dialog.Title>
              <Dialog.Close aria-label="Fechar busca" className="rounded p-1">
                <X size={18} />
              </Dialog.Close>
            </div>
            <Dialog.Description className="mb-4 text-xs text-slate-500">
              Navegue pela plataforma ou busque um lead pelo nome.
            </Dialog.Description>
            <input
              autoFocus
              aria-label="Buscar página ou lead"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="O que você precisa fazer?"
              className="mb-3 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm"
            />
            <div className="space-y-1">
              {destinations
                .filter(([label]) =>
                  label?.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')),
                )
                .map(([label, href]) => (
                  <button
                    key={href}
                    onClick={() => navigate(href!)}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm hover:bg-teal-50"
                  >
                    <span>{label}</span>
                    <ArrowRight size={14} className="text-slate-400" />
                  </button>
                ))}
              {query.trim() && (
                <button
                  onClick={() => navigate('/leads?search=' + encodeURIComponent(query.trim()))}
                  className="mt-2 flex w-full items-center gap-3 rounded-lg bg-teal-50 p-3 text-left text-sm text-teal-700"
                >
                  <Search size={15} />
                  Buscar “{query.trim()}” em Leads
                </button>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <button
        aria-label={dark ? 'Ativar tema claro' : 'Ativar tema escuro'}
        title={dark ? 'Tema claro' : 'Tema escuro'}
        className="grid size-9 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"
        onClick={() => {
          const theme = dark ? 'light' : 'dark';
          document.documentElement.dataset.theme = theme;
          try {
            localStorage.setItem('nexacred-theme', theme);
          } catch {
            /* Preference still applies when storage is unavailable. */
          }
          setDark(!dark);
        }}
      >
        {dark ? <Sun size={17} /> : <Moon size={17} />}
      </button>
    </div>
  );
}

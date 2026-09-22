'use client';
import { useState } from 'react';
import { ArrowRight, BarChart3, MessageSquare, ShieldCheck, Zap } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { ErrorBox } from '@/components/resource';
export default function Login() {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <div className="my-8 grid min-h-[650px] w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/40 md:my-16 md:grid-cols-2">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-[#163c38] p-12 text-white md:flex">
        <div className="relative z-10">
          <div className="flex items-center gap-3 text-2xl font-semibold">
            <span className="rounded-xl bg-[#b7f7d5] p-2 text-[#163c38]">
              <Zap size={24} fill="currentColor" />
            </span>
            nexacred.
          </div>
          <p className="mt-20 text-xs uppercase tracking-[.2em] text-[#b7f7d5]">
            Seu relacionamento, em evolução
          </p>
          <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-tight">
            Uma base organizada.
            <br />
            Mais espaço para boas conversas.
          </h1>
          <p className="mt-6 text-sm leading-7 text-[#a9c7bc]">
            Da primeira importação ao acompanhamento de cada contato, sua operação em um só lugar.
          </p>
        </div>
        <div className="relative z-10 mt-12 space-y-4 text-sm text-[#c4ded3]">
          {[
            [BarChart3, 'Decisões com dados da sua operação'],
            [MessageSquare, 'Conversas e campanhas organizadas'],
            [ShieldCheck, 'Controle de acesso e consentimento'],
          ].map(([Icon, text]) => {
            const Symbol = Icon as typeof Zap;
            return (
              <p className="flex items-center gap-3" key={String(text)}>
                <Symbol size={17} />
                {String(text)}
              </p>
            );
          })}
        </div>
        <div className="absolute -bottom-40 -right-40 size-96 rounded-full border-[50px] border-white/[.03]" />
      </section>
      <section className="flex flex-col justify-center p-7 sm:p-12">
        <div className="mb-10">
          <p className="eyebrow text-teal-700">BEM-VINDO AO NEXACRED</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">
            Seu workspace espera por você.
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            Entre com suas credenciais para acompanhar sua operação.
          </p>
        </div>
        <form
          className="space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            const f = new FormData(e.currentTarget);
            try {
              const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(Object.fromEntries(f)),
              });
              if (!res.ok)
                throw new Error(
                  res.status === 401
                    ? 'E-mail ou senha inválidos.'
                    : res.status === 429
                      ? 'Muitas tentativas. Aguarde um minuto.'
                      : 'Serviço indisponível. Verifique a conexão com a API.',
                );
              window.location.href = '/';
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="block text-sm font-medium">
            E-mail
            <Input
              name="email"
              type="email"
              placeholder="voce@empresa.com"
              autoComplete="username"
              required
              className="mt-2 !h-12"
            />
          </label>
          <label className="block text-sm font-medium">
            Senha
            <Input
              name="password"
              type="password"
              placeholder="Sua senha"
              autoComplete="current-password"
              required
              className="mt-2 !h-12"
            />
          </label>
          <ErrorBox error={error} />
          <Button disabled={busy} className="w-full" size="lg">
            {busy ? 'Entrando…' : 'Entrar no painel'}
            <ArrowRight size={17} />
          </Button>
        </form>
        <p className="mt-8 text-center text-xs leading-6 text-slate-400">
          Precisa de acesso? Fale com o administrador do seu workspace.
        </p>
      </section>
    </div>
  );
}

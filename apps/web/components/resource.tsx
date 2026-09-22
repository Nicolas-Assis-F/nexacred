'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client';
import { Button, Card, Input } from './ui';
export type Row = Record<string, unknown>;
export function useResource<T>(path: string, refreshMs = 0) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState('');
  const generation = useRef(0);
  const load = useCallback(async () => {
    if (!path) return;
    const current = ++generation.current;
    try {
      const value = await api<T>(path);
      if (current === generation.current) {
        setData(value);
        setError('');
      }
    } catch (e) {
      if (current === generation.current) setError((e as Error).message);
    }
  }, [path]);
  useEffect(() => {
    setData(undefined);
    setError('');
    void load();
    const id = refreshMs ? setInterval(() => void load(), refreshMs) : undefined;
    return () => {
      generation.current++;
      if (id) clearInterval(id);
    };
  }, [load, refreshMs]);
  return { data, error, load };
}
export function ErrorBox({ error }: { error: string }) {
  return error ? (
    <div
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
    >
      {error}
    </div>
  ) : null;
}
export function Field({
  label,
  name,
  type = 'text',
  value,
  required = true,
}: {
  label: string;
  name: string;
  type?: string;
  value?: string | number;
  required?: boolean;
}) {
  return (
    <label className="block text-sm text-slate-500">
      {label}
      <Input name={name} type={type} defaultValue={value} required={required} className="mt-2" />
    </label>
  );
}
export function Select({
  label,
  name,
  options,
  value,
}: {
  label: string;
  name: string;
  options: Array<{ id: string; name: string }>;
  value?: string;
}) {
  return (
    <label className="block text-sm text-slate-500">
      {label}
      <select
        name={name}
        defaultValue={value}
        className="mt-2 w-full rounded-lg bg-white border border-slate-200 p-2.5"
        required
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}
export function Title({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="mb-8">
      <div className="text-xs text-slate-500 mb-3">Workspace / {title}</div>
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-slate-500">{subtitle}</p>
    </header>
  );
}
export function DataTable({
  rows,
  columns,
  onClick,
}: {
  rows: Row[];
  columns: Array<[string, string]>;
  onClick?: (row: Row) => void;
}) {
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            {columns.map(([key, label]) => (
              <th
                key={key}
                className="p-4 text-xs font-medium text-slate-500 uppercase border-b border-slate-200"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={String(row.id ?? i)}
              onClick={() => onClick?.(row)}
              className={`border-b border-slate-200/60 hover:bg-slate-50 ${onClick ? 'cursor-pointer' : ''}`}
            >
              {columns.map(([key]) => (
                <td className="p-4 max-w-sm truncate" key={key}>
                  {format(row[key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <p className="p-12 text-center text-slate-500">Nenhum registro encontrado.</p>
      )}
    </Card>
  );
}
export function format(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
export function SimpleResource({
  title,
  subtitle,
  path,
  columns,
  children,
  transform,
}: {
  title: string;
  subtitle: string;
  path: string;
  columns: Array<[string, string]>;
  children?: React.ReactNode;
  transform?: (r: Row) => Row;
}) {
  const { data, error, load } = useResource<Row[]>(path, 5000);
  return (
    <>
      <Title title={title} subtitle={subtitle} />
      <ErrorBox error={error} />
      {children}
      <div className="flex justify-end mb-3">
        <Button variant="outline" onClick={() => void load()}>
          Atualizar
        </Button>
      </div>
      {data ? (
        <DataTable rows={transform ? data.map(transform) : data} columns={columns} />
      ) : (
        <p>Carregando…</p>
      )}
    </>
  );
}
export function CreateForm({
  path,
  children,
  convert,
  onCreated,
}: {
  path: string;
  children: React.ReactNode;
  convert?: (form: FormData) => unknown;
  onCreated?: () => void;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState('');
  return (
    <Card className="p-5 mb-6">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          setBusy(true);
          setError('');
          setSuccess('');
          try {
            const f = new FormData(form);
            await api(path, convert ? convert(f) : Object.fromEntries(f));
            setSuccess('Salvo com sucesso.');
            onCreated?.();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="grid gap-4 md:grid-cols-2">{children}</div>
        <div className="mt-5 flex items-center gap-4">
          <Button disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</Button>
          <span role="status" className="text-emerald-400 text-sm">
            {success}
          </span>
        </div>
        <ErrorBox error={error} />
      </form>
    </Card>
  );
}

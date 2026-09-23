'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Inbox, Rows3 } from 'lucide-react';
import { toast } from 'sonner';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
  type ColumnDef,
} from '@tanstack/react-table';
import { api } from '@/lib/client';
import { Button, Card, Input } from './ui';
import { Status } from './status';
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
export function Title({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="eyebrow mb-2">NexaCred workspace</p>
        <h1 className="text-[28px] font-semibold tracking-tight">
          {title}
          <span className="text-teal-600">.</span>
        </h1>
        <p className="mt-1.5 text-[13px] text-slate-500">{subtitle}</p>
      </div>
      {action}
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
  const [sorting, setSorting] = useState<SortingState>([]);
  const [compact, setCompact] = useState(false);
  const table = useReactTable<Row>({
    data: rows,
    columns: columns.map<ColumnDef<Row, unknown>>(([key, label]) => ({
      accessorKey: key,
      header: label,
      cell: ({ getValue }) =>
        key === 'status' && typeof getValue() === 'string' ? (
          <Status value={String(getValue())} />
        ) : (
          format(getValue())
        ),
    })),
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row, i) => String(row.id ?? i),
  });
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
        <p className="text-xs text-slate-500">
          <span className="font-semibold text-slate-700">
            {rows.length.toLocaleString('pt-BR')}
          </span>{' '}
          registros nesta página{' '}
          <span className="ml-2 hidden text-slate-400 sm:inline">· Ordenação na página atual</span>
        </p>
        <button
          aria-label={compact ? 'Usar linhas confortáveis' : 'Usar linhas compactas'}
          aria-pressed={compact}
          onClick={() => setCompact(!compact)}
          className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-50"
        >
          <Rows3 size={14} />
          {compact ? 'Compacta' : 'Confortável'}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50/60 text-[10px] uppercase tracking-wide text-slate-500">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-5 py-3 font-medium"
                    aria-sort={
                      header.column.getIsSorted() === 'asc'
                        ? 'ascending'
                        : header.column.getIsSorted() === 'desc'
                          ? 'descending'
                          : 'none'
                    }
                  >
                    <button
                      onClick={header.column.getToggleSortingHandler()}
                      className="flex items-center gap-2 text-left"
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getIsSorted() === 'asc' ? (
                        <ArrowUp size={12} />
                      ) : header.column.getIsSorted() === 'desc' ? (
                        <ArrowDown size={12} />
                      ) : (
                        <ArrowUpDown size={12} className="opacity-40" />
                      )}
                    </button>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => onClick?.(row.original)}
                tabIndex={onClick ? 0 : undefined}
                onKeyDown={(e) => {
                  if (onClick && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    onClick(row.original);
                  }
                }}
                className={`border-b border-slate-100 last:border-0 transition hover:bg-slate-50 ${onClick ? 'cursor-pointer focus-visible:bg-teal-50' : ''}`}
              >
                {row.getVisibleCells().map((cell, i) => (
                  <td
                    key={cell.id}
                    className={`max-w-sm truncate px-5 ${compact ? 'py-2' : 'py-4'} ${i === 0 ? 'font-medium text-slate-700' : 'text-slate-500'}`}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && (
        <div className="px-6 py-14 text-center">
          <span className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-slate-50 text-slate-400">
            <Inbox size={23} />
          </span>
          <p className="text-sm font-medium">Nenhum registro por aqui</p>
          <p className="mt-2 text-xs text-slate-500">
            Ajuste os filtros ou crie o primeiro registro para começar.
          </p>
        </div>
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
        <div className="panel h-60 animate-pulse p-6" role="status">
          <span className="text-sm text-slate-500">Carregando registros…</span>
        </div>
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
            toast.success('Registro salvo com sucesso.');
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

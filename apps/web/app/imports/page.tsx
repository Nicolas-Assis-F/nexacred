'use client';
import { useRef, useState } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  ArrowRight,
  ArrowLeft,
  Check,
  AlertCircle,
  RefreshCw,
  Search,
  X,
  CheckCircle2,
  LoaderCircle,
  Settings2,
} from 'lucide-react';
import { Button, Card, Input } from '@/components/ui';
import { ErrorBox, useResource } from '@/components/resource';
import { Status } from '@/components/status';
import { api } from '@/lib/client';
interface ImportRecord {
  id: string;
  filename: string;
  status: string;
  processedRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  totalRows: number;
  createdAt: string;
  errorMessage: string | null;
}
interface ImportError {
  id: string;
  rowNumber: number;
  reason: string;
}
const fields = [
  ['cpf', 'CPF', 'CPF', true],
  ['name', 'Nome completo', 'NOME SERVIDOR', true],
  ['phone1', 'Telefone principal', 'TELEFONE'],
  ['phone2', 'Telefone adicional', 'TELEFONE 2'],
  ['email1', 'E-mail principal', 'EMAIL'],
  ['email2', 'E-mail adicional', 'EMAIL 2'],
  ['organization', 'Órgão', 'NOME ORGÃO'],
  ['organizationCode', 'Código do órgão', 'ORG'],
  ['employmentCode', 'Código do vínculo', 'COD VINC'],
  ['position', 'Cargo', 'CARGO PRINCIPAL'],
  ['employmentStatus', 'Situação funcional', 'DESC SIT FUNCIONAL'],
  ['availableMargin', 'Margem disponível', 'MARGEM CONSIGNÁVEL'],
  ['marginBase', 'Base de margem', 'BASE CALCULO MARGEM CONSIG'],
  ['contractsCount', 'Número de contratos', 'QUANTIDADES CONTRATOS CONSIG'],
  ['currentLoanDiscount', 'Desconto atual', 'TOTAL DESCONTADO EMPRÉSTIMO'],
] as const;
const defaults = Object.fromEntries(fields.map(([key, , header]) => [key, header]));
const num = (n: number) => n.toLocaleString('pt-BR');
export default function ImportsPage() {
  const { data, error, load } = useResource<ImportRecord[]>('/imports', 3000);
  const [file, setFile] = useState<File>();
  const [step, setStep] = useState(1);
  const [sheet, setSheet] = useState('');
  const [mapping, setMapping] = useState<Record<string, string>>(defaults);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [notice, setNotice] = useState('');
  const [dragging, setDragging] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [errorPage, setErrorPage] = useState(1);
  const [search, setSearch] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const selected = data?.find((i) => i.id === selectedId);
  const { data: errors, error: detailError } = useResource<ImportError[]>(
    selectedId ? '/imports/' + selectedId + '/errors?page=' + errorPage : '',
    5000,
  );
  function choose(next: File | undefined) {
    if (!next) return;
    if (!next.name.toLowerCase().endsWith('.xlsb')) {
      setNotice('Selecione um arquivo .xlsb.');
      return;
    }
    if (next.size > 1024 ** 3) {
      setNotice('O limite é 1 GB por arquivo.');
      return;
    }
    setFile(next);
    setNotice('');
  }
  async function upload() {
    if (!file) return;
    setBusy(true);
    setNotice('');
    setProgress(0);
    const form = new FormData();
    form.append('file', file);
    form.append('sheetName', sheet.trim());
    form.append('mapping', JSON.stringify(mapping));
    try {
      const result = await new Promise<{ importId: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/imports');
        xhr.timeout = 30 * 60 * 1000;
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onerror = () =>
          reject(
            new Error('A conexão caiu durante o upload. Verifique sua rede e tente novamente.'),
          );
        xhr.ontimeout = () =>
          reject(new Error('Tempo de upload excedido. Tente novamente com uma conexão estável.'));
        xhr.onload = () => {
          if (xhr.status === 401) {
            window.location.href = '/login';
            reject(new Error('Sua sessão expirou. Entre novamente.'));
            return;
          }
          try {
            const v = JSON.parse(xhr.responseText) as {
              importId: string;
              message?: string | string[];
            };
            if (xhr.status < 200 || xhr.status >= 300)
              reject(
                new Error(
                  Array.isArray(v.message)
                    ? v.message.join(', ')
                    : (v.message ?? 'Falha no envio. Verifique os serviços.'),
                ),
              );
            else resolve(v);
          } catch {
            reject(
              new Error(
                'Resposta inesperada. Verifique o limite de upload do proxy e se a API está disponível.',
              ),
            );
          }
        };
        xhr.send(form);
      });
      setSelectedId(result.importId);
      setStep(3);
      await load();
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function retry(id: string) {
    setNotice('');
    try {
      await api('/imports/' + id + '/retry', {});
      await load();
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  const visible = (data ?? []).filter((i) =>
    i.filename.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between gap-4">
        <div>
          <p className="eyebrow mb-2">Sua base, organizada desde a entrada</p>
          <h1 className="text-[28px] font-semibold tracking-tight">
            Importações<span className="text-teal-600">.</span>
          </h1>
          <p className="mt-1.5 text-[13px] text-slate-500">
            Traga seus leads, confira os campos e acompanhe o processamento.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()}>
          <RefreshCw size={14} />
          Atualizar
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Importações', data?.length ?? 0],
          [
            'Em processamento',
            data?.filter((i) => ['QUEUED', 'PROCESSING'].includes(i.status)).length ?? 0,
          ],
          ['Concluídas', data?.filter((i) => i.status === 'COMPLETED').length ?? 0],
          ['Precisam de atenção', data?.filter((i) => i.status === 'FAILED').length ?? 0],
        ].map(([label, value]) => (
          <Card key={String(label)} className="p-4">
            <p className="text-[11px] text-slate-400">{label}</p>
            <p className="mt-2 metric-number text-2xl font-semibold">{value}</p>
          </Card>
        ))}
      </div>
      <ErrorBox error={notice || error} />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-4 border-b border-slate-100 px-6 py-5">
            {['Escolher arquivo', 'Mapear campos', 'Acompanhar'].map((label, i) => (
              <div
                key={label}
                className={`flex items-center gap-2 text-xs ${step === i + 1 ? 'text-teal-800 font-semibold' : 'text-slate-400'}`}
              >
                <span
                  className={`grid size-6 place-items-center rounded-full text-[10px] ${step >= i + 1 ? 'bg-teal-700 text-white' : 'bg-slate-100'}`}
                >
                  {step > i + 1 ? <Check size={12} /> : i + 1}
                </span>
                {label}
                {i < 2 && <ArrowRight size={12} className="ml-2 text-slate-300" />}
              </div>
            ))}
          </div>
          <div className="p-6">
            {step === 1 && (
              <>
                <h2 className="text-base font-semibold">Uma nova base começa aqui</h2>
                <p className="text-xs text-slate-400 mt-1 mb-5">
                  Envie sua planilha no formato Excel binário (.xlsb).
                </p>
                <input
                  ref={input}
                  type="file"
                  accept=".xlsb"
                  aria-label="Selecionar arquivo XLSB"
                  className="sr-only"
                  onChange={(e) => choose(e.target.files?.[0])}
                />
                <button
                  type="button"
                  onClick={() => input.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    choose(e.dataTransfer.files[0]);
                  }}
                  className={`flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 transition ${dragging ? 'border-teal-500 bg-teal-50' : 'border-slate-200 bg-[#fafcfb] hover:border-teal-400'}`}
                >
                  <span className="mb-4 grid size-14 place-items-center rounded-2xl border border-teal-100 bg-white text-teal-700">
                    <UploadCloud size={25} />
                  </span>
                  <span className="text-sm font-medium">
                    Arraste o arquivo ou{' '}
                    <span className="text-teal-700">clique para selecionar</span>
                  </span>
                  <span className="mt-2 text-[11px] text-slate-400">
                    XLSB · até 1 GB · processamento em lotes
                  </span>
                </button>
                {file && (
                  <div className="mt-4 flex items-center gap-3 rounded-lg border border-slate-200 p-3">
                    <FileSpreadsheet size={23} className="text-teal-600" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{file.name}</p>
                      <p className="mt-1 text-[10px] text-slate-400">
                        {(file.size / 1024 / 1024).toFixed(2)} MB · pronto para configurar
                      </p>
                    </div>
                    <button
                      aria-label="Remover arquivo selecionado"
                      onClick={() => setFile(undefined)}
                    >
                      <X size={16} className="text-slate-400" />
                    </button>
                  </div>
                )}
                <div className="mt-5 flex justify-end">
                  <Button disabled={!file} onClick={() => setStep(2)}>
                    Continuar
                    <ArrowRight size={14} />
                  </Button>
                </div>
              </>
            )}
            {step === 2 && (
              <>
                <h2 className="text-base font-semibold">Cada coluna no lugar certo</h2>
                <p className="text-xs text-slate-400 mt-1 mb-5">
                  Informe o nome do cabeçalho na sua planilha. CPF e nome são obrigatórios.
                </p>
                <label className="block mb-5 text-xs font-medium">
                  Nome da aba <span className="font-normal text-slate-400">(opcional)</span>
                  <Input
                    className="mt-2"
                    placeholder="Deixe vazio para usar a primeira aba"
                    value={sheet}
                    onChange={(e) => setSheet(e.target.value)}
                  />
                </label>
                <div className="max-h-[380px] overflow-y-auto rounded-xl border border-slate-200">
                  <div className="grid grid-cols-2 bg-slate-50 px-4 py-3 text-[10px] uppercase tracking-wide text-slate-400">
                    <span>Campo no NexaCred</span>
                    <span>Cabeçalho na planilha</span>
                  </div>
                  {fields.map(([key, label, , required]) => (
                    <label
                      key={key}
                      className="grid grid-cols-2 items-center gap-4 border-t border-slate-100 px-4 py-2.5"
                    >
                      <span className="text-xs">
                        {label}
                        {required && <span className="ml-1 text-teal-700">*</span>}
                      </span>
                      <Input
                        aria-label={label + ' na planilha'}
                        value={mapping[key] ?? ''}
                        onChange={(e) => setMapping({ ...mapping, [key]: e.target.value })}
                        placeholder={required ? 'Obrigatório' : 'Ignorar campo'}
                      />
                    </label>
                  ))}
                </div>
                {busy && (
                  <div className="mt-5" aria-live="polite">
                    <div className="mb-2 flex justify-between text-xs text-teal-700">
                      <span>
                        {progress === 100
                          ? 'Arquivo enviado. Registrando importação…'
                          : 'Enviando arquivo…'}
                      </span>
                      <span>{progress}%</span>
                    </div>
                    <progress max={100} value={progress} className="h-2 w-full accent-teal-600" />
                  </div>
                )}
                <div className="mt-6 flex justify-between">
                  <Button variant="outline" disabled={busy} onClick={() => setStep(1)}>
                    <ArrowLeft size={14} />
                    Voltar
                  </Button>
                  <Button
                    disabled={busy || !mapping.cpf?.trim() || !mapping.name?.trim()}
                    onClick={() => void upload()}
                  >
                    {busy ? (
                      <LoaderCircle size={15} className="animate-spin" />
                    ) : (
                      <UploadCloud size={15} />
                    )}
                    Importar base
                  </Button>
                </div>
              </>
            )}
            {step === 3 && (
              <div className="py-7 text-center">
                <span className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-emerald-50 text-emerald-600">
                  <CheckCircle2 size={30} />
                </span>
                <h2 className="text-xl font-semibold">Arquivo recebido!</h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
                  Sua importação já pode ser acompanhada abaixo. Você pode continuar usando o painel
                  enquanto processamos os dados.
                </p>
                <Button
                  className="mt-6"
                  variant="outline"
                  onClick={() => {
                    setStep(1);
                    setFile(undefined);
                    setProgress(0);
                  }}
                >
                  Importar outro arquivo
                </Button>
              </div>
            )}
          </div>
        </Card>
        <aside className="space-y-4">
          <div className="rounded-xl border border-[#dae7dc] bg-[#edf4ed] p-5">
            <span className="mb-4 grid size-9 place-items-center rounded-lg bg-white text-[#53745c]">
              <Settings2 size={18} />
            </span>
            <h3 className="text-sm font-semibold text-[#36523e]">Antes de importar</h3>
            <ul className="mt-4 space-y-3 text-xs leading-relaxed text-[#6d8373]">
              <li>Use os nomes dos cabeçalhos da primeira linha.</li>
              <li>CPF e nome identificam cada lead. Telefones e e-mails são opcionais.</li>
              <li>Leads repetidos são identificados pelo CPF.</li>
              <li>A importação preserva bloqueios e não cria consentimento.</li>
            </ul>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="text-xs font-medium">Planilhas grandes?</h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              Os registros são processados em lotes. O total de linhas fica disponível ao finalizar,
              sem carregar toda a planilha na memória.
            </p>
          </div>
        </aside>
      </div>
      {selected && (
        <Card className="p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="eyebrow mb-1">Acompanhamento</p>
              <h2 className="text-sm font-semibold">{selected.filename}</h2>
            </div>
            <Status value={selected.status} />
          </div>
          {['QUEUED', 'PROCESSING'].includes(selected.status) && (
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
              <LoaderCircle size={14} className="animate-spin" />
              {selected.status === 'QUEUED'
                ? 'Aguardando o importador iniciar…'
                : 'Processando em lotes. Atualização automática a cada 3 segundos.'}
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              ['Processadas', selected.processedRows],
              ['Válidas', selected.validRows],
              ['Inválidas', selected.invalidRows],
              ['Duplicadas', selected.duplicateRows],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <p className="text-[11px] text-slate-400">{label}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{num(Number(value))}</p>
              </div>
            ))}
          </div>
          {selected.errorMessage && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">
              <AlertCircle size={16} />
              <p className="flex-1">{selected.errorMessage}</p>
              <Button size="sm" variant="outline" onClick={() => void retry(selected.id)}>
                Tentar novamente
              </Button>
            </div>
          )}
          {selected.invalidRows > 0 && (
            <div className="mt-5 border-t border-slate-100 pt-4">
              <h3 className="mb-3 text-xs font-semibold">Linhas que precisam de revisão</h3>
              <ErrorBox error={detailError} />
              <div className="max-h-48 overflow-auto">
                {errors?.map((e) => (
                  <div key={e.id} className="flex gap-4 border-b border-slate-100 py-2 text-xs">
                    <span className="w-16 shrink-0 text-slate-400">Linha {e.rowNumber}</span>
                    <span>{e.reason}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-3">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={errorPage === 1}
                  onClick={() => setErrorPage(errorPage - 1)}
                >
                  Anterior
                </Button>
                <span className="text-xs text-slate-400">Página {errorPage}</span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={(errors?.length ?? 0) < 100}
                  onClick={() => setErrorPage(errorPage + 1)}
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <h2 className="text-sm font-semibold">Histórico de importações</h2>
            <p className="mt-1 text-[11px] text-slate-400">
              Últimos 100 arquivos · selecione para acompanhar
            </p>
          </div>
          <div className="relative max-w-xs">
            <Search size={14} className="absolute left-3 top-3 text-slate-400" />
            <Input
              className="pl-9"
              aria-label="Buscar importações"
              placeholder="Buscar arquivo…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-y border-slate-100 bg-slate-50/60 text-[10px] uppercase tracking-wide text-slate-400">
              <tr>
                {['Arquivo', 'Data', 'Processadas', 'Válidas', 'Status', ''].map((h, i) => (
                  <th key={i} className="px-5 py-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((i) => (
                <tr
                  key={i.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                >
                  <td className="px-5 py-4">
                    <button
                      className="flex items-center gap-2 font-medium text-left"
                      onClick={() => {
                        setSelectedId(i.id);
                        setErrorPage(1);
                      }}
                    >
                      <FileSpreadsheet size={17} className="text-teal-600" />
                      {i.filename}
                    </button>
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap text-slate-400">
                    {new Date(i.createdAt).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-5 py-4 tabular-nums">{num(i.processedRows)}</td>
                  <td className="px-5 py-4 tabular-nums">{num(i.validRows)}</td>
                  <td className="px-5 py-4">
                    <Status value={i.status} />
                  </td>
                  <td className="px-5 py-4">
                    <button
                      aria-label={'Ver ' + i.filename}
                      onClick={() => {
                        setSelectedId(i.id);
                        setErrorPage(1);
                      }}
                      className="text-slate-400 hover:text-teal-700"
                    >
                      <ArrowUpRightIcon />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!visible.length && (
          <div className="p-10 text-center">
            <FileSpreadsheet size={25} className="mx-auto text-slate-300" />
            <p className="mt-3 text-xs text-slate-400">
              {search
                ? 'Nenhum arquivo corresponde à busca.'
                : 'Sua primeira importação aparecerá aqui.'}
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
function ArrowUpRightIcon() {
  return <ArrowRight size={14} />;
}

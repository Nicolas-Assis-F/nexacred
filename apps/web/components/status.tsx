const labels: Record<string, string> = {
  DRAFT: 'Rascunho',
  APPROVED: 'Aprovada',
  SCHEDULED: 'Agendada',
  RUNNING: 'Em andamento',
  PAUSED: 'Pausada',
  COMPLETED: 'Concluída',
  FAILED: 'Com falha',
  QUEUED: 'Na fila',
  PROCESSING: 'Processando',
  UPLOADED: 'Recebido',
  CANCELLED: 'Cancelada',
  SENT: 'Enviada',
  DELIVERED: 'Entregue',
  RECEIVED: 'Recebida',
  RESPONDED: 'Respondeu',
  PENDING: 'Pendente',
  ACTIVE: 'Ativo',
  INVALID: 'Inválido',
  SUPPRESSED: 'Bloqueado',
  ARCHIVED: 'Arquivado',
  NEW: 'Nova',
  INTERESTED: 'Interessado',
  NOT_INTERESTED: 'Sem interesse',
  QUALIFYING: 'Em qualificação',
  QUALIFIED: 'Qualificado',
  WAITING_HUMAN: 'Aguardando atendimento',
  OPT_OUT: 'Saída solicitada',
  CLOSED: 'Encerrada',
};
export function Status({ value }: { value: string }) {
  const color = ['COMPLETED', 'DELIVERED', 'APPROVED', 'SENT', 'ACTIVE', 'QUALIFIED'].includes(
    value,
  )
    ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
    : ['FAILED', 'CANCELLED', 'OPT_OUT', 'SUPPRESSED', 'INVALID'].includes(value)
      ? 'bg-red-50 text-red-700 border-red-100'
      : ['QUEUED', 'PAUSED', 'UPLOADED', 'WAITING_HUMAN', 'PENDING'].includes(value)
        ? 'bg-amber-50 text-amber-700 border-amber-100'
        : ['PROCESSING', 'RUNNING', 'INTERESTED', 'QUALIFYING', 'RECEIVED', 'RESPONDED'].includes(
              value,
            )
          ? 'bg-blue-50 text-blue-700 border-blue-100'
          : 'bg-slate-50 text-slate-500 border-slate-200';
  return (
    <span
      className={`inline-flex whitespace-nowrap items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-medium ${color}`}
    >
      <span className="status-dot" />
      {labels[value] ?? value}
    </span>
  );
}

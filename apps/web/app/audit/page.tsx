 'use client';
import {SimpleResource} from '@/components/resource';
export default function Audit(){return <SimpleResource title="Auditoria" subtitle="Registro de operações sensíveis. Somente leitura · últimos 250 eventos." path="/audit" columns={[["createdAt","Data"],["action","Ação"],["entityType","Recurso"],["entityId","Identificador"],["requestId","Request ID"]]}/>;}

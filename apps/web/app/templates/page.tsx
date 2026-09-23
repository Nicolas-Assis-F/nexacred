'use client';
import { SimpleResource, CreateForm, Field, Select } from '@/components/resource';
export default function Templates() {
  return (
    <SimpleResource
      title="Templates"
      subtitle="Use {{nome}} para personalizar. Inclua uma instrução clara de saída."
      path="/templates"
      columns={[
        ['name', 'Template'],
        ['channel', 'Canal'],
        ['body', 'Mensagem'],
      ]}
    >
      <CreateForm path="/templates">
        <Field label="Nome" name="name" />
        <Select
          label="Canal"
          name="channel"
          options={[
            { id: 'WHATSAPP', name: 'WhatsApp' },
            { id: 'SMS', name: 'SMS (mock)' },
            { id: 'EMAIL', name: 'E-mail (mock)' },
          ]}
        />
        <Field label="Assunto" name="subject" required={false} />
        <label className="text-sm text-slate-500">
          Mensagem
          <textarea
            name="body"
            required
            minLength={3}
            className="block w-full h-24 p-3 mt-2 rounded-lg border border-slate-200 bg-white"
            defaultValue="Olá, {{nome}}! Podemos encaminhar seu interesse a um atendente? Para sair, responda SAIR."
          />
        </label>
      </CreateForm>
    </SimpleResource>
  );
}

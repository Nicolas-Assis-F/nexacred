import type { Metadata } from 'next';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import './globals.css';
import { AppShell } from '@/components/app-shell';
import { Toaster } from 'sonner';
export const metadata: Metadata = {
  title: { default: 'NexaCred', template: '%s · NexaCred' },
  description: 'Gestão de leads, WhatsApp e campanhas com consentimento e controle.',
};
const themeScript = `(function(){try{document.documentElement.dataset.theme=localStorage.getItem('nexacred-theme')||(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light')}catch{}})()`;
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <AppShell>{children}</AppShell>
        <Toaster richColors closeButton position="bottom-right" />
      </body>
    </html>
  );
}

import type { Metadata } from 'next'; import './globals.css'; import { Sidebar } from '@/components/sidebar';
export const metadata: Metadata = { title: 'NexaCred', description: 'Gestão de leads e campanhas com compliance' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="pt-BR"><body><Sidebar/><main className="min-h-screen px-5 py-7 lg:ml-64 lg:px-8">{children}</main></body></html>; }

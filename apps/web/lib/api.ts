import { cookies } from 'next/headers';
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = (await cookies()).get('nexacred_token')?.value;
  const response = await fetch(`${process.env.API_URL ?? 'http://api:3001'}${path}`, { ...init, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...init?.headers }, cache: 'no-store' });
  if (!response.ok) throw new Error(`API ${response.status}`);
  return response.json() as Promise<T>;
}

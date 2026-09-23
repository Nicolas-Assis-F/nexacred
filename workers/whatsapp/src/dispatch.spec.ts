import { describe, it, expect, vi } from 'vitest';
import { dispatch, buildMessage, type DispatchDependencies } from './dispatch.js';
const input = {
  id: 'e625d591-7535-46ae-994e-867e87393bbd',
  phone: '62999998888',
  message: 'Teste autorizado',
  consent: true,
};
function dependencies(): DispatchDependencies {
  return {
    attempts: [],
    enabled: true,
    connected: () => true,
    suppressed: () => false,
    hash: (s) => s,
    encrypt: (s) => 'encrypted:' + s,
    persist: vi.fn(async () => undefined),
    resolve: vi.fn(async () => '556299998888@s.whatsapp.net'),
    send: vi.fn(async () => undefined),
  };
}
describe('durable WhatsApp dispatch', () => {
  it('sends to the JID returned by WhatsApp, without an environment allowlist', async () => {
    const d = dependencies();
    const a = await dispatch(input, 'TEST', d);
    expect(a.status).toBe('SENT');
    expect(d.resolve).toHaveBeenCalledWith('+5562999998888');
    expect(d.send).toHaveBeenCalledWith(
      '556299998888@s.whatsapp.net',
      expect.stringContaining('responda SAIR'),
      a.providerId,
    );
    expect(a.target).not.toContain('999998888');
  });
  it('replays a persisted attempt without contacting WhatsApp again', async () => {
    const d = dependencies();
    await dispatch(input, 'TEST', d);
    await dispatch(input, 'TEST', d);
    expect(d.send).toHaveBeenCalledTimes(1);
  });
  it('does not retry an uncertain remote outcome', async () => {
    const d = dependencies();
    d.send = vi.fn(async () => {
      throw new Error('timeout');
    });
    expect((await dispatch(input, 'TEST', d)).status).toBe('UNCERTAIN');
    await dispatch(input, 'TEST', d);
    expect(d.send).toHaveBeenCalledTimes(1);
  });
  it('rejects changing the payload of an existing attempt', async () => {
    const d = dependencies();
    await dispatch(input, 'TEST', d);
    await expect(dispatch({ ...input, message: 'Outro texto' }, 'TEST', d)).rejects.toMatchObject({
      code: 'ID_CONFLICT',
    });
  });
  it.each(['consent', 'suppression', 'hourly', 'daily', 'disconnected', 'unregistered'] as const)(
    'blocks %s before sending',
    async (reason) => {
      const d = dependencies();
      if (reason === 'suppression') d.suppressed = () => true;
      if (reason === 'disconnected') d.connected = () => false;
      if (reason === 'unregistered') d.resolve = async () => undefined;
      if (reason === 'hourly' || reason === 'daily')
        for (let i = 0; i < (reason === 'hourly' ? 5 : 20); i++)
          d.attempts.push({
            id: String(i),
            targetHash: '',
            target: '',
            status: 'SENT',
            at: Date.now() - (reason === 'daily' ? 7200000 : 0),
          });
      await expect(
        dispatch({ ...input, consent: reason !== 'consent' }, 'TEST', d),
      ).rejects.toThrow();
      expect(d.send).not.toHaveBeenCalled();
    },
  );
  it('rechecks an opt-out received while resolving a number', async () => {
    const d = dependencies();
    d.resolve = async () => {
      d.suppressed = () => true;
      return '556299998888@s.whatsapp.net';
    };
    await expect(dispatch(input, 'CAMPAIGN', d)).rejects.toMatchObject({ code: 'SUPPRESSED' });
    expect(d.send).not.toHaveBeenCalled();
  });
  it('fails closed when persistence is unavailable', async () => {
    const d = dependencies();
    d.persist = async () => {
      throw new Error('disk');
    };
    await expect(dispatch(input, 'TEST', d)).rejects.toThrow('disk');
    expect(d.send).not.toHaveBeenCalled();
  });
  it('enforces a global campaign quota across recipients', async () => {
    const d = dependencies();
    for (let i = 0; i < 20; i++)
      d.attempts.push({
        id: String(i),
        targetHash: '',
        target: '',
        status: 'SENT',
        at: Date.now(),
        kind: 'CAMPAIGN',
      });
    await expect(dispatch(input, 'CAMPAIGN', d)).rejects.toMatchObject({ code: 'RATE_LIMIT' });
  });
  it('always preserves an opt-out instruction and rejects empty/control-only content', () => {
    expect(buildMessage('Olá')).toContain('SAIR');
    expect(buildMessage('Responda SAIR')).toBe('Responda SAIR');
    expect(() => buildMessage('\u0001')).toThrow();
    expect(() => buildMessage('x'.repeat(701))).toThrow();
  });
});
it('counts tests against the global quota, even after campaign sends', async () => {
  const d = dependencies();
  for (let i = 0; i < 20; i++) d.attempts.push({ id: String(i), targetHash: '', target: '', at: Date.now(), status: 'SENT', kind: 'CAMPAIGN' });
  await expect(dispatch(input, 'TEST', d)).rejects.toMatchObject({ code: 'RATE_LIMIT' });
  expect(d.send).not.toHaveBeenCalled();
});
it('deduplicates different phone representations resolving to the same WhatsApp account', async () => {
  const d = dependencies();
  await dispatch({ ...input, campaignId: 'campaign' }, 'CAMPAIGN', d);
  await expect(dispatch({ ...input, id: 'fc25d591-7535-46ae-994e-867e87393bbd', phone: '11988887777', campaignId: 'campaign' }, 'CAMPAIGN', d)).rejects.toMatchObject({ code: 'DUPLICATE_CONTACT' });
  expect(d.send).toHaveBeenCalledTimes(1);
});

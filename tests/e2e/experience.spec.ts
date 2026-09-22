import { test, expect } from '@playwright/test';
import path from 'node:path';

test('dashboard, responsive navigation and XLSB upload wizard', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill('admin@nexacred.local');
  await page.getByLabel('Senha').fill('DevOnly-ChangeMe123!');
  await page.getByRole('button', { name: 'Entrar no painel' }).click();
  await expect(page.getByRole('heading', { name: 'Visão geral' })).toBeVisible();
  const dashboard = page.waitForResponse((r) => r.url().includes('/api/dashboard?days=7'));
  await page.getByRole('button', { name: '7 dias', exact: true }).click();
  const response = await dashboard;
  expect(response.ok()).toBeTruthy();
  const metrics = await response.json();
  expect(metrics.daily).toHaveLength(7);
  await page.screenshot({ path: 'test-results/dashboard-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await page.getByRole('link', { name: 'Importações', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Importações' })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
  await page.screenshot({ path: 'test-results/imports-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByLabel('Selecionar arquivo XLSB')
    .setInputFiles(path.resolve('fixtures/leads-synthetic.xlsb'));
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByLabel('CPF na planilha', { exact: true }).fill(' cpf ');
  await page.getByLabel('Nome completo na planilha').fill('nome servidor');
  const uploaded = page.waitForResponse(
    (r) => r.url().endsWith('/api/imports') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Importar base', exact: true }).click();
  const upload = await uploaded;
  expect(upload.ok(), await upload.text()).toBeTruthy();
  const { importId } = await upload.json();
  await expect(page.getByRole('heading', { name: 'Arquivo recebido!' })).toBeVisible();
  await expect
    .poll(async () => {
      const r = await page.request.get('/api/imports/' + importId);
      return (await r.json()).status;
    })
    .toBe('COMPLETED');
  await page.screenshot({ path: 'test-results/imports-desktop.png', fullPage: true });
  await page.goto('/testing');
  await expect(page.getByRole('heading', { name: 'Ative seu ambiente de testes' })).toBeVisible();
});

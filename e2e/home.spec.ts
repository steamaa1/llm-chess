import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/health', (route) => route.abort());
});

test('shows the application headline and recoverable API failure state', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '让语言模型，下一盘真正的象棋。' })).toBeVisible();
  await expect(page.getByText('服务暂不可用', { exact: true })).toBeVisible();
  await expect(page.getByText('正在准备标准开局。')).toBeVisible();
});

test('saves a provider profile without persisting the API key', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '打开模型配置' }).click();
  await page.getByRole('tab', { name: '红方模型' }).click();
  await page.getByLabel('模型名称').fill('saved-test-model');
  await page.getByLabel('Base URL').fill('https://api.example.test/v1');
  await page.getByLabel(/API Key/).fill('must-not-be-persisted');
  await page.getByRole('button', { name: '保存 红方供应商' }).click();
  await expect(page.getByText('红方供应商已保存为')).toBeVisible();
  const stored = await page.evaluate(() => window.localStorage.getItem('llm-chess:model-profiles:v1'));
  expect(stored).toContain('saved-test-model');
  expect(stored).not.toContain('must-not-be-persisted');
  await page.reload();
  await page.getByRole('button', { name: '打开模型配置' }).click();
  await page.getByRole('tab', { name: '红方模型' }).click();
  await expect(page.getByLabel('模型名称')).toHaveValue('saved-test-model');
  await expect(page.getByLabel(/API Key/)).toHaveValue('');
});

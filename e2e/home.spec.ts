import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/health', (route) => route.abort());
});

test('shows the application headline and recoverable API failure state', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '让语言模型，下一盘真正的象棋。' })).toBeVisible();
  await expect(page.getByText('服务暂不可用', { exact: true })).toBeVisible();
  await expect(page.getByText('红方先行，请选择一枚红方棋子。')).toBeVisible();
});

test('shows strict legal landing points and moves a selected piece', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '红方兵，一路第7行' }).click();
  await expect(page.getByRole('button', { name: '走到一路第6行' })).toBeVisible();
  await page.getByRole('button', { name: '走到一路第6行' }).click();
  await expect(page.getByText('现在轮到黑方走棋。')).toBeVisible();
  await expect(page.locator('.last-move-mark')).toHaveCount(2);
});

test('shows a recoverable error when starting without an API key', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '开始对局' }).click();
  await expect(page.getByRole('alert')).toContainText('API_KEY_MISSING');
  await expect(page.getByRole('dialog', { name: '保存模型供应商' })).toBeVisible();
});

test('opens the public analysis page without claiming hidden chain of thought', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '对局分析' }).click();
  await expect(page.getByRole('heading', { name: '对局分析' })).toBeVisible();
  await expect(page.getByText('这里不请求或展示模型隐藏思维链。')).toBeVisible();
  await expect(page.getByText('尚无分析记录')).toBeVisible();
  await expect(page.getByText('导入棋谱')).toBeVisible();
  await expect(page.getByText('还没有保存的棋谱。')).toBeVisible();
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

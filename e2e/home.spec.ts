import { expect, test } from '@playwright/test';

test('shows the application headline and recoverable API failure state', async ({ page }) => {
  await page.route('**/api/health', (route) => route.abort());
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '让语言模型，下一盘真正的象棋。' })).toBeVisible();
  await expect(page.getByText('服务暂不可用', { exact: true })).toBeVisible();
  await expect(page.getByText('正在准备标准开局。', { exact: true })).toBeVisible();
});

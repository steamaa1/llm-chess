import { expect, test } from '@playwright/test';

test('shows the application headline and recoverable API failure state', async ({ page }) => {
  await page.route('**/api/health', (route) => route.abort());
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '让语言模型，下一盘真正的象棋。' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('服务暂不可用');
  await expect(page.getByText('暂时无法连接对局服务，请稍后重试。')).toBeVisible();
});

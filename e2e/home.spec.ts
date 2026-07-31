import { expect, test } from '@playwright/test';

test('shows the Chinese product title and recoverable API failure state', async ({ page }) => {
  await page.route('**/api/health', (route) => route.abort());
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'LLM 象棋' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('暂时无法连接对局服务');
});

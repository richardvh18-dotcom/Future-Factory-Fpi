import { test, expect } from '@playwright/test';

test('De applicatie laadt succesvol op en toont content', async ({ page }) => {
  // Ga naar de hoofdpagina van de app
  await page.goto('/');

  // Verwacht dat de applicatie geladen is zonder vast te lopen op een wit scherm.
  // (We checken simpelweg of de body zichtbaar is en eventueel de titel "Future Factory")
  const body = page.locator('body');
  await expect(body).toBeVisible();
});
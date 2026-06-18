import { test, expect } from '@playwright/test';

test('Operator flow: Inloggen, order selecteren en starten via ProductionStartModal scanner', async ({ page }) => {
  // 1. Ga naar de applicatie
  await page.goto('/');

  // 2. Inloggen met test-credentials voor BM18
  await page.getByPlaceholder(/e-mail/i).fill('40BM18@fpi.nl');
  await page.getByPlaceholder(/wachtwoord/i).fill('user123345');
  await page.getByRole('button', { name: /inloggen/i }).click();

  // 3. Wacht tot de terminal / planning geladen is (timeout ruimer voor netwerk/auth)
  await expect(page.getByText('Planning').first()).toBeVisible({ timeout: 15000 });

  // 4. Selecteer de eerste order uit de planningslijst
  // (We zoeken naar tekst die lijkt op een ordernummer, bijv beginnend met N200)
  await page.getByText(/N200/).first().click();

  // 5. Druk op de Start knop in het detailpaneel
  await page.getByRole('button', { name: /Start Productie/i }).click();

  // 6. Verifieer dat ProductionStartModal is geopend
  await expect(page.getByText('Order Start')).toBeVisible();

  // 7. Wissel naar Manuele modus (zoals aangegeven door de gebruiker)
  await page.getByRole('button', { name: /Manueel/i }).click();

  // 8. Simuleer de hardware scanner die het Ordernummer en 15-cijferig Lotnummer invult
  const testLotNumber = '402618418400001';
  
  await page.getByText(/Ordernummer \(scannen/i).locator('..').locator('input').fill('N20012345');
  await page.getByText(/Lotnummer \(scannen/i).locator('..').locator('input').fill(testLotNumber);
  
  // Druk op enter (simuleert de scanner terminator) en start de order auto-magisch
  await page.keyboard.press('Enter');

  // 9. Verifieer dat de modal sluit en het gescande 15-cijferige lot actief is in de UI
  await expect(page.getByText('Order Start')).not.toBeVisible();
  await expect(page.getByText(testLotNumber)).toBeVisible();
});
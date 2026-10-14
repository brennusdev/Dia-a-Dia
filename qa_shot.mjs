export default async function run(page) {
  // CEP da Zona Sul (Saúde/Jabaquara) para provar que NÃO é SP centro
  await page.fill("#buscaCep", "04301000");
  await page.fill("#buscaHora", "00:00");
  await page.click('button:has-text("Buscar")');
  await page.waitForSelector(".onibus-card", { timeout: 15000 });
  await page.evaluate(() =>
    document.getElementById("mapaReal").scrollIntoView({ block: "center" }),
  );
  await page.waitForTimeout(3500);
  return "ok";
}

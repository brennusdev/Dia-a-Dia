// QA: vínculo região->ônibus. Busca 2 CEPs distintos e confere
// se o centro do mapa muda e os ônibus são da região buscada.
export default async function run(page) {
  const out = {};

  // ---------- BUSCA 1: CEP da Praça da Sé (centro de SP) ----------
  await page.fill("#buscaCep", "01001000");
  await page.fill("#buscaHora", "00:00");
  await page.click('button:has-text("Buscar")');
  await page.waitForSelector(".onibus-card", { timeout: 15000 });
  await page.waitForTimeout(2500);

  out.busca1 = await page.evaluate(() => ({
    cep: document.getElementById("cepInfo").innerText.slice(0, 70),
    mapaCentro: window._mapa ? window._mapa.getCenter().toUrlValue() : "n/a",
    distancias: [...document.querySelectorAll(".onibus-card .onibus-info span")]
      .slice(0, 3)
      .map((e) => e.innerText),
  }));

  // ---------- BUSCA 2: CEP da Saúde/Jabaquara (zona sul, ~10 km) ----------
  await page.fill("#buscaCep", "04301000");
  await page.click('button:has-text("Buscar")');
  await page.waitForTimeout(3000);

  out.busca2 = await page.evaluate(() => ({
    cep: document.getElementById("cepInfo").innerText.slice(0, 70),
    mapaCentro: window._mapa ? window._mapa.getCenter().toUrlValue() : "n/a",
    distancias: [...document.querySelectorAll(".onibus-card .onibus-info span")]
      .slice(0, 3)
      .map((e) => e.innerText),
  }));

  return out;
}

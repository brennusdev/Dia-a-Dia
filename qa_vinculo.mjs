// QA: vínculo região->ônibus. Busca 2 CEPs distintos e confere
// se o mapa centra no local e os ônibus mudam de posição.
export default async function run(page) {
  const out = {};

  // ---------- BUSCA 1: CEP da Praça da Sé (centro de SP) ----------
  await page.fill("#buscaCep", "01001000");
  await page.fill("#buscaHora", "00:00");
  await page.click('button:has-text("Buscar")');
  await page.waitForSelector(".onibus-card", { timeout: 15000 });
  await page.waitForTimeout(2500); // rotas/tiles

  out.busca1 = await page.evaluate(() => {
    const centro = document
      .querySelector(".placa-onibus")
      ?.closest(".leaflet-marker-icon")?.style.transform;
    return {
      cep: document.getElementById("cepInfo").innerText.slice(0, 70),
      mapaCentro: window.mapa ? "via Leaflet" : "n/a",
      primeiroTransform: centro?.slice(0, 50),
      distancias: [
        ...document.querySelectorAll(".onibus-card .onibus-info span"),
      ]
        .slice(0, 3)
        .map((e) => e.innerText),
    };
  });

  // ---------- BUSCA 2: CEP do Jabaquara (zona sul, ~10 km de distância) ----------
  await page.fill("#buscaCep", "04301000");
  await page.click('button:has-text("Buscar")');
  await page.waitForTimeout(3000);

  out.busca2 = await page.evaluate(() => {
    return {
      cep: document.getElementById("cepInfo").innerText.slice(0, 70),
      primeiroTransform: document
        .querySelector(".placa-onibus")
        ?.closest(".leaflet-marker-icon")
        ?.style.transform?.slice(0, 50),
      distancias: [
        ...document.querySelectorAll(".onibus-card .onibus-info span"),
      ]
        .slice(0, 3)
        .map((e) => e.innerText),
    };
  });

  return out;
}

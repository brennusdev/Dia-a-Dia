// QA do vínculo região->ônibus via URLs dos tiles (sem depender de globals)
export default async function run(page) {
  const pegarTile = () =>
    page.evaluate(() => {
      const t = document.querySelector("img.leaflet-tile");
      return t ? t.src : "sem-tile";
    });

  // BUSCA 1: Praça da Sé
  await page.fill("#buscaCep", "01001000");
  await page.fill("#buscaHora", "00:00");
  await page.click('button:has-text("Buscar")');
  await page.waitForSelector(".onibus-card", { timeout: 15000 });
  await page.waitForTimeout(3000);
  const tile1 = await pegarTile();

  // BUSCA 2: Jabaquara/Saúde (zona sul, ~10 km)
  await page.fill("#buscaCep", "04301000");
  await page.click('button:has-text("Buscar")');
  await page.waitForTimeout(3500);
  const tile2 = await pegarTile();

  return {
    tile1: tile1.slice(0, 90),
    tile2: tile2.slice(0, 90),
    // tiles diferentes = o mapa está mostrando OUTRA região real
    mapaMoveu: tile1 !== tile2,
    cep2: await page.evaluate(() =>
      document.getElementById("cepInfo").innerText.slice(0, 80),
    ),
  };
}

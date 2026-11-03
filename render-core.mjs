// Headless-Chromium HTML → PDF for the batch export. Shared by the Vercel
// function (api/klien/render.js) and the Node server route.
//
// Chromium is the same engine behind the browser's own print dialog, so what
// comes out here matches "Print for Owner" — same stylesheet, same print
// media rules, same pagination. On Vercel the binary comes from
// @sparticuz/chromium; elsewhere set CHROME_PATH to a local Chrome/Chromium.
//
// The imports are dynamic so everything else in the repo (CLI, audit, the
// plain Node server without this route) stays runnable with no node_modules.

export async function renderPdf(html) {
  let puppeteer, launchOpts;
  try {
    puppeteer = (await import("puppeteer-core")).default;
    if (process.env.CHROME_PATH) {
      launchOpts = {
        executablePath: process.env.CHROME_PATH,
        args: ["--headless", "--no-sandbox", "--disable-dev-shm-usage"],
      };
    } else {
      const chromium = (await import("@sparticuz/chromium")).default;
      launchOpts = {
        executablePath: await chromium.executablePath(),
        args: chromium.args,
        headless: chromium.headless,
      };
    }
  } catch (e) {
    return { ok: false, error: "PDF renderer unavailable — install dependencies (npm install) or set CHROME_PATH to a Chrome binary. (" + (e && e.message ? e.message : e) + ")" };
  }
  let browser;
  try {
    browser = await puppeteer.launch(launchOpts);
    const page = await browser.newPage();
    // Drive can be slow on a cold thumbnail; a late image should degrade to
    // its placeholder, not kill the whole unit.
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 25000 }).catch(() => {});
    // Two bounded passes over the images: the page's <img> fallback swaps a
    // failed thumbnail to a second host, which starts a new load after the
    // first error resolves.
    for (let pass = 0; pass < 2; pass++) {
      await page.evaluate(() => Promise.race([
        Promise.all([...document.images].map((im) => im.complete ? 1 : new Promise((r) => { im.onload = im.onerror = r; }))),
        new Promise((r) => setTimeout(r, 12000)),
      ]));
    }
    const pdf = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true, // honours the stylesheet's @page { size:A4; margin:10mm }
      format: "a4",
    });
    return { ok: true, pdf };
  } catch (e) {
    return { ok: false, error: "render failed: " + (e && e.message ? e.message : e) };
  } finally {
    try { if (browser) await browser.close(); } catch {}
  }
}

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

// One browser per warm instance, shared across requests: launching Chromium
// is the expensive, memory-spiky part, and a batch run sends 19 sequential
// renders at the same instance — relaunching each time is what ran earlier
// runs out of memory mid-batch. Reuse also keeps Chromium's image cache, so
// the common-area photos repeated in every unit's report download once.
let browserPromise = null;

async function launch_() {
  const puppeteer = (await import("puppeteer-core")).default;
  if (process.env.CHROME_PATH) {
    return puppeteer.launch({
      executablePath: process.env.CHROME_PATH,
      args: ["--headless", "--no-sandbox", "--disable-dev-shm-usage"],
    });
  }
  const chromium = (await import("@sparticuz/chromium")).default;
  return puppeteer.launch({
    executablePath: await chromium.executablePath(),
    args: chromium.args,
    headless: chromium.headless,
  });
}

async function getBrowser_() {
  if (browserPromise) {
    const b = await browserPromise.catch(() => null);
    const alive = b && (typeof b.connected === "boolean" ? b.connected : b.isConnected());
    if (alive) return b;
    browserPromise = null;
  }
  browserPromise = launch_();
  return browserPromise;
}

export async function renderPdf(html) {
  let browser;
  try {
    browser = await getBrowser_();
  } catch (e) {
    browserPromise = null;
    return { ok: false, error: "PDF renderer unavailable — install dependencies (npm install) or set CHROME_PATH to a Chrome binary. (" + (e && e.message ? e.message : e) + ")" };
  }
  let page;
  try {
    page = await browser.newPage();
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
    // A dying browser would poison every later render in this warm instance —
    // drop it so the next request relaunches fresh.
    try { await browser.close(); } catch {}
    browserPromise = null;
    return { ok: false, error: "render failed: " + (e && e.message ? e.message : e) };
  } finally {
    try { if (page) await page.close(); } catch {}
  }
}

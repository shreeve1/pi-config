import puppeteer, { type Browser } from "puppeteer";

let browser: Browser | null = null;

/**
 * Get or launch a shared headless browser.
 * Callers should NOT close this — it's managed per-session.
 */
export async function getBrowser(): Promise<Browser> {
  if (browser && browser.connected) {
    return browser;
  }
  browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-first-run",
      "--no-zygote",
      "--single-process",
      "--disable-extensions",
    ],
  });
  return browser;
}

/**
 * Shut down the shared browser. Call on session_shutdown.
 */
export async function closeBrowser(): Promise<void> {
  if (browser) {
    try {
      await browser.close();
    } catch {
      // Already closed
    }
    browser = null;
  }
}

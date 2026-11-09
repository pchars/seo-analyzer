import { assertPublicHttpUrl } from './ssrf.js';

export async function renderHtml(pageUrl) {
    let chromium;
    try {
        ({ chromium } = await import('playwright-core'));
    } catch {
        return null;
    }

    let browser;
    try {
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage({
            userAgent: 'SEOAnalyzer/1.0',
            viewport: { width: 1366, height: 768 }
        });
        await page.route('**/*', async (route) => {
            const target = route.request().url();
            if (!/^https?:/i.test(target)) {
                await route.abort();
                return;
            }
            try {
                await assertPublicHttpUrl(target);
                await route.continue();
            } catch {
                await route.abort();
            }
        });
        await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 15_000 });
        await page.waitForTimeout(400);
        return await page.content();
    } catch (error) {
        console.error(`[render] ${error.message}`);
        return null;
    } finally {
        await browser?.close();
    }
}

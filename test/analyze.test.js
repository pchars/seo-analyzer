import assert from 'node:assert/strict';
import test from 'node:test';
import { parseHTML } from 'linkedom';
import { analyzeSnapshot } from '../lib/analyze.js';
import { Checks } from '../checks.js';
import { RUNNERS } from '../lib/evaluate.js';
import { collectResources, toPercentages } from '../lib/resources.js';
import { plural } from '../lib/html.js';
import { normalizeUrl } from '../lib/url.js';
import { parseCookieFlags, robotsBlocksPage } from '../lib/inspect.js';

installDomParser();

function installDomParser() {
    globalThis.DOMParser = class DOMParser {
        parseFromString(html) {
            return parseHTML(String(html)).document;
        }
    };
}

test('every published check has a runner', () => {
    assert.deepEqual(Checks.getAllIds().sort(), Object.keys(RUNNERS).sort());
    assert.equal(Checks.getTotalChecksCount(), 39);
});

test('normalizes public URLs and rejects anything else', () => {
    assert.equal(normalizeUrl('example.com'), 'https://example.com/');
    assert.equal(normalizeUrl('https://example.com/path'), 'https://example.com/path');
    assert.equal(normalizeUrl('javascript:alert(1)'), null);
    assert.equal(normalizeUrl('http://user:pass@example.com'), null);
    assert.equal(normalizeUrl(''), null);
});

test('pluralizes file counts', () => {
    assert.equal(plural(1, 'файл', 'файла', 'файлов'), 'файл');
    assert.equal(plural(2, 'файл', 'файла', 'файлов'), 'файла');
    assert.equal(plural(5, 'файл', 'файла', 'файлов'), 'файлов');
    assert.equal(plural(11, 'файл', 'файла', 'файлов'), 'файлов');
});

test('counts unique resources and keeps percentages at 100', () => {
    const html = `
        <link rel="stylesheet" href="/app.css">
        <link rel="stylesheet" href="/app.css">
        <script src="/app.js"></script>
        <img src="/photo.webp" alt="Фото">
        <img src="/photo.webp" alt="Фото">
        <img srcset="/wide.webp 800w, /small.webp 400w">
    `;
    const collected = collectResources(html, 'https://example.com/');
    assert.equal(collected.counts.css, 1);
    assert.equal(collected.counts.js, 1);
    assert.equal(collected.counts.images, 3);
    assert.equal(Object.values(collected.percentages).reduce((sum, value) => sum + value, 0), 100);
    assert.deepEqual(toPercentages({ html: 1, css: 1, js: 0, images: 0, fonts: 0, other: 0 }).html, 50);
});

test('scores a prepared page highly and a bare page poorly', () => {
    const title = 'Пример хорошей страницы для проверки SEO';
    const description = 'Описание страницы для поисковой выдачи и сниппета. '.repeat(2).trim();
    assert.ok(title.length >= 30 && title.length <= 65);
    assert.ok(description.length >= 70 && description.length <= 160);

    const good = analyzeSnapshot({
        requestedUrl: 'https://example.com/',
        finalUrl: 'https://example.com/',
        ttfbMs: 80,
        downloadMs: 400,
        htmlBytes: 20_000,
        httpVersion: 'h2',
        redirectCount: 1,
        tlsProtocol: 'TLSv1.3',
        cookies: [{ secure: true, httpOnly: true, sameSite: 'lax' }],
        headers: {
            'content-encoding': 'gzip',
            'content-security-policy': "default-src 'self'",
            'x-frame-options': 'DENY',
            'x-content-type-options': 'nosniff',
            'strict-transport-security': 'max-age=15552000'
        },
        html: `<!doctype html>
            <html lang="ru">
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>${title}</title>
                <meta name="description" content="${description}">
                <link rel="canonical" href="https://example.com/">
                <link rel="icon" href="/favicon.ico">
                <meta property="og:title" content="Пример">
                <meta property="og:description" content="Описание">
                <meta property="og:image" content="https://example.com/cover.webp">
                <meta name="twitter:card" content="summary_large_image">
                <link rel="stylesheet" href="/app.min.css">
                <link rel="preload" href="/app.min.css" as="style">
                <script type="application/ld+json">{"@type":"BreadcrumbList"}</script>
            </head>
            <body>
                <h1>Заголовок</h1>
                <img src="/photo.webp" alt="Фото" width="800" height="600">
                <a href="/about">О компании</a>
                <script src="/app.min.js" defer></script>
            </body>
            </html>`,
        robots: { exists: true, mentionsSitemap: true },
        sitemap: { exists: true },
        staticSample: [{
            url: 'https://example.com/app.min.css',
            ok: true,
            cacheControl: 'public, max-age=31536000, immutable',
            contentEncoding: 'br'
        }]
    });

    assert.ok(good.overallScore >= 90, failedChecks(good).join('\n'));
    assert.equal(good.success, true);
    assert.equal(good.categoryScores.speed.total, 13);
    assert.equal(good.categoryScores.seo.total, 14);
    assert.equal(good.categoryScores.tech.total, 12);

    const bare = analyzeSnapshot({
        requestedUrl: 'http://example.com/',
        finalUrl: 'http://example.com/',
        ttfbMs: 900,
        downloadMs: 3000,
        htmlBytes: 400 * 1024,
        httpVersion: 'http/1.1',
        headers: {},
        html: '<html><body>hi</body></html>',
        robots: { exists: false, mentionsSitemap: false },
        sitemap: { exists: false },
        staticSample: []
    });

    assert.ok(bare.overallScore < 50, String(bare.overallScore));
    assert.equal(bare.techChecks.find((check) => check.id === 'hsts').status, 'na');
    assert.equal(bare.techChecks.find((check) => check.id === 'tls').status, 'na');
    assert.equal(bare.seoChecks.find((check) => check.id === 'title').status, 'bad');
    assert.equal(bare.recommendations.some((item) => item.priority === 'high'), true);
    assert.equal(bare.techChecks.find((check) => check.id === 'charset').status, 'warning');
});

test('noindex and mixed content are reported on their own', () => {
    const report = analyzeSnapshot({
        requestedUrl: 'https://example.com/',
        finalUrl: 'https://example.com/',
        ttfbMs: 100,
        downloadMs: 200,
        htmlBytes: 1000,
        httpVersion: 'h2',
        headers: { 'content-type': 'text/html; charset=utf-8' },
        html: `<!doctype html><html lang="ru"><head>
            <meta charset="utf-8">
            <meta name="robots" content="noindex, nofollow">
            <title>Закрытая страница с достаточным заголовком для проверки</title>
            </head><body><h1>Закрыто</h1><img src="http://cdn.example.com/a.jpg" alt=""></body></html>`,
        robots: { exists: true, mentionsSitemap: false },
        sitemap: { exists: true },
        staticSample: []
    });
    assert.equal(report.seoChecks.find((check) => check.id === 'meta-robots').status, 'bad');
    assert.equal(report.techChecks.find((check) => check.id === 'mixed-content').status, 'bad');
    assert.equal(report.speedChecks.find((check) => check.id === 'image-dimensions').status, 'bad');
});

test('robots.txt can close the inspected page without closing the whole site', () => {
    assert.equal(robotsBlocksPage('User-agent: *\nDisallow: /private', '/private/item'), true);
    assert.equal(robotsBlocksPage('User-agent: *\nDisallow: /\nAllow: /ok', '/ok'), false);
    assert.equal(robotsBlocksPage('User-agent: Googlebot\nDisallow: /', '/'), false);

    const closed = analyzeSnapshot({
        requestedUrl: 'https://example.com/private',
        finalUrl: 'https://example.com/private',
        ttfbMs: 100,
        downloadMs: 200,
        htmlBytes: 1000,
        httpVersion: 'h2',
        headers: {},
        html: '<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Закрытый раздел каталога для проверки</title></head><body><h1>Закрыто</h1></body></html>',
        robots: { exists: true, mentionsSitemap: false, blocksPage: true },
        sitemap: { exists: true },
        staticSample: []
    });
    assert.equal(closed.seoChecks.find((check) => check.id === 'robots-access').status, 'bad');
    assert.equal(closed.seoChecks.find((check) => check.id === 'internal-links').status, 'warning');
});

test('redirects, foreign hosts, HSTS, cookies and TLS use only the snapshot', () => {
    assert.deepEqual(
        parseCookieFlags('id=1; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Secure; HttpOnly; SameSite=Lax'),
        [{ secure: true, httpOnly: true, sameSite: 'lax' }]
    );

    const hosts = Array.from({ length: 9 }, (_, index) => `<script src="https://cdn${index}.example.net/a.js"></script>`).join('');
    const report = analyzeSnapshot({
        requestedUrl: 'http://shop.example/start',
        finalUrl: 'https://shop.example/catalog',
        redirectCount: 2,
        tlsProtocol: 'TLSv1.1',
        ttfbMs: 100,
        downloadMs: 200,
        htmlBytes: 1000,
        httpVersion: 'h2',
        headers: { 'strict-transport-security': 'max-age=0' },
        cookies: [{ secure: false, httpOnly: false, sameSite: '' }],
        html: `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Каталог магазина с длинным заголовком</title></head><body><h1>Каталог</h1>${hosts}</body></html>`,
        robots: { exists: true, mentionsSitemap: true },
        sitemap: { exists: true },
        staticSample: []
    });

    assert.equal(report.speedChecks.find((check) => check.id === 'redirects').status, 'warning');
    assert.equal(report.speedChecks.find((check) => check.id === 'third-party').status, 'warning');
    assert.equal(report.techChecks.find((check) => check.id === 'hsts').status, 'warning');
    assert.equal(report.techChecks.find((check) => check.id === 'cookies').status, 'warning');
    assert.equal(report.techChecks.find((check) => check.id === 'tls').status, 'bad');

    const advice = report.recommendations.find((item) => item.title === 'Версия TLS');
    assert.match(advice.description, /TLSv1\.1/);
    assert.match(advice.detail, /TLS 1\.2/);
    assert.ok(advice.detail.length > advice.description.length);
});

function failedChecks(report) {
    return [...report.speedChecks, ...report.seoChecks, ...report.techChecks]
        .filter((check) => check.status !== 'good')
        .map((check) => `${check.id}: ${check.status}: ${check.value}`);
}

import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import zlib from 'node:zlib';
import { clientAddress, createApp, safeFilePath } from '../server.js';

test('serves the app and inspects a page only when private targets are allowed', async () => {
    const previous = process.env.ALLOW_PRIVATE_TARGETS;
    const html = '<!doctype html><html lang="ru"><head><title>Пример страницы для локальной проверки анализатора</title></head><body><h1>Пример</h1><link rel="stylesheet" href="/app.min.css"></body></html>';
    const gzipped = zlib.gzipSync(html);

    const fixture = http.createServer((req, res) => {
        if (req.url === '/robots.txt') {
            res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
            res.end('User-agent: *\nAllow: /\nSitemap: /sitemap.xml\n');
            return;
        }
        if (req.url === '/sitemap.xml') {
            res.writeHead(200, { 'content-type': 'application/xml' });
            res.end('<urlset></urlset>');
            return;
        }
        if (req.url === '/app.min.css') {
            res.writeHead(200, {
                'content-type': 'text/css',
                'cache-control': 'public, max-age=31536000, immutable',
                'content-encoding': 'gzip'
            });
            res.end('');
            return;
        }
        res.writeHead(200, {
            'content-type': 'text/html; charset=utf-8',
            'content-encoding': 'gzip',
            'content-security-policy': "default-src 'self'",
            'x-frame-options': 'DENY',
            'x-content-type-options': 'nosniff'
        });
        res.end(gzipped);
    });
    await listen(fixture);

    const app = createApp();
    await listen(app);
    const base = `http://127.0.0.1:${app.address().port}`;

    try {
        delete process.env.ALLOW_PRIVATE_TARGETS;
        const blocked = await fetch(`${base}/api/inspect?url=${encodeURIComponent('http://127.0.0.1/')}`);
        assert.equal(blocked.status, 400);

        const hidden = await fetch(`${base}/node_modules/linkedom/package.json`);
        assert.equal(hidden.status, 403);
        assert.equal(safeFilePath('../package.json'), null);
        assert.equal(safeFilePath('..\\..\\Windows\\win.ini'), null);
        assert.equal(safeFilePath('node_modules/linkedom/package.json'), null);

        const page = await fetch(`${base}/`);
        assert.equal(page.status, 200);
        assert.match(await page.text(), /SEO Analyzer/);
        assert.match(page.headers.get('content-security-policy') || '', /frame-ancestors 'none'/);
        assert.equal(page.headers.get('x-frame-options'), 'DENY');

        const pdfResponse = await fetch(`${base}/api/pdf`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                url: 'https://example.com/',
                date: '09.11.2026',
                time: '12:00:00',
                overallScore: 10,
                speedChecks: [],
                seoChecks: [],
                techChecks: [],
                recommendations: [],
                categoryScores: {
                    speed: { good: 0, total: 0 },
                    seo: { good: 0, total: 0 },
                    tech: { good: 0, total: 0 }
                }
            })
        });
        const pdf = Buffer.from(await pdfResponse.arrayBuffer());
        assert.equal(pdfResponse.status, 200);
        assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');

        process.env.ALLOW_PRIVATE_TARGETS = '1';
        const target = `http://127.0.0.1:${fixture.address().port}/`;
        const response = await fetch(`${base}/api/inspect?url=${encodeURIComponent(target)}`);
        const body = await response.json();
        assert.equal(response.status, 200, body.error);
        assert.match(body.html, /Пример/);
        assert.equal(body.headers['content-encoding'], 'gzip');
        assert.equal(body.robots.exists, true);
        assert.equal(body.robots.mentionsSitemap, true);
        assert.equal(body.sitemap.exists, true);
        assert.equal(body.staticSample[0].ok, true);
        assert.match(body.staticSample[0].cacheControl, /max-age=31536000/);
    } finally {
        if (previous === undefined) delete process.env.ALLOW_PRIVATE_TARGETS;
        else process.env.ALLOW_PRIVATE_TARGETS = previous;
        fixture.close();
        app.close();
    }
});

test('client address trusts the proxy only when asked', () => {
    const req = {
        socket: { remoteAddress: '::ffff:10.0.0.5' },
        headers: {
            'x-forwarded-for': '1.2.3.4, 10.0.0.8',
            'x-real-ip': '203.0.113.9'
        }
    };
    assert.equal(clientAddress(req, false), '10.0.0.5');
    assert.equal(clientAddress(req, true), '203.0.113.9');
    delete req.headers['x-real-ip'];
    assert.equal(clientAddress(req, true), '10.0.0.8');
});

function listen(server) {
    return new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
}

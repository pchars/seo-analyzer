import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import zlib from 'node:zlib';
import { assertPublicHttpUrl, httpError, resolvePinnedAddress } from './ssrf.js';

const MAX_BYTES = 1_500_000;
const TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 5;

export async function inspectUrl(rawUrl) {
    let current = await assertPublicHttpUrl(rawUrl);
    let response = null;
    const started = performance.now();
    let ttfbMs = 0;
    let redirectCount = 0;

    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
        response = await requestRaw(current);
        if (redirect === 0) ttfbMs = Math.round(performance.now() - started);
        if (![301, 302, 303, 307, 308].includes(response.status)) break;
        redirectCount += 1;
        if (redirect === MAX_REDIRECTS) throw httpError(502, 'Слишком много редиректов');
        const location = response.headers.location;
        if (!location) throw httpError(502, 'Редирект без адреса');
        current = await assertPublicHttpUrl(new URL(location, current).href);
    }

    if (response.status < 200 || response.status >= 300) {
        throw httpError(502, `Сайт ответил кодом ${response.status}`);
    }

    const encoding = response.headers['content-encoding'] || '';
    const decoded = decodeBody(response.raw, encoding);
    let html = decodeText(decoded, response.headers['content-type']);
    const downloadMs = Math.round(performance.now() - started);
    const origin = current.origin;

    let rendered = false;
    if (process.env.ENABLE_BROWSER === '1') {
        try {
            const { renderHtml } = await import('./render.js');
            const browserHtml = await renderHtml(current.href);
            if (browserHtml && browserHtml.length > 80) {
                html = browserHtml;
                rendered = true;
            }
        } catch (error) {
            console.error(`[render] ${error.message}`);
        }
    }

    const [robots, rootSitemap, httpVersion, staticSample] = await Promise.all([
        readRobots(origin),
        probeExists(`${origin}/sitemap.xml`),
        current.protocol === 'https:'
            ? detectAlpn(current.hostname, Number(current.port) || 443)
            : Promise.resolve('http/1.1'),
        sampleStatic(html, current)
    ]);

    let sitemapExists = rootSitemap;
    if (!sitemapExists && robots.sitemapUrl) {
        try {
            const sitemapUrl = await assertPublicHttpUrl(new URL(robots.sitemapUrl, origin).href);
            sitemapExists = await probeExists(sitemapUrl.href);
        } catch {
            sitemapExists = false;
        }
    }

    return {
        requestedUrl: rawUrl,
        finalUrl: current.href,
        status: response.status,
        ttfbMs,
        downloadMs,
        htmlBytes: decoded.length,
        redirectCount,
        tlsProtocol: response.tlsProtocol || '',
        cookies: response.cookies || [],
        httpVersion,
        headers: pickHeaders(response.headers),
        html,
        robots: {
            exists: robots.exists,
            mentionsSitemap: Boolean(robots.sitemapUrl),
            blocksPage: robots.exists && robotsBlocksPage(robots.text, current.pathname)
        },
        sitemap: { exists: sitemapExists },
        staticSample,
        rendered
    };
}

export function toPublicError(error) {
    if (error?.statusCode) return error;
    if (error?.code === 'ENOTFOUND') return httpError(404, 'Домен не найден');
    if (error?.code === 'ECONNREFUSED') return httpError(502, 'Сервер отклонил соединение');
    if (error?.code === 'ETIMEDOUT' || error?.code === 'UND_ERR_CONNECT_TIMEOUT') {
        return httpError(504, 'Таймаут запроса');
    }
    return httpError(502, 'Не удалось загрузить страницу');
}

async function requestRaw(url, { method = 'GET', maxBytes = MAX_BYTES, timeout = TIMEOUT_MS, readBody = true } = {}) {
    const pinned = await resolvePinnedAddress(url);
    return new Promise((resolve, reject) => {
        let settled = false;
        const fail = (error) => {
            if (settled) return;
            settled = true;
            reject(error);
        };
        const succeed = (value) => {
            if (settled) return;
            settled = true;
            resolve(value);
        };

        const lib = url.protocol === 'https:' ? https : http;
        const req = lib.request({
            protocol: url.protocol,
            hostname: url.hostname,
            port: url.port || undefined,
            path: `${url.pathname}${url.search}`,
            method,
            timeout,
            servername: url.hostname,
            lookup(_hostname, options, callback) {
                if (typeof options === 'function') {
                    callback = options;
                    options = {};
                }
                if (options?.all) callback(null, [{ address: pinned.address, family: pinned.family }]);
                else callback(null, pinned.address, pinned.family);
            },
            headers: {
                'user-agent': 'SEOAnalyzer/1.0',
                accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
                'accept-language': 'ru,en;q=0.8',
                'accept-encoding': 'gzip, deflate, br'
            }
        }, (res) => {
            const headers = normalizeHeaders(res.headers);
            const transport = {
                tlsProtocol: url.protocol === 'https:' && typeof res.socket?.getProtocol === 'function'
                    ? (res.socket.getProtocol() || '')
                    : '',
                cookies: parseCookieFlags(res.headers['set-cookie'])
            };
            if (!readBody) {
                res.resume();
                succeed({ status: res.statusCode || 0, headers, raw: Buffer.alloc(0), ...transport });
                return;
            }

            const chunks = [];
            let size = 0;
            res.on('data', (chunk) => {
                size += chunk.length;
                if (size > maxBytes) {
                    res.destroy();
                    req.destroy();
                    fail(httpError(413, 'Ответ больше 1.5 МБ'));
                } else {
                    chunks.push(chunk);
                }
            });
            res.on('end', () => succeed({
                status: res.statusCode || 0,
                headers,
                raw: Buffer.concat(chunks),
                ...transport
            }));
            res.on('error', fail);
        });

        req.on('timeout', () => {
            req.destroy();
            fail(httpError(504, 'Таймаут запроса'));
        });
        req.on('error', fail);
        req.end();
    });
}

export function parseCookieFlags(header) {
    const list = Array.isArray(header) ? header : (header ? [header] : []);
    return list.filter(Boolean).map((line) => {
        const attributes = String(line).split(';').slice(1).map((part) => part.trim().toLowerCase());
        const same = attributes.find((part) => part.startsWith('samesite='));
        return {
            secure: attributes.includes('secure'),
            httpOnly: attributes.includes('httponly'),
            sameSite: same ? same.slice('samesite='.length).trim() : ''
        };
    });
}

export function robotsBlocksPage(text, pathname) {
    const groups = [];
    let agents = [];
    let rules = [];
    const flush = () => {
        if (agents.length === 0) return;
        groups.push({ agents: agents.slice(), rules: rules.slice() });
        agents = [];
        rules = [];
    };
    for (const raw of String(text || '').split(/\r?\n/)) {
        const line = raw.replace(/#.*$/, '').trim();
        if (!line) continue;
        const agent = /^user-agent:\s*(.*)$/i.exec(line);
        if (agent) {
            if (rules.length > 0) flush();
            agents.push(agent[1].trim().toLowerCase());
            continue;
        }
        const disallow = /^disallow:\s*(.*)$/i.exec(line);
        const allow = /^allow:\s*(.*)$/i.exec(line);
        if (!disallow && !allow) continue;
        const pattern = (disallow || allow)[1].trim();
        if (!pattern) continue;
        rules.push({ allow: Boolean(allow), pattern });
    }
    flush();

    const starRules = groups
        .filter((group) => group.agents.includes('*'))
        .flatMap((group) => group.rules);
    let best = null;
    for (const rule of starRules) {
        if (!robotsPatternMatches(rule.pattern, pathname || '/')) continue;
        const length = rule.pattern.replace(/\$$/, '').length;
        if (!best || length > best.length || (length === best.length && rule.allow)) {
            best = { length, allow: rule.allow };
        }
    }
    return Boolean(best && !best.allow);
}

function robotsPatternMatches(pattern, pathname) {
    const end = pattern.endsWith('$');
    const body = end ? pattern.slice(0, -1) : pattern;
    const source = [...body].map((char) => (char === '*' ? '.*' : char.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))).join('');
    return new RegExp(`^${source}${end ? '$' : ''}`).test(pathname);
}

async function readRobots(origin) {
    try {
        const response = await requestRaw(new URL('/robots.txt', origin), { maxBytes: 100_000 });
        if (response.status !== 200) return { exists: false, sitemapUrl: '', text: '' };
        const text = decodeBody(response.raw, response.headers['content-encoding']).toString('utf8');
        const sitemap = text.match(/^Sitemap:\s*(\S+)/im);
        return { exists: true, sitemapUrl: sitemap?.[1] || '', text };
    } catch {
        return { exists: false, sitemapUrl: '', text: '' };
    }
}

async function probeExists(url) {
    try {
        const head = await requestRaw(new URL(url), { method: 'HEAD', readBody: false, timeout: 8000 });
        if (head.status >= 200 && head.status < 300) return true;
        if (head.status !== 405 && head.status !== 501) return false;
        const get = await requestRaw(new URL(url), { maxBytes: 1024, timeout: 8000 });
        return get.status >= 200 && get.status < 300;
    } catch {
        return false;
    }
}

async function sampleStatic(html, pageUrl) {
    const found = [];
    const pattern = /\s(?:href|src)\s*=\s*["']([^"']+)["']/gi;
    for (const match of html.matchAll(pattern)) {
        try {
            const asset = new URL(match[1], pageUrl);
            if (asset.origin !== pageUrl.origin) continue;
            if (!/\.(css|js|mjs|png|jpe?g|gif|webp|avif|svg|ico|woff2?)$/i.test(asset.pathname)) continue;
            if (found.some((item) => item.href === asset.href)) continue;
            found.push(asset);
        } catch {
            continue;
        }
        if (found.length === 3) break;
    }

    const samples = [];
    for (const asset of found) {
        try {
            const safe = await assertPublicHttpUrl(asset.href);
            let response = await requestRaw(safe, { method: 'HEAD', readBody: false, timeout: 8000 });
            if (response.status === 405 || response.status === 501) {
                response = await requestRaw(safe, { maxBytes: 1024, timeout: 8000 });
            }
            samples.push({
                url: asset.href,
                ok: response.status >= 200 && response.status < 400,
                cacheControl: response.headers['cache-control'] || '',
                contentEncoding: response.headers['content-encoding'] || ''
            });
        } catch {
            samples.push({ url: asset.href, ok: false, cacheControl: '', contentEncoding: '' });
        }
    }
    return samples;
}

async function detectAlpn(hostname, port) {
    const pinned = await resolvePinnedAddress(new URL(`https://${hostname}:${port}`));
    return new Promise((resolve) => {
        const socket = tls.connect({
            host: pinned.address,
            port,
            servername: hostname,
            ALPNProtocols: ['h2', 'http/1.1'],
            timeout: 5000
        }, () => {
            const protocol = socket.alpnProtocol === 'h2' ? 'h2' : 'http/1.1';
            socket.end();
            resolve(protocol);
        });
        socket.on('timeout', () => {
            socket.destroy();
            resolve('unknown');
        });
        socket.on('error', () => resolve('unknown'));
    });
}

function pickHeaders(headers) {
    const names = [
        'content-type',
        'content-encoding',
        'cache-control',
        'content-security-policy',
        'content-security-policy-report-only',
        'x-frame-options',
        'x-content-type-options',
        'strict-transport-security',
        'referrer-policy',
        'x-robots-tag'
    ];
    return Object.fromEntries(names.map((name) => [name, headers[name] || '']));
}

function normalizeHeaders(headers) {
    return Object.fromEntries(Object.entries(headers).map(([key, value]) => [
        key.toLowerCase(),
        Array.isArray(value) ? value.join(', ') : String(value ?? '')
    ]));
}

function decodeBody(buffer, encoding) {
    const value = (encoding || '').toLowerCase();
    try {
        if (value.includes('br')) return zlib.brotliDecompressSync(buffer);
        if (value.includes('gzip')) return zlib.gunzipSync(buffer);
        if (value.includes('deflate')) return zlib.inflateSync(buffer);
    } catch {
        throw httpError(502, 'Не удалось распаковать ответ');
    }
    return buffer;
}

function decodeText(buffer, contentType) {
    const preview = buffer.subarray(0, 2048).toString('latin1');
    const charset = charsetFrom(contentType, preview);
    try {
        return new TextDecoder(charset).decode(buffer);
    } catch {
        return buffer.toString('utf8');
    }
}

function charsetFrom(contentType, preview) {
    const header = /charset\s*=\s*["']?([^"';\s]+)/i.exec(contentType || '');
    if (header) return header[1].toLowerCase();
    const meta = /charset\s*=\s*["']?([^"'\s>]+)/i.exec(preview || '');
    return meta ? meta[1].toLowerCase() : 'utf-8';
}

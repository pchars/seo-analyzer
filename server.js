import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inspectUrl, toPublicError } from './lib/inspect.js';
import { renderPdf } from './lib/pdf-report.js';
import { createFileLimiter, createMemoryLimiter, createSemaphore } from './lib/limit.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const RATE_LIMIT = Number(process.env.RATE_LIMIT) || 10;
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT) || 2;
const allowMemory = createMemoryLimiter(RATE_LIMIT);
const allowFile = process.env.RATE_LIMIT_FILE
    ? createFileLimiter(process.env.RATE_LIMIT_FILE, RATE_LIMIT)
    : null;
const inspectSlots = createSemaphore(MAX_CONCURRENT);

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf'
};

const SECURITY_HEADERS = {
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'content-security-policy': [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self'",
        "font-src 'self'",
        "img-src 'self' data:",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'"
    ].join('; ')
};

export function createApp() {
    const server = http.createServer((req, res) => {
        handleRequest(req, res).catch((error) => {
            sendJson(res, 500, { error: 'Внутренняя ошибка сервера' });
            console.error(error);
        });
    });
    server.requestTimeout = 120_000;
    server.headersTimeout = 20_000;
    server.keepAliveTimeout = 10_000;
    return server;
}

export async function handleRequest(req, res) {
    const url = new URL(req.url || '/', 'http://localhost');

    if (url.pathname === '/api/inspect') {
        if (req.method !== 'GET') {
            sendJson(res, 405, { error: 'Нужен метод GET' });
            return;
        }
        if (!await allowRequest(clientAddress(req))) {
            sendJson(res, 429, { error: 'Слишком много запросов, попробуйте через минуту' });
            return;
        }
        if (!inspectSlots.tryEnter()) {
            sendJson(res, 429, { error: 'Сервер уже проверяет другие сайты, попробуйте через несколько секунд' });
            return;
        }
        try {
            const snapshot = await inspectUrl(url.searchParams.get('url') || '');
            sendJson(res, 200, snapshot);
        } catch (error) {
            const pub = toPublicError(error);
            sendJson(res, pub.statusCode, { error: pub.message });
        } finally {
            inspectSlots.leave();
        }
        return;
    }

    if (url.pathname === '/api/pdf') {
        if (req.method !== 'POST') {
            sendJson(res, 405, { error: 'Нужен метод POST' });
            return;
        }
        if (!await allowRequest(clientAddress(req))) {
            sendJson(res, 429, { error: 'Слишком много запросов, попробуйте через минуту' });
            return;
        }
        try {
            const raw = await readBody(req, 1_000_000);
            const results = JSON.parse(raw.toString('utf8'));
            const pdf = await renderPdf(results);
            res.writeHead(200, {
                ...SECURITY_HEADERS,
                'content-type': 'application/pdf',
                'content-length': pdf.length,
                'content-disposition': 'attachment; filename="seo-report.pdf"',
                'cache-control': 'no-store'
            });
            res.end(pdf);
        } catch {
            sendJson(res, 400, { error: 'Не удалось собрать PDF' });
        }
        return;
    }

    await serveStatic(url.pathname, res);
}

async function serveStatic(pathname, res) {
    const filePath = safeFilePath(pathname);
    if (!filePath) {
        sendText(res, 403, 'Запрещено');
        return;
    }

    try {
        const stat = await fs.stat(filePath);
        if (!stat.isFile()) {
            sendText(res, 404, 'Не найдено');
            return;
        }
        const body = await fs.readFile(filePath);
        const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
        const cache = filePath.includes(`${path.sep}vendor${path.sep}`) || filePath.includes(`${path.sep}fonts${path.sep}`)
            ? 'public, max-age=86400'
            : 'no-store';
        res.writeHead(200, {
            ...SECURITY_HEADERS,
            'content-type': type,
            'content-length': body.length,
            'cache-control': cache
        });
        res.end(body);
    } catch {
        sendText(res, 404, 'Не найдено');
    }
}

export function safeFilePath(urlPath) {
    let decoded;
    try {
        decoded = decodeURIComponent(urlPath.split('?')[0]);
    } catch {
        return null;
    }
    const rel = decoded.replace(/^[/\\]+/, '');
    if (!rel) return path.join(ROOT, 'index.html');
    if (rel.split(/[/\\]/).some((part) => part === '..' || part.startsWith('.'))) return null;
    if (/^(node_modules|test)([/\\]|$)/.test(rel)) return null;

    const full = path.resolve(ROOT, rel);
    const rootWithSep = ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep;
    if (full !== ROOT && !full.startsWith(rootWithSep)) return null;
    return full;
}

async function allowRequest(ip) {
    if (allowFile) return allowFile(ip);
    return allowMemory(ip);
}

function readBody(req, maxBytes) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        let settled = false;
        const timer = setTimeout(() => {
            finish(new Error('timeout'));
            req.destroy();
        }, 20_000);
        const finish = (error, value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (error) reject(error);
            else resolve(value);
        };
        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > maxBytes) {
                finish(new Error('too large'));
                req.destroy();
            } else {
                chunks.push(chunk);
            }
        });
        req.on('end', () => finish(null, Buffer.concat(chunks)));
        req.on('error', (error) => finish(error));
    });
}

export function clientAddress(req, trustProxy = process.env.TRUST_PROXY === '1') {
    const socketIp = normalizeIp(req.socket?.remoteAddress);
    if (!trustProxy) return socketIp;
    const real = headerValue(req.headers?.['x-real-ip']);
    if (real) return normalizeIp(real);
    const forwarded = headerValue(req.headers?.['x-forwarded-for'])
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
    return forwarded.length ? normalizeIp(forwarded[forwarded.length - 1]) : socketIp;
}

function headerValue(value) {
    if (Array.isArray(value)) return value.join(',');
    return String(value || '');
}

function normalizeIp(ip) {
    const value = String(ip || '').trim().replace(/^::ffff:/i, '');
    return value || 'unknown';
}

function sendJson(res, status, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
        ...SECURITY_HEADERS,
        'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(body),
        'cache-control': 'no-store'
    });
    res.end(body);
}

function sendText(res, status, message) {
    res.writeHead(status, { ...SECURITY_HEADERS, 'content-type': 'text/plain; charset=utf-8' });
    res.end(message);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
    if (!process.env.ENABLE_BROWSER) process.env.ENABLE_BROWSER = '1';
    createApp().listen(PORT, HOST, () => {
        console.log(`SEO Analyzer слушает http://${HOST}:${PORT}`);
    });
}

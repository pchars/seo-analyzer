import net from 'node:net';
import { lookup } from 'node:dns/promises';
import { normalizeUrl } from './url.js';

const BLOCKED_HOSTS = new Set([
    'localhost',
    'localhost.localdomain',
    'metadata.google.internal',
    'metadata.internal'
]);

export function httpError(statusCode, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

export function isBlockedAddress(address) {
    let ip = String(address || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
    if (!ip) return true;

    if (ip.startsWith('::ffff:')) {
        const mapped = ip.slice('::ffff:'.length);
        if (net.isIP(mapped) === 4) return isBlockedAddress(mapped);
    }

    const shorthand = expandIPv4(ip);
    if (shorthand) ip = shorthand;

    if (net.isIP(ip) === 6) {
        return ip === '::1'
            || ip === '::'
            || ip.startsWith('fc')
            || ip.startsWith('fd')
            || ip.startsWith('fe80');
    }

    if (net.isIP(ip) !== 4) return true;

    const [a, b] = ip.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
}

export async function assertPublicHttpUrl(value, options = {}) {
    const allowPrivate = options.allowPrivate ?? process.env.ALLOW_PRIVATE_TARGETS === '1';
    const href = normalizeUrl(value);
    if (!href) throw httpError(400, 'Нужен абсолютный http(s) URL без логина и пароля');

    const url = new URL(href);
    const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();

    if (BLOCKED_HOSTS.has(hostname) || hostname.endsWith('.localhost')) {
        if (!allowPrivate) throw httpError(400, 'Локальные адреса проверять нельзя');
        return url;
    }

    if (/^\d+$/.test(hostname) || /^0x[0-9a-f]+$/i.test(hostname)) {
        throw httpError(400, 'Такой адрес хоста не поддерживается');
    }

    if (hostname.split('.').some((part) => part.length > 1 && part.startsWith('0'))) {
        throw httpError(400, 'Такой адрес хоста не поддерживается');
    }

    const literal = expandIPv4(hostname) || ((net.isIP(hostname) || hostname.includes(':')) ? hostname : null);
    if (literal) {
        if (!allowPrivate && isBlockedAddress(literal)) {
            throw httpError(400, 'Внутренние и локальные адреса проверять нельзя');
        }
        return url;
    }

    let records;
    try {
        records = await lookup(hostname, { all: true, verbatim: true });
    } catch {
        throw httpError(404, 'Домен не найден');
    }

    if (!allowPrivate && records.some((record) => isBlockedAddress(record.address))) {
        throw httpError(400, 'Домен указывает на внутренний адрес');
    }

    return url;
}

export async function resolvePinnedAddress(url) {
    const allowPrivate = process.env.ALLOW_PRIVATE_TARGETS === '1';
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    const literal = expandIPv4(hostname) || (net.isIP(hostname) ? hostname : null);

    if (literal) {
        if (!allowPrivate && isBlockedAddress(literal)) {
            throw httpError(400, 'Внутренние и локальные адреса проверять нельзя');
        }
        return { address: literal, family: net.isIP(literal) === 6 ? 6 : 4 };
    }

    const records = await lookup(hostname, { all: true, verbatim: true });
    if (!records.length) throw httpError(404, 'Домен не найден');
    if (!allowPrivate && records.some((record) => isBlockedAddress(record.address))) {
        throw httpError(400, 'Домен указывает на внутренний адрес');
    }

    const chosen = records.find((record) => allowPrivate || !isBlockedAddress(record.address));
    return { address: chosen.address, family: chosen.family };
}

function expandIPv4(hostname) {
    if (!/^\d{1,3}(\.\d{1,3}){0,3}$/.test(hostname)) return null;
    const parts = hostname.split('.').map(Number);
    if (parts.some((part) => part > 255)) return null;
    if (parts.length === 4) return parts.join('.');
    if (parts.length === 3) return `${parts[0]}.${parts[1]}.0.${parts[2]}`;
    if (parts.length === 2) return `${parts[0]}.0.0.${parts[1]}`;
    return null;
}

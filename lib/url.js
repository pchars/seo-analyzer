export function normalizeUrl(value) {
    const trimmed = String(value ?? '').trim();
    if (!trimmed || trimmed.length > 2000) return null;

    const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
        ? trimmed
        : `https://${trimmed}`;

    let url;
    try {
        url = new URL(withProtocol);
    } catch {
        return null;
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;
    if (!url.hostname || url.hostname.length > 253) return null;

    return url.href;
}

import { plural } from './html.js';

const COUNTS = () => ({ html: 0, css: 0, js: 0, images: 0, fonts: 0, other: 0 });

export function collectResources(html, baseUrl) {
    const doc = new DOMParser().parseFromString(html || '', 'text/html');
    return collectFromDocument(doc, baseUrl);
}

export function collectFromDocument(doc, baseUrl) {
    const counts = COUNTS();
    const resources = [];
    const seen = new Set();

    function add(raw, type, element, role = 'content') {
        if (!raw || /^(data|blob|javascript|mailto):/i.test(raw) || raw.startsWith('#')) return;
        let absolute;
        try {
            absolute = new URL(raw, baseUrl).href;
        } catch {
            return;
        }
        if (seen.has(absolute)) return;
        seen.add(absolute);
        counts[type] += 1;
        resources.push({
            url: absolute,
            type,
            element,
            role,
            filename: fileName(absolute)
        });
    }

    add(baseUrl, 'html', 'document', 'document');

    for (const link of doc.querySelectorAll('link[href]')) {
        const rel = (link.getAttribute('rel') || '').toLowerCase();
        const href = link.getAttribute('href');
        if (rel.includes('stylesheet')) add(href, 'css', 'link');
        else if (rel.includes('icon')) add(href, 'images', 'icon', 'icon');
        else if (rel.split(/\s+/).includes('preload')) {
            const as = (link.getAttribute('as') || '').toLowerCase();
            if (as === 'style') add(href, 'css', 'preload');
            else if (as === 'script') add(href, 'js', 'preload');
            else if (as === 'font') add(href, 'fonts', 'preload');
            else if (as === 'image') add(href, 'images', 'preload');
            else add(href, 'other', 'preload');
        }
    }

    for (const script of doc.querySelectorAll('script[src]')) {
        add(script.getAttribute('src'), 'js', 'script');
    }

    for (const image of doc.querySelectorAll('img[src]')) {
        add(image.getAttribute('src'), 'images', 'img');
    }

    for (const element of doc.querySelectorAll('img[srcset], source[srcset]')) {
        for (const url of urlsFromSrcset(element.getAttribute('srcset') || '')) {
            add(url, 'images', 'srcset');
        }
    }

    for (const meta of doc.querySelectorAll('meta[property="og:image"][content], meta[name="twitter:image"][content]')) {
        add(meta.getAttribute('content'), 'images', 'meta');
    }

    for (const element of doc.querySelectorAll('video[src], audio[src], iframe[src], embed[src], object[data], source[src]')) {
        const raw = element.getAttribute('src') || element.getAttribute('data');
        const kind = kindFromUrl(raw);
        add(raw, kind || 'other', element.tagName.toLowerCase());
    }

    return {
        counts,
        percentages: toPercentages(counts),
        resources,
        formatted: formatCounts(counts)
    };
}

export function toPercentages(counts) {
    const entries = Object.entries(counts);
    const total = entries.reduce((sum, [, count]) => sum + count, 0);
    if (total <= 0) {
        return Object.fromEntries(entries.map(([key]) => [key, key === 'html' ? 100 : 0]));
    }

    const rows = entries.map(([key, count]) => {
        const exact = (count / total) * 100;
        return { key, value: Math.floor(exact), fraction: exact - Math.floor(exact) };
    });
    let remain = 100 - rows.reduce((sum, row) => sum + row.value, 0);
    rows.sort((a, b) => b.fraction - a.fraction || a.key.localeCompare(b.key));
    for (const row of rows) {
        if (remain <= 0) break;
        row.value += 1;
        remain -= 1;
    }
    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

export function urlsFromSrcset(srcset) {
    return String(srcset)
        .split(',')
        .map((part) => part.trim().split(/\s+/)[0])
        .filter(Boolean);
}

export function contentImages(resources) {
    return resources.filter((resource) => resource.type === 'images' && resource.role !== 'icon');
}

export function isModernImage(url) {
    const path = pathname(url);
    return ['.webp', '.avif', '.svg'].some((ext) => path.endsWith(ext));
}

export function isModernFont(url) {
    return pathname(url).endsWith('.woff2');
}

function formatCounts(counts) {
    const word = (count) => plural(count, 'файл', 'файла', 'файлов');
    return Object.fromEntries(
        Object.entries(counts).map(([key, count]) => [key, `${count} ${word(count)}`])
    );
}

function kindFromUrl(raw) {
    const path = pathname(raw || '');
    if (/\.(png|jpe?g|gif|webp|avif|svg|ico|bmp)$/.test(path)) return 'images';
    if (/\.(woff2?|ttf|otf|eot)$/.test(path)) return 'fonts';
    if (path.endsWith('.css')) return 'css';
    if (/\.(js|mjs)$/.test(path)) return 'js';
    return null;
}

function pathname(url) {
    try {
        return new URL(url, 'https://example.com').pathname.toLowerCase();
    } catch {
        return String(url || '').split('?')[0].toLowerCase();
    }
}

function fileName(url) {
    try {
        const parts = new URL(url).pathname.split('/');
        return parts[parts.length - 1] || url;
    } catch {
        return url;
    }
}

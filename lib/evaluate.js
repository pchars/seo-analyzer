import { Checks } from '../checks.js';
import { formatBytes } from './html.js';
import { contentImages, isModernFont, isModernImage } from './resources.js';

export function evaluateChecks(snapshot, resources, doc) {
    const context = { snapshot, resources, doc };
    const results = { speedChecks: [], seoChecks: [], techChecks: [] };

    for (const category of ['speed', 'seo', 'tech']) {
        for (const check of Checks.getChecksByCategory(category)) {
            const runner = RUNNERS[check.id];
            if (!runner) throw new Error(`Нет реализации для проверки ${check.id}`);
            const outcome = runner(context);
            results[`${category}Checks`].push({ ...check, ...outcome });
        }
    }

    return results;
}

export const RUNNERS = {
    ttfb({ snapshot }) {
        const ms = Number(snapshot.ttfbMs) || 0;
        return metric(ms, 200, 600, `${ms} мс`);
    },

    'load-time'({ snapshot }) {
        const ms = Number(snapshot.downloadMs) || 0;
        return metric(ms, 800, 2000, `${ms} мс`);
    },

    'page-size'({ snapshot }) {
        const bytes = Number(snapshot.htmlBytes) || 0;
        return metric(bytes, 100 * 1024, 300 * 1024, formatBytes(bytes));
    },

    'requests-count'({ resources }) {
        const count = resources.resources.filter((resource) => resource.type !== 'html').length;
        return metric(count, 20, 50, `${count}`);
    },

    'image-optimization'({ resources }) {
        const images = contentImages(resources.resources);
        if (images.length === 0) return good('Изображений контента нет');
        const modern = images.filter((image) => isModernImage(image.url)).length;
        const ratio = modern / images.length;
        const value = `${modern} из ${images.length} в современном формате`;
        if (ratio >= 0.8) return good(value);
        if (ratio >= 0.4) return warning(value);
        return bad(value);
    },

    caching({ snapshot }) {
        const samples = (snapshot.staticSample || []).filter((sample) => sample.ok);
        if (samples.length === 0) return warning('Статические файлы того же сайта для проверки не найдены');
        const cached = samples.filter((sample) => hasLongCache(sample.cacheControl));
        const value = `${cached.length} из ${samples.length} с долгим кешем`;
        if (cached.length === samples.length) return good(value);
        if (cached.length > 0) return warning(value);
        return bad(value);
    },

    compression({ snapshot }) {
        const documentEncoding = snapshot.headers?.['content-encoding'] || '';
        if (isCompressed(documentEncoding)) return good(`HTML: ${documentEncoding}`);
        const staticEncoding = (snapshot.staticSample || []).find((sample) => sample.ok && isCompressed(sample.contentEncoding));
        if (staticEncoding) return warning(`HTML без сжатия, статика: ${staticEncoding.contentEncoding}`);
        return bad('Сжатие gzip или Brotli не обнаружено');
    },

    minification({ resources }) {
        const files = resources.resources.filter((resource) => resource.type === 'css' || resource.type === 'js');
        if (files.length === 0) return good('Внешних CSS и JS нет');
        const minified = files.filter((file) => /\.min\.(css|js|mjs)$/i.test(file.filename));
        const value = `${minified.length} из ${files.length} с признаком .min`;
        if (minified.length === files.length) return good(value);
        if (minified.length > 0) return warning(value);
        return bad(value);
    },

    'async-defer'({ doc }) {
        const blocking = [...doc.querySelectorAll('script[src]')].filter((script) => {
            if (!inHead(script)) return false;
            const type = (script.getAttribute('type') || '').toLowerCase();
            if (type === 'module') return false;
            return !script.hasAttribute('async') && !script.hasAttribute('defer');
        });
        if (blocking.length === 0) return good('Блокирующих скриптов в head нет');
        return bad(`Блокирующих скриптов в head: ${blocking.length}`);
    },

    'font-display'({ doc, resources }) {
        const google = [...doc.querySelectorAll('link[href]')]
            .map((link) => link.getAttribute('href') || '')
            .filter((href) => href.includes('fonts.googleapis.com'));
        const faces = [...doc.querySelectorAll('style')]
            .map((style) => style.textContent || '')
            .join('\n')
            .match(/@font-face\s*\{[^}]*\}/gi) || [];
        const fonts = resources.resources.filter((resource) => resource.type === 'fonts');

        if (google.length === 0 && faces.length === 0 && fonts.length === 0) {
            return good('Веб-шрифты в HTML не найдены');
        }

        const googleReady = google.every((href) => /display=swap/i.test(href));
        const facesReady = faces.every((face) => /font-display\s*:/i.test(face));
        const fontsModern = fonts.every((font) => isModernFont(font.url));
        if (googleReady && facesReady && fontsModern) return good('Показ текста и WOFF2 в порядке');
        return warning('Есть шрифт без font-display, display=swap или WOFF2');
    },

    'image-dimensions'({ doc }) {
        const images = [...doc.querySelectorAll('img')].filter((image) => {
            const src = image.getAttribute('src') || '';
            return src && !src.startsWith('data:');
        });
        if (images.length === 0) return good('Тегов img нет');
        const missing = images.filter((image) => !image.getAttribute('width') || !image.getAttribute('height')).length;
        if (missing === 0) return good(`Размеры заданы у ${images.length} из ${images.length}`);
        const value = `Без width и height: ${missing} из ${images.length}`;
        return missing / images.length <= 0.3 ? warning(value) : bad(value);
    },

    redirects({ snapshot }) {
        const count = Number(snapshot.redirectCount) || 0;
        const value = count === 0 ? 'Редиректов нет' : `Редиректов: ${count}`;
        return count <= 1 ? good(value) : warning(value);
    },

    'third-party'({ resources, snapshot }) {
        let pageHost = '';
        try {
            pageHost = new URL(snapshot.finalUrl).host;
        } catch {
            return warning('Адрес страницы не разбирается');
        }
        const hosts = new Set();
        for (const resource of resources.resources || []) {
            if (resource.type === 'html') continue;
            try {
                const host = new URL(resource.url).host;
                if (host && host !== pageHost) hosts.add(host);
            } catch {
                continue;
            }
        }
        const value = hosts.size === 0 ? 'Чужих доменов нет' : `Чужих доменов: ${hosts.size}`;
        return hosts.size <= 8 ? good(value) : warning(value);
    },

    title({ doc }) {
        const title = text(doc.querySelector('title')?.textContent);
        if (!title) return bad('Тег title пустой или отсутствует');
        const value = `${title.length} символов`;
        if (title.length >= 30 && title.length <= 65) return good(value);
        if (title.length >= 15 && title.length <= 80) return warning(value);
        return bad(value);
    },

    'meta-description'({ doc }) {
        const description = text(meta(doc, 'description'));
        if (!description) return bad('Meta description отсутствует');
        const value = `${description.length} символов`;
        if (description.length >= 70 && description.length <= 160) return good(value);
        if (description.length >= 40 && description.length <= 200) return warning(value);
        return bad(value);
    },

    headings({ doc }) {
        const levels = [...doc.querySelectorAll('h1,h2,h3,h4,h5,h6')]
            .map((heading) => Number(heading.tagName.slice(1)));
        const h1 = levels.filter((level) => level === 1).length;
        const skipped = levels.some((level, index) => index > 0 && level > levels[index - 1] + 1);
        if (h1 === 1 && !skipped) return good(`Один H1, всего заголовков: ${levels.length}`);
        if (h1 === 1 && skipped) return warning('Один H1, но иерархия пропускает уровень');
        if (h1 === 0) return bad('H1 не найден');
        return bad(`H1 на странице: ${h1}`);
    },

    'robots-txt'({ snapshot }) {
        return snapshot.robots?.exists
            ? good('Файл открывается')
            : bad('Файл не найден');
    },

    sitemap({ snapshot }) {
        if (snapshot.sitemap?.exists) return good('Карта сайта открывается');
        if (snapshot.robots?.mentionsSitemap) return warning('В robots.txt есть Sitemap, но файл не открылся');
        return bad('Карта сайта не найдена');
    },

    'mobile-friendly'({ doc }) {
        const viewport = meta(doc, 'viewport');
        if (!viewport) return bad('Метатег viewport отсутствует');
        if (/width\s*=\s*device-width/i.test(viewport)) return good('width=device-width');
        return warning('Viewport есть, но без width=device-width');
    },

    canonical({ doc, snapshot }) {
        const links = [...doc.querySelectorAll('link[rel="canonical"]')];
        if (links.length > 1) return warning(`Канонических ссылок: ${links.length}`);
        const href = links[0]?.getAttribute('href');
        if (!href) return warning('Каноническая ссылка не указана');
        try {
            const url = new URL(href, snapshot.finalUrl || undefined);
            if (url.protocol !== 'http:' && url.protocol !== 'https:') return warning('Каноническая ссылка не является адресом страницы');
            return good(url.href);
        } catch {
            return warning('Каноническая ссылка не разбирается');
        }
    },

    'alt-text'({ doc }) {
        const images = [...doc.querySelectorAll('img')];
        if (images.length === 0) return good('Тегов img нет');
        const missing = images.filter((image) => !image.hasAttribute('alt')).length;
        if (missing === 0) return good(`Alt задан у ${images.length} из ${images.length}`);
        const value = `Без alt: ${missing} из ${images.length}`;
        return missing / images.length <= 0.2 ? warning(value) : bad(value);
    },

    'schema-markup'({ doc }) {
        const scripts = [...doc.querySelectorAll('script[type="application/ld+json"]')];
        const parsed = scripts.some((script) => {
            try {
                JSON.parse(script.textContent || '');
                return true;
            } catch {
                return false;
            }
        });
        if (scripts.length > 0 && !parsed) return warning('JSON-LD есть, но не читается');
        const microdata = Boolean(doc.querySelector('[itemscope]'));
        return parsed || microdata ? good('Структурированные данные найдены') : warning('Структурированные данные не найдены');
    },

    'open-graph'({ doc }) {
        const present = ['og:title', 'og:description', 'og:image']
            .filter((property) => doc.querySelector(`meta[property="${property}"]`)?.getAttribute('content'));
        const twitter = metaName(doc, 'twitter:card') ? '' : ' Twitter Card не задан, превью может взять Open Graph.';
        if (present.length === 3) return good(`title, description и image на месте.${twitter}`);
        if (present.length > 0) return warning(`Заполнено: ${present.join(', ')}.${twitter}`);
        return bad('Тегов Open Graph нет');
    },

    'meta-robots'({ doc, snapshot }) {
        const meta = (doc.querySelector('meta[name="robots"]')?.getAttribute('content') || '').toLowerCase();
        const header = (snapshot.headers?.['x-robots-tag'] || '').toLowerCase();
        const combined = `${meta} ${header}`.trim();
        if (/noindex/.test(combined)) return bad('Страница закрыта от индексации: noindex');
        if (/nofollow/.test(combined)) return warning('Ссылки закрыты: nofollow');
        return good(combined || 'Индексация не запрещена');
    },

    breadcrumbs({ doc, snapshot }) {
        const html = snapshot.html || '';
        const jsonLd = /BreadcrumbList/i.test(html);
        const nav = [...doc.querySelectorAll('[aria-label], .breadcrumb, .breadcrumbs')]
            .some((element) => /breadcrumb/i.test(`${element.getAttribute('aria-label') || ''} ${element.getAttribute('class') || ''}`));
        return jsonLd || nav ? good('Признак хлебных крошек найден') : warning('Хлебные крошки не найдены');
    },

    'internal-links'({ doc, snapshot }) {
        let page;
        try {
            page = new URL(snapshot.finalUrl);
        } catch {
            return warning('Адрес страницы не разбирается');
        }
        const count = [...doc.querySelectorAll('a[href]')].filter((link) => {
            try {
                const url = new URL(link.getAttribute('href'), page);
                if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
                return url.host === page.host && (url.pathname !== page.pathname || url.search !== page.search);
            } catch {
                return false;
            }
        }).length;
        if (count > 0) return good(`Ссылок на другие страницы сайта: ${count}`);
        return warning('Ссылок на другие страницы сайта нет');
    },

    'robots-access'({ snapshot }) {
        if (!snapshot.robots?.exists) return good('robots.txt нет, страница файлом не закрыта');
        if (snapshot.robots.blocksPage) return bad('User-agent: * закрывает эту страницу');
        return good('Правила User-agent: * страницу не закрывают');
    },

    https({ snapshot }) {
        return String(snapshot.finalUrl || '').startsWith('https://')
            ? good('Итоговый адрес на HTTPS')
            : bad('Итоговый адрес без HTTPS');
    },

    tls({ snapshot }) {
        if (!String(snapshot.finalUrl || '').startsWith('https://')) return na('Страница без HTTPS');
        const protocol = snapshot.tlsProtocol || '';
        if (protocol === 'TLSv1.2' || protocol === 'TLSv1.3') return good(protocol);
        if (protocol === 'TLSv1' || protocol === 'TLSv1.1') return bad(protocol);
        return warning('Версию TLS определить не удалось');
    },

    hsts({ snapshot }) {
        if (!String(snapshot.finalUrl || '').startsWith('https://')) {
            return na('Страница без HTTPS');
        }
        const header = snapshot.headers?.['strict-transport-security'] || '';
        const maxAge = /max-age\s*=\s*(\d+)/i.exec(header);
        if (maxAge && Number(maxAge[1]) > 0) return good(`max-age=${maxAge[1]}`);
        return warning(header ? 'HSTS есть, но max-age равен 0' : 'Заголовка Strict-Transport-Security нет');
    },

    http2({ snapshot }) {
        if (snapshot.httpVersion === 'h2') return good('Сервер согласовал h2');
        if (snapshot.httpVersion === 'http/1.1') return warning('Сервер отвечает по HTTP/1.1');
        return warning('Версию протокола определить не удалось');
    },

    'security-headers'({ snapshot }) {
        const headers = snapshot.headers || {};
        const csp = headers['content-security-policy'] || headers['content-security-policy-report-only'] || '';
        const hasCsp = Boolean(csp);
        const hasFrame = Boolean(headers['x-frame-options']) || /frame-ancestors/i.test(csp);
        const hasNosniff = /nosniff/i.test(headers['x-content-type-options'] || '');
        const count = [hasCsp, hasFrame, hasNosniff].filter(Boolean).length;
        const value = `CSP: ${yes(hasCsp)}, фреймы: ${yes(hasFrame)}, nosniff: ${yes(hasNosniff)}`;
        if (count === 3) return good(value);
        if (count > 0) return warning(value);
        return bad(value);
    },

    cookies({ snapshot }) {
        const cookies = Array.isArray(snapshot.cookies) ? snapshot.cookies : [];
        if (cookies.length === 0) return good('Сервер не поставил cookie');
        const httpsPage = String(snapshot.finalUrl || '').startsWith('https://');
        const weak = cookies.filter((cookie) => {
            const sameSite = String(cookie.sameSite || '').toLowerCase();
            const missingSecure = httpsPage && !cookie.secure;
            const missingSameSite = !sameSite || (sameSite === 'none' && !cookie.secure);
            return missingSecure || !cookie.httpOnly || missingSameSite;
        });
        if (weak.length === 0) return good(`Cookie с флагами: ${cookies.length}`);
        return warning(`Без нужных флагов: ${weak.length} из ${cookies.length}`);
    },

    favicon({ doc }) {
        const icon = doc.querySelector('link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]');
        return icon ? good('Ссылка на значок есть') : bad('Ссылка на значок не найдена');
    },

    'document-basics'({ snapshot, doc }) {
        const doctype = /^\s*<!doctype\s+html/i.test(snapshot.html || '');
        const lang = doc.documentElement?.getAttribute('lang') || '';
        if (doctype && lang) return good(`lang="${lang}"`);
        if (doctype || lang) return warning(doctype ? 'Нет атрибута lang' : 'Нет <!doctype html>');
        return bad('Нет DOCTYPE и языка страницы');
    },

    'dom-size'({ doc }) {
        const count = doc.querySelectorAll('*').length;
        const value = `${count} элементов`;
        if (count <= 1500) return good(value);
        if (count <= 3000) return warning(value);
        return bad(value);
    },

    charset({ snapshot, doc }) {
        const header = snapshot.headers?.['content-type'] || '';
        const metaCharset = doc.querySelector('meta[charset]');
        const httpEquiv = [...doc.querySelectorAll('meta[http-equiv]')]
            .find((meta) => /content-type/i.test(meta.getAttribute('http-equiv') || ''));
        if (/charset\s*=/i.test(header)) return good('Кодировка указана в заголовке ответа');
        if (metaCharset || httpEquiv) return good('Кодировка указана в HTML');
        return warning('Кодировка не указана');
    },

    'mixed-content'({ snapshot, resources }) {
        if (!String(snapshot.finalUrl || '').startsWith('https://')) {
            return good('Страница без HTTPS, смешивание не проверяется');
        }
        const insecure = resources.resources.filter((resource) => resource.url.startsWith('http://'));
        if (insecure.length === 0) return good('Ресурсов по HTTP нет');
        return bad(`Ресурсов по HTTP: ${insecure.length}`);
    },

    accessibility({ doc }) {
        const lang = doc.documentElement?.getAttribute('lang');
        const images = [...doc.querySelectorAll('img')];
        const missingAlt = images.filter((image) => !image.hasAttribute('alt')).length;
        const emptyButtons = [...doc.querySelectorAll('button')].filter((button) => {
            return !text(button.textContent) && !button.getAttribute('aria-label');
        }).length;
        const fields = [...doc.querySelectorAll('input, textarea, select')]
            .filter((field) => (field.getAttribute('type') || '').toLowerCase() !== 'hidden');
        const unlabeled = fields.filter((field) => !hasFieldName(doc, field)).length;

        if (!lang) return bad('У html не задан язык');
        if (missingAlt || emptyButtons || unlabeled) {
            return warning(`Без alt: ${missingAlt}, кнопки без имени: ${emptyButtons}, поля без подписи: ${unlabeled}`);
        }
        return good('Язык, alt, кнопки и поля в порядке');
    }
};

function hasFieldName(doc, field) {
    if (field.getAttribute('aria-label') || field.getAttribute('aria-labelledby')) return true;
    if (field.closest && field.closest('label')) return true;
    const id = field.getAttribute('id');
    if (!id) return false;
    return [...doc.querySelectorAll('label[for]')].some((label) => label.getAttribute('for') === id);
}

function inHead(element) {
    let node = element;
    while (node) {
        if (node.tagName === 'HEAD') return true;
        node = node.parentNode;
    }
    return false;
}

function meta(doc, name) {
    return doc.querySelector(`meta[name="${name}"]`)?.getAttribute('content') || '';
}

function metaName(doc, name) {
    return doc.querySelector(`meta[name="${name}"]`)?.getAttribute('content') || '';
}

function text(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function hasLongCache(header) {
    if (/immutable/i.test(header || '')) return true;
    const match = /max-age\s*=\s*(\d+)/i.exec(header || '');
    return Boolean(match && Number(match[1]) >= 7 * 24 * 60 * 60);
}

function isCompressed(header) {
    return /\b(br|gzip|deflate)\b/i.test(header || '');
}

function yes(flag) {
    return flag ? 'да' : 'нет';
}

function metric(value, goodLimit, warningLimit, label) {
    if (value <= goodLimit) return good(label);
    if (value <= warningLimit) return warning(label);
    return bad(label);
}

function good(value) {
    return { status: 'good', value };
}

function na(value) {
    return { status: 'na', value };
}

function warning(value) {
    return { status: 'warning', value };
}

function bad(value) {
    return { status: 'bad', value };
}

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createFileLimiter, createMemoryLimiter, createSemaphore } from '../lib/limit.js';
import { collectPdfBlocks, renderPdf } from '../lib/pdf-report.js';

test('memory limiter and semaphore stop excess work', () => {
    let now = 1_000;
    const allow = createMemoryLimiter(2, 60_000, () => now);
    assert.equal(allow('a'), true);
    assert.equal(allow('a'), true);
    assert.equal(allow('a'), false);
    now += 60_001;
    assert.equal(allow('a'), true);

    let clock = 1_000;
    const crowded = createMemoryLimiter(1, 1_000, () => clock, 2);
    crowded('old');
    crowded('older');
    assert.equal(crowded.size(), 2);
    clock += 1_001;
    assert.equal(crowded('next'), true);
    assert.equal(crowded.size(), 1);

    const slots = createSemaphore(1);
    assert.equal(slots.tryEnter(), true);
    assert.equal(slots.tryEnter(), false);
    slots.leave();
    assert.equal(slots.tryEnter(), true);
});

test('file limiter is shared by two callers', async () => {
    const file = path.join(os.tmpdir(), `seo-limit-${Date.now()}.json`);
    const first = createFileLimiter(file, 1);
    const second = createFileLimiter(file, 1);
    assert.equal(await first('10.0.0.8'), true);
    assert.equal(await second('10.0.0.8'), false);
    await fs.rm(file, { force: true });
});

test('pdf lists every check and is a real multi-page file', async () => {
    const results = {
        url: 'https://example.com/отчёт',
        date: '09.11.2026',
        time: '12:00:00',
        overallScore: 66,
        rendered: false,
        detailedReport: true,
        categoryScores: {
            speed: { good: 1, total: 1 },
            seo: { good: 0, total: 1 },
            tech: { good: 1, total: 1 }
        },
        speedChecks: [{ id: 'ttfb', name: 'Время до первого байта (TTFB)', status: 'good', value: '120 мс', suggestion: 'Ускорьте сервер' }],
        seoChecks: [{ id: 'title', name: 'Title страницы', status: 'bad', value: '10 символов', suggestion: 'Удлините title' }],
        techChecks: [{ id: 'https', name: 'HTTPS', status: 'good', value: 'Итоговый адрес на HTTPS', suggestion: 'Поставьте сертификат' }],
        recommendations: [{ title: 'Title страницы', description: 'Удлините title', priority: 'high', category: 'seo' }],
        resourceDistribution: { formatted: { html: '1 файл', css: '0 файлов' } }
    };
    const blocks = collectPdfBlocks(results);
    const names = blocks.categories.flatMap((category) => category.checks.map((check) => check.name));
    assert.deepEqual(names, ['Время до первого байта (TTFB)', 'Title страницы', 'HTTPS']);

    const pdf = await renderPdf(results);
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    const pages = pdf.toString('latin1').match(/\/Type \/Page\b/g) || [];
    assert.equal(pages.length, 1);
    assert.match(pdf.toString('latin1'), /NotoSans/);
});

test('a full report stays on content pages and does not grow blank ones', async () => {
    const check = (id, name) => ({ id, name, status: 'warning', value: 'нужно поправить', suggestion: 'Исправьте этот пункт в шаблоне страницы.' });
    const results = {
        url: 'https://example.com/отчёт',
        date: '09.11.2026',
        time: '12:00:00',
        overallScore: 66,
        categoryScores: {
            speed: { good: 0, total: 11 },
            seo: { good: 0, total: 12 },
            tech: { good: 0, total: 9 }
        },
        speedChecks: Array.from({ length: 11 }, (_, i) => check(`s${i}`, `Проверка скорости ${i + 1}`)),
        seoChecks: Array.from({ length: 12 }, (_, i) => check(`e${i}`, `Проверка SEO ${i + 1}`)),
        techChecks: Array.from({ length: 9 }, (_, i) => check(`t${i}`, `Техническая проверка ${i + 1}`)),
        recommendations: Array.from({ length: 8 }, (_, i) => ({
            title: `Рекомендация ${i + 1}`,
            description: 'Короткое пояснение, что изменить на странице.',
            priority: 'high',
            category: 'seo'
        }))
    };
    const pdf = await renderPdf(results);
    const pages = pdf.toString('latin1').match(/\/Type \/Page\b/g) || [];
    assert.ok(pages.length >= 2 && pages.length <= 4, `страниц: ${pages.length}`);
});

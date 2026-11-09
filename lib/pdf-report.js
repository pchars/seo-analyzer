import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGULAR = path.join(ROOT, 'fonts', 'NotoSans-Regular.ttf');
const BOLD = path.join(ROOT, 'fonts', 'NotoSans-Bold.ttf');
const PAGE_WIDTH = 595.28;
const MARGIN = 40;

const STATUS = {
    good: 'Хорошо',
    warning: 'Замечание',
    bad: 'Проблема',
    na: 'Не применяется'
};

const PRIORITY = {
    high: 'Высокий',
    medium: 'Средний',
    low: 'Низкий'
};

export function collectPdfBlocks(results) {
    const categories = [
        ['Скорость', results.speedChecks, results.categoryScores?.speed],
        ['SEO', results.seoChecks, results.categoryScores?.seo],
        ['Техника', results.techChecks, results.categoryScores?.tech]
    ].map(([title, checks, tally]) => ({
        title,
        tally: tally || { good: 0, total: (checks || []).length },
        checks: checks || []
    }));

    return {
        url: results.url || '',
        date: results.date || '',
        time: results.time || '',
        score: Number(results.overallScore) || 0,
        rating: ratingText(results.overallScore),
        categories,
        recommendations: results.recommendations || [],
        resources: results.resourceDistribution?.formatted || {},
        detailed: results.detailedReport !== false
    };
}

export function renderPdf(results) {
    const blocks = collectPdfBlocks(results);
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(REGULAR)) {
            reject(new Error('Не найден шрифт для PDF'));
            return;
        }
        const doc = new PDFDocument({
            size: 'A4',
            margin: MARGIN,
            bufferPages: true,
            info: { Title: `SEO-отчёт ${blocks.url}`, Author: 'SEO Analyzer' }
        });
        const chunks = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        doc.registerFont('regular', REGULAR);
        doc.registerFont('bold', fs.existsSync(BOLD) ? BOLD : REGULAR);
        drawReport(doc, blocks);
        doc.end();
    });
}

function drawReport(doc, blocks) {
    drawHeader(doc, blocks);
    drawCategories(doc, blocks);
    drawResources(doc, blocks);
    for (const category of blocks.categories) {
        sectionTitle(doc, category.title);
        if (category.checks.length === 0) {
            bodyText(doc, 'В этой группе нет проверок.');
        }
        for (const check of category.checks) drawCheck(doc, check, blocks.detailed);
    }
    sectionTitle(doc, 'Рекомендации');
    if (blocks.recommendations.length === 0) {
        bodyText(doc, 'По текущим проверкам замечаний нет.');
    } else {
        blocks.recommendations.forEach((item, index) => drawRecommendation(doc, item, index));
    }
    addPageNumbers(doc);
}

function drawHeader(doc, blocks) {
    doc.save();
    doc.rect(0, 0, PAGE_WIDTH, 128).fill('#4361ee');
    doc.fillColor('#ffffff').font('bold').fontSize(22)
        .text('SEO Analyzer', MARGIN, 28, { width: 360, lineBreak: false });
    doc.font('regular').fontSize(11).fillColor('#e7ecff')
        .text(blocks.url || 'Страница не указана', MARGIN, 58, { width: 380 });
    doc.fontSize(10).text([blocks.date, blocks.time].filter(Boolean).join('   '), MARGIN, 80, { width: 380 });
    doc.fillColor('#ffffff').text(blocks.rating, MARGIN, 98, { width: 380, lineBreak: false });

    const badgeX = PAGE_WIDTH - MARGIN - 88;
    doc.roundedRect(badgeX, 28, 88, 72, 10).fill('#ffffff');
    doc.fillColor('#4361ee').font('bold').fontSize(28)
        .text(String(blocks.score), badgeX, 38, { width: 88, align: 'center', lineBreak: false });
    doc.font('regular').fontSize(9).fillColor('#495057')
        .text('из 100', badgeX, 72, { width: 88, align: 'center', lineBreak: false });
    doc.restore();
    doc.x = MARGIN;
    doc.y = 148;
}

function drawCategories(doc, blocks) {
    const gap = 8;
    const width = (contentWidth() - gap * 2) / 3;
    const top = doc.y;
    blocks.categories.forEach((category, index) => {
        const x = MARGIN + index * (width + gap);
        doc.roundedRect(x, top, width, 52, 6).fill('#f4f6f8');
        doc.fillColor('#212529').font('bold').fontSize(11)
            .text(category.title, x + 12, top + 10, { width: width - 24, lineBreak: false });
        doc.fillColor('#495057').font('regular').fontSize(9)
            .text(`${category.tally.good} из ${category.tally.total} без замечаний`, x + 12, top + 28, { width: width - 24 });
    });
    doc.x = MARGIN;
    doc.y = top + 68;
}

function drawResources(doc, blocks) {
    const resources = Object.entries(blocks.resources).map(([key, value]) => `${label(key)} ${value}`).join('   ');
    if (!resources) return;
    doc.fillColor('#868e96').font('regular').fontSize(9)
        .text(`Ресурсы в разметке: ${resources}`, MARGIN, doc.y, { width: contentWidth() });
    doc.moveDown(0.4);
}

function drawCheck(doc, check, detailed) {
    const status = STATUS[check.status] || check.status;
    const suggestion = detailed && check.status !== 'good' ? (check.suggestion || '') : '';
    const textWidth = contentWidth() - 104;
    doc.font('bold').fontSize(11);
    const nameHeight = doc.heightOfString(check.name || '', { width: textWidth });
    doc.font('regular').fontSize(9);
    const valueHeight = check.value ? doc.heightOfString(check.value, { width: contentWidth() }) : 0;
    const suggestionHeight = suggestion ? doc.heightOfString(suggestion, { width: contentWidth() }) : 0;
    const height = nameHeight + valueHeight + suggestionHeight + 18;
    ensureSpace(doc, height);

    const top = doc.y;
    doc.fillColor(statusColor(check.status)).font('regular').fontSize(10)
        .text(status, MARGIN + contentWidth() - 96, top, { width: 96, align: 'right', lineBreak: false });
    doc.fillColor('#212529').font('bold').fontSize(11)
        .text(check.name || '', MARGIN, top, { width: textWidth });
    let cursor = top + nameHeight + 1;
    if (check.value) {
        doc.fillColor('#495057').font('regular').fontSize(9)
            .text(check.value, MARGIN, cursor, { width: contentWidth() });
        cursor = doc.y + 1;
    }
    if (suggestion) {
        doc.fillColor('#343a40').font('regular').fontSize(9)
            .text(suggestion, MARGIN, cursor, { width: contentWidth() });
        cursor = doc.y;
    }
    const line = cursor + 6;
    doc.save();
    doc.strokeColor('#e9ecef').lineWidth(0.6)
        .moveTo(MARGIN, line).lineTo(MARGIN + contentWidth(), line).stroke();
    doc.restore();
    doc.x = MARGIN;
    doc.y = line + 8;
}

function drawRecommendation(doc, item, index) {
    const title = `${index + 1}. ${item.title || 'Рекомендация'}`;
    const description = item.detail || item.description || '';
    doc.font('bold').fontSize(11);
    const titleHeight = doc.heightOfString(title, { width: contentWidth() - 90 });
    doc.font('regular').fontSize(10);
    const descriptionHeight = description ? doc.heightOfString(description, { width: contentWidth() }) : 0;
    ensureSpace(doc, titleHeight + descriptionHeight + 18);
    const top = doc.y;
    doc.fillColor(priorityColor(item.priority)).font('regular').fontSize(10)
        .text(PRIORITY[item.priority] || item.priority || '', MARGIN + contentWidth() - 80, top, {
            width: 80,
            align: 'right',
            lineBreak: false
        });
    doc.fillColor('#212529').font('bold').fontSize(11)
        .text(title, MARGIN, top, { width: contentWidth() - 90 });
    if (description) {
        doc.fillColor('#343a40').font('regular').fontSize(10)
            .text(description, MARGIN, top + titleHeight + 2, { width: contentWidth(), lineGap: 2 });
    }
    doc.x = MARGIN;
    doc.y = doc.y + 10;
}

function sectionTitle(doc, title) {
    ensureSpace(doc, 40);
    doc.y += 8;
    const top = doc.y;
    doc.fillColor('#212529').font('bold').fontSize(14)
        .text(title, MARGIN, top, { width: contentWidth(), lineBreak: false });
    const line = top + 20;
    doc.save();
    doc.strokeColor('#4361ee').lineWidth(2)
        .moveTo(MARGIN, line).lineTo(MARGIN + 28, line).stroke();
    doc.restore();
    doc.x = MARGIN;
    doc.y = line + 10;
}

function bodyText(doc, text) {
    ensureSpace(doc, 24);
    doc.fillColor('#495057').font('regular').fontSize(10)
        .text(text, MARGIN, doc.y, { width: contentWidth() });
    doc.moveDown(0.25);
}

function ensureSpace(doc, height) {
    if (doc.y + height > doc.page.height - 48) doc.addPage();
}

function addPageNumbers(doc) {
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i += 1) {
        doc.switchToPage(i);
        const bottom = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;
        doc.font('regular').fontSize(9).fillColor('#868e96')
            .text(`Страница ${i + 1} из ${range.count}`, MARGIN, doc.page.height - 28, {
                width: contentWidth(),
                align: 'center',
                lineBreak: false
            });
        doc.page.margins.bottom = bottom;
        doc.x = MARGIN;
        doc.y = MARGIN;
    }
}

function contentWidth() {
    return PAGE_WIDTH - MARGIN * 2;
}

function ratingText(score) {
    const value = Number(score) || 0;
    if (value >= 90) return 'Отлично';
    if (value >= 70) return 'Хорошо';
    if (value >= 50) return 'Удовлетворительно';
    return 'Нужна доработка';
}

function statusColor(status) {
    if (status === 'good') return '#0b7285';
    if (status === 'warning') return '#e8590c';
    if (status === 'na') return '#868e96';
    return '#c2255c';
}

function priorityColor(priority) {
    if (priority === 'high') return '#c2255c';
    if (priority === 'medium') return '#e8590c';
    return '#0b7285';
}

function label(key) {
    return {
        html: 'HTML',
        css: 'CSS',
        js: 'JS',
        images: 'изображения',
        fonts: 'шрифты',
        other: 'другое'
    }[key] || key;
}

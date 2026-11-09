import { analyzeSnapshot } from './lib/analyze.js';
import { normalizeUrl } from './lib/url.js';
import { Storage } from './storage.js';
import { Utils } from './utils.js';
import { Charts } from './charts.js';
import { PDFGenerator } from './pdf-generator.js';

const STATUS_TEXT = {
    good: 'Хорошо',
    warning: 'Замечание',
    bad: 'Проблема',
    na: 'Не применяется'
};

const PRIORITY_TEXT = {
    high: 'Высокий',
    medium: 'Средний',
    low: 'Низкий'
};

export const UI = {
    currentResults: null,
    priority: 'all',

    init() {
        this.applyTheme(localStorage.getItem('seoAnalyzerTheme') === 'dark' ? 'dark' : 'light');
        this.bindEvents();
        Storage.bindSelection((item) => this.openHistory(item));
        Storage.renderHistory();
        const year = document.getElementById('year');
        if (year) year.textContent = String(new Date().getFullYear());
    },

    bindEvents() {
        document.getElementById('analyzeBtn')?.addEventListener('click', () => this.analyzeSite());
        document.getElementById('urlInput')?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') this.analyzeSite();
        });
        document.getElementById('themeToggle')?.addEventListener('click', () => {
            const next = document.documentElement.classList.contains('dark-theme') ? 'light' : 'dark';
            this.applyTheme(next);
        });
        document.getElementById('clearHistoryBtn')?.addEventListener('click', () => Storage.clearHistory());
        document.getElementById('downloadPDFBtn')?.addEventListener('click', () => PDFGenerator.generate(this.currentResults));
        document.getElementById('exportJSONBtn')?.addEventListener('click', () => this.exportJson());
        document.getElementById('detailedReport')?.addEventListener('change', (event) => {
            this.setExplanations(event.target.checked);
        });

        document.querySelectorAll('.tab-btn').forEach((button) => {
            button.addEventListener('click', () => this.activateTab(button.dataset.tab));
        });
        document.querySelectorAll('.priority-btn').forEach((button) => {
            button.addEventListener('click', () => {
                this.priority = button.dataset.priority || 'all';
                document.querySelectorAll('.priority-btn').forEach((item) => {
                    item.classList.toggle('active', item === button);
                });
                this.renderRecommendations();
            });
        });

        document.getElementById('privacyLink')?.addEventListener('click', (event) => {
            event.preventDefault();
            this.openModal('Конфиденциальность', privacyText());
        });
        document.getElementById('modalClose')?.addEventListener('click', () => this.closeModal());
        document.getElementById('infoModal')?.addEventListener('click', (event) => {
            if (event.target.id === 'infoModal') this.closeModal();
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') this.closeModal();
        });
    },

    applyTheme(theme) {
        document.documentElement.classList.toggle('dark-theme', theme === 'dark');
        localStorage.setItem('seoAnalyzerTheme', theme);
        const icon = document.querySelector('#themeToggle i');
        if (icon) icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    },

    async analyzeSite() {
        const input = document.getElementById('urlInput');
        const button = document.getElementById('analyzeBtn');
        const url = normalizeUrl(input?.value || '');

        if (!url) {
            Utils.showNotification('Введите адрес страницы, например example.com', 'error');
            input?.focus();
            return;
        }
        if (location.protocol === 'file:') {
            Utils.showNotification('Откройте анализатор через npm start, а не как файл', 'error');
            return;
        }

        input.value = url;
        if (button) button.disabled = true;
        this.showProgress(true);
        Utils.showNotification('Запрашиваем страницу…', 'info');

        try {
            this.setStep(1);
            this.updateProgress(15, 'Загружаем страницу…');
            const response = await fetch(`/api/inspect?url=${encodeURIComponent(url)}`);
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || 'Не удалось проверить страницу');

            this.setStep(2);
            this.updateProgress(70, 'Разбираем разметку…');
            const detailedReport = document.getElementById('detailedReport')?.checked !== false;
            this.currentResults = analyzeSnapshot(payload, { detailedReport });

            this.updateProgress(100, 'Готово');
            if (document.getElementById('saveHistory')?.checked) {
                Storage.saveToHistory(this.currentResults);
            }
            this.displayResults(this.currentResults);
            Utils.showNotification('Проверка готова', 'success');
        } catch (error) {
            console.error(error);
            Utils.showNotification(error.message || 'Не удалось проверить страницу', 'error');
        } finally {
            if (button) button.disabled = false;
            this.showProgress(false);
        }
    },

    displayResults(results) {
        const section = document.getElementById('resultsSection');
        section?.classList.remove('hidden');

        document.getElementById('overallScore').textContent = String(results.overallScore);
        setScore('speedScore', results.categoryScores.speed);
        setScore('seoScore', results.categoryScores.seo);
        setScore('techScore', results.categoryScores.tech);
        document.getElementById('speedCount').textContent = String(results.speedChecks.length);
        document.getElementById('seoCount').textContent = String(results.seoChecks.length);
        document.getElementById('techCount').textContent = String(results.techChecks.length);
        const explanations = document.getElementById('detailedReport');
        if (explanations) explanations.checked = results.detailedReport !== false;

        fillChecks(document.getElementById('speedResults'), results.speedChecks, results.detailedReport);
        fillChecks(document.getElementById('seoResults'), results.seoChecks, results.detailedReport);
        fillChecks(document.getElementById('techResults'), results.techChecks, results.detailedReport);
        this.renderRecommendations();
        renderResourceSummary(results.resourceDistribution);

        document.getElementById('analyzedUrl').textContent = results.url;
        document.getElementById('analysisDate').textContent = `Дата: ${results.date}`;
        document.getElementById('analysisTime').textContent = `Время: ${results.time}`;
        const note = document.getElementById('renderNote');
        if (note) {
            note.textContent = results.rendered
                ? 'Учтена разметка после выполнения JavaScript.'
                : 'JavaScript страницы не выполнялся: учтён только HTML-ответ.';
        }

        Charts.updateScoreChart(results.overallScore);
        Charts.updateResourcesChart(results.resourceDistribution.percentages);
        section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },

    setExplanations(detailed) {
        if (!this.currentResults) return;
        this.currentResults.detailedReport = detailed;
        fillChecks(document.getElementById('speedResults'), this.currentResults.speedChecks, detailed);
        fillChecks(document.getElementById('seoResults'), this.currentResults.seoChecks, detailed);
        fillChecks(document.getElementById('techResults'), this.currentResults.techChecks, detailed);
    },

    renderRecommendations() {
        const list = document.getElementById('recommendationsList');
        if (!list) return;
        const recommendations = this.currentResults?.recommendations || [];
        const visible = this.priority === 'all'
            ? recommendations
            : recommendations.filter((item) => item.priority === this.priority);

        list.replaceChildren();
        if (visible.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'no-recommendations';
            const title = document.createElement('h4');
            title.textContent = recommendations.length === 0 ? 'Замечаний нет' : 'В этом приоритете пусто';
            const text = document.createElement('p');
            text.textContent = recommendations.length === 0
                ? 'По текущим проверкам страница выглядит собранной.'
                : 'Выберите другой фильтр.';
            empty.append(title, text);
            list.append(empty);
            return;
        }

        for (const item of visible) {
            const card = document.createElement('article');
            card.className = `recommendation-item ${item.priority}`;
            const priority = document.createElement('div');
            priority.className = 'recommendation-priority';
            priority.textContent = PRIORITY_TEXT[item.priority] || item.priority;
            const title = document.createElement('h4');
            title.textContent = item.title;
            const description = document.createElement('p');
            description.textContent = item.description;
            card.append(priority, title, description);
            list.append(card);
        }
    },

    openHistory(item) {
        const input = document.getElementById('urlInput');
        if (input) input.value = String(item.url || '');
        if (item.report?.speedChecks) {
            this.currentResults = item.report;
            this.displayResults(item.report);
            return;
        }
        input?.focus();
        Utils.showNotification('В этой записи нет сохранённого отчёта, запустите проверку снова', 'info');
    },

    exportJson() {
        if (!this.currentResults) {
            Utils.showNotification('Сначала выполните анализ', 'warning');
            return;
        }
        const blob = new Blob([JSON.stringify(this.currentResults, null, 2)], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `seo-${fileSlug(this.currentResults.url)}.json`;
        link.click();
        URL.revokeObjectURL(link.href);
    },

    activateTab(tab) {
        document.querySelectorAll('.tab-btn').forEach((button) => {
            button.classList.toggle('active', button.dataset.tab === tab);
        });
        document.querySelectorAll('.tab-pane').forEach((pane) => pane.classList.remove('active'));
        document.getElementById(`${tab}-tab`)?.classList.add('active');
    },

    showProgress(show) {
        const section = document.getElementById('progressSection');
        if (!section) return;
        if (show) {
            section.classList.remove('hidden');
            this.updateProgress(0, 'Подготовка…');
            this.setStep(0);
            return;
        }
        setTimeout(() => section.classList.add('hidden'), 700);
    },

    updateProgress(percent, status) {
        const fill = document.getElementById('progressFill');
        const label = document.getElementById('progressStatus');
        const value = document.getElementById('progressPercent');
        if (fill) fill.style.width = `${percent}%`;
        if (label) label.textContent = status;
        if (value) value.textContent = `${percent}%`;
    },

    setStep(step) {
        document.querySelectorAll('.progress-step').forEach((item) => {
            item.classList.toggle('active', Number(item.dataset.step) <= step);
        });
    },

    openModal(title, text) {
        const modal = document.getElementById('infoModal');
        document.getElementById('modalTitle').textContent = title;
        document.getElementById('modalBody').textContent = text;
        modal?.classList.remove('hidden');
    },

    closeModal() {
        document.getElementById('infoModal')?.classList.add('hidden');
    }
};

function fillChecks(container, checks, detailed) {
    if (!container) return;
    container.replaceChildren();
    for (const check of checks) {
        const item = document.createElement('article');
        item.className = `result-item ${check.status}`;

        const header = document.createElement('div');
        header.className = 'result-header';
        const title = document.createElement('div');
        title.className = 'result-title';
        title.textContent = check.name;
        const status = document.createElement('div');
        status.className = `result-status ${check.status}`;
        status.textContent = STATUS_TEXT[check.status] || check.status;
        header.append(title, status);

        const value = document.createElement('div');
        value.className = 'result-value';
        value.textContent = check.value;
        item.append(header, value);

        if (!detailed) {
            container.append(item);
            continue;
        }

        const description = document.createElement('div');
        description.className = 'result-description';
        description.textContent = check.description;
        item.append(description);

        if (check.status !== 'good') {
            const suggestion = document.createElement('div');
            suggestion.className = 'result-suggestion';
            suggestion.textContent = check.suggestion;
            item.append(suggestion);
        }
        container.append(item);
    }
}

function renderResourceSummary(distribution) {
    const summary = document.getElementById('resourceSummary');
    if (!summary) return;
    summary.replaceChildren();
    const labels = {
        html: 'HTML',
        css: 'CSS',
        js: 'JS',
        images: 'Изображения',
        fonts: 'Шрифты',
        other: 'Другое'
    };
    for (const [key, label] of Object.entries(labels)) {
        const item = document.createElement('span');
        item.textContent = `${label}: ${distribution.formatted[key]}`;
        summary.append(item);
    }
}

function setScore(id, tally) {
    const element = document.getElementById(id);
    if (element) element.textContent = `${tally.good}/${tally.total}`;
}

function fileSlug(url) {
    return String(url)
        .replace(/^https?:\/\//, '')
        .replace(/[^a-z0-9а-яё.-]+/gi, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 80) || 'report';
}

function privacyText() {
    return [
        'Адрес страницы отправляется на сервер этого анализатора: браузер сам не может скачать чужой сайт из-за CORS.',
        'Если на сервере включён браузерный прогон, JavaScript страницы выполняется там и в отчёт попадает уже собранная разметка.',
        'HTML не записывается в базу. История и полный отчёт остаются в localStorage этого браузера.',
        'Шрифт интерфейса, иконки и графики загружаются с этого же сервера.'
    ].join(' ');
}

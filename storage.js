import { Utils } from './utils.js';

const HISTORY_KEY = 'seoAnalyzerHistory';

function slimReport(results) {
    const resources = results.resourceDistribution?.resources || [];
    return {
        ...results,
        resourceDistribution: results.resourceDistribution ? {
            ...results.resourceDistribution,
            resources: resources.slice(0, 40)
        } : undefined
    };
}

export const Storage = {
    loadHistory() {
        try {
            const saved = localStorage.getItem(HISTORY_KEY);
            const history = saved ? JSON.parse(saved) : [];
            return Array.isArray(history) ? history : [];
        } catch {
            return [];
        }
    },

    saveToHistory(results) {
        const report = slimReport(results);
        let history = this.loadHistory().filter((item) => item.url !== report.url);
        history.unshift({
            url: report.url,
            score: report.overallScore,
            date: new Date().toISOString(),
            report
        });
        history = history.slice(0, 10);
        try {
            localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
        } catch {
            history[0].report = undefined;
            try {
                localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
            } catch {
                Utils.showNotification('История не сохранилась: в браузере кончилось место', 'warning');
                return;
            }
        }
        this.renderHistory();
    },

    bindSelection(handler) {
        this.onSelect = handler;
    },

    clearHistory() {
        if (!confirm('Очистить историю проверок?')) return;
        localStorage.removeItem(HISTORY_KEY);
        this.renderHistory();
        Utils.showNotification('История проверок очищена', 'success');
    },

    renderHistory() {
        const historyList = document.getElementById('historyList');
        if (!historyList) return;

        const history = this.loadHistory();
        historyList.replaceChildren();

        if (history.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'history-empty';
            empty.textContent = 'История проверок пуста';
            historyList.append(empty);
            return;
        }

        for (const item of history) {
            const apply = () => {
                if (this.onSelect) this.onSelect(item);
            };

            const row = document.createElement('div');
            row.className = 'history-item';
            row.tabIndex = 0;
            row.setAttribute('role', 'button');
            row.addEventListener('click', apply);
            row.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    apply();
                }
            });

            const url = document.createElement('div');
            url.className = 'history-url';
            url.title = String(item.url || '');
            url.textContent = String(item.url || '');

            const score = document.createElement('div');
            score.className = 'history-score';
            score.textContent = `${Number(item.score) || 0}/100`;

            row.append(url, score);
            historyList.append(row);
        }
    }
};

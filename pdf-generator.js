import { Utils } from './utils.js';

export const PDFGenerator = {
    async generate(results) {
        if (!results?.speedChecks) {
            Utils.showNotification('Сначала выполните анализ сайта', 'warning');
            return;
        }

        Utils.showNotification('Собираем PDF…', 'info');
        try {
            const response = await fetch('/api/pdf', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(results)
            });
            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error(payload.error || 'Не удалось собрать PDF');
            }
            const blob = await response.blob();
            const link = document.createElement('a');
            const slug = String(results.url || 'report')
                .replace(/^https?:\/\//, '')
                .replace(/[^a-z0-9а-яё.-]+/gi, '-')
                .replace(/^-|-$/g, '')
                .slice(0, 80);
            link.href = URL.createObjectURL(blob);
            link.download = `seo-${slug || 'report'}.pdf`;
            link.click();
            URL.revokeObjectURL(link.href);
            Utils.showNotification('PDF сохранён', 'success');
        } catch (error) {
            Utils.showNotification(error.message || 'Не удалось собрать PDF', 'error');
        }
    }
};

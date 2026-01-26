const Analyzer = {
    async analyzeResources(url) {
        console.log(`[Analyzer] === НАЧИНАЕМ АНАЛИЗ РЕСУРСОВ ДЛЯ: ${url} ===`);
        
        const result = {
            targetUrl: url,
            targetOrigin: new URL(url).origin,
            counts: { html: 1, css: 0, js: 0, images: 0, fonts: 0, other: 0 },
            formatted: {},
            timestamp: new Date().toISOString(),
            success: false,
            error: null
        };
        
        try {
            // 1. Загружаем HTML целевого сайта
            console.log(`[Analyzer] Шаг 1: Загрузка HTML`);
            const html = await Utils.getTargetHtml(url);
            
            if (!html || html.length < 100) {
                throw new Error('HTML слишком короткий или пустой');
            }
            
            // 2. Анализируем ресурсы ТОЛЬКО целевого сайта
            console.log(`[Analyzer] Шаг 2: Анализ ресурсов целевого сайта`);
            const counts = Utils.countTargetResources(html, url);
            
            // 3. Записываем результаты
            result.counts = counts;
            result.success = true;
            
            // 4. Форматируем для отображения
            result.formatted = {
                html: `${counts.html} файл${counts.html !== 1 ? '' : ''}`,
                css: `${counts.css} файл${counts.css !== 1 ? 'ов' : ''}`,
                js: `${counts.js} файл${counts.js !== 1 ? 'ов' : ''}`,
                images: `${counts.images} файл${counts.images !== 1 ? 'ов' : ''}`,
                fonts: `${counts.fonts} файл${counts.fonts !== 1 ? 'ов' : ''}`,
                other: `${counts.other} файл${counts.other !== 1 ? 'ов' : ''}`
            };
            
            console.log(`[Analyzer] === АНАЛИЗ ЗАВЕРШЕН УСПЕШНО ===`);
            console.log(`[Analyzer] Результаты:`);
            console.log(`  Целевой сайт: ${result.targetOrigin}`);
            console.log(`  HTML страниц: ${result.counts.html}`);
            console.log(`  CSS файлов: ${result.counts.css}`);
            console.log(`  JS файлов: ${result.counts.js}`);
            console.log(`  Изображений: ${result.counts.images}`);
            console.log(`  Шрифтов: ${result.counts.fonts}`);
            console.log(`  Других ресурсов: ${result.counts.other}`);
            
        } catch (error) {
            console.error(`[Analyzer] ОШИБКА АНАЛИЗА: ${error.message}`);
            result.success = false;
            result.error = error.message;
            result.note = "Не удалось проанализировать ресурсы сайта";
        }
        
        return result;
    },
    
    // Вспомогательная функция для расчета процентов (только если нужно для графика)
    calculatePercentages(counts) {
        const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
        
        if (total === 0) {
            return {
                html: 100,
                css: 0,
                js: 0,
                images: 0,
                fonts: 0,
                other: 0
            };
        }
        
        const percentages = {};
        Object.keys(counts).forEach(key => {
            percentages[key] = Math.round((counts[key] / total) * 100);
        });
        
        return percentages;
    }
};
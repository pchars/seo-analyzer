const MainAnalyzer = {
    async analyze(url) {
        console.log(`[MainAnalyzer] Начинаем анализ: ${url}`);
        
        const results = {
            url: url,
            date: new Date().toLocaleDateString('ru-RU'),
            time: new Date().toLocaleTimeString('ru-RU'),
            speedChecks: [],
            seoChecks: [],
            techChecks: [],
            recommendations: []
        };
        
        try {
            // Шаг 1: Анализ ресурсов
            console.log('[MainAnalyzer] Шаг 1: Анализ ресурсов');
            if (UI && UI.updateProgress) {
                UI.updateProgress(10, 'Анализ распределения ресурсов...');
            }
            
            try {
                results.resourceDistribution = await Analyzer.analyzeResourceDistribution(url);
            } catch (resourceError) {
                console.warn('[MainAnalyzer] Ошибка анализа ресурсов:', resourceError);
                results.resourceDistribution = Utils.getDefaultResourceDistribution(url);
            }
            
            // Шаг 2: Выполнение проверок
            console.log('[MainAnalyzer] Шаг 2: Выполнение проверок');
            
            let currentStep = 0;
            const totalSteps = Checks.getTotalChecksCount();
            
            for (const category of ['speed', 'seo', 'tech']) {
                const checks = Checks.getChecksByCategory(category);
                
                for (const check of checks) {
                    try {
                        // Обновляем прогресс
                        if (UI && UI.updateProgress) {
                            const progressPercent = 10 + Math.round((currentStep / totalSteps) * 80);
                            UI.updateProgress(progressPercent, check.name);
                        }
                        
                        // Выполняем проверку
                        const checkResult = await Analyzer.performCheck(check, url);
                        
                        results[`${category}Checks`].push({
                            ...check,
                            status: checkResult.status,
                            value: checkResult.value
                        });
                        
                        // Небольшая пауза
                        await Utils.delay(50);
                        
                    } catch (error) {
                        console.error(`[MainAnalyzer] Ошибка ${check.name}:`, error);
                        results[`${category}Checks`].push({
                            ...check,
                            status: 'warning',
                            value: 'Ошибка проверки'
                        });
                    }
                    
                    currentStep++;
                }
            }
            
            // Шаг 3: Расчет итогов
            console.log('[MainAnalyzer] Шаг 3: Расчет итогов');
            results.overallScore = Analyzer.calculateOverallScore(results);
            results.recommendations = Analyzer.generateRecommendations(results);
            
            // Обновляем диаграмму оценки
            if (Charts && Charts.updateScoreChart) {
                Charts.updateScoreChart(results.overallScore);
            }
            
            // Сохраняем в историю
            if (document.getElementById('saveHistory')?.checked) {
                Storage.saveToHistory(url, results.overallScore);
            }
            
            console.log('[MainAnalyzer] Анализ завершен успешно!');
            console.log('[MainAnalyzer] Итоговая оценка:', results.overallScore);
            
        } catch (error) {
            console.error('[MainAnalyzer] Критическая ошибка:', error);
            Utils.showNotification('Ошибка при анализе сайта', 'error');
        }
        
        return results;
    }
};

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', function() {
    // Инициализируем UI
    UI.init();
    
    // Инициализируем графики
    Charts.init();
});

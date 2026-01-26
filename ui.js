const UI = {
    currentResults: null,
    
    init() {
        this.bindEvents();
    },
    
    bindEvents() {
        const analyzeBtn = document.getElementById('analyzeBtn');
        if (analyzeBtn) {
            analyzeBtn.addEventListener('click', () => this.analyzeSite());
        }
        
        const urlInput = document.getElementById('urlInput');
        if (urlInput) {
            urlInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.analyzeSite();
            });
        }
    },
    
    async analyzeSite() {
        const urlInput = document.getElementById('urlInput');
        let url = urlInput.value.trim();
        
        if (!url) {
            Utils.showNotification('Введите URL сайта для анализа', 'error');
            urlInput.focus();
            return;
        }
        
        // Добавляем протокол если нужно
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }
        
        if (!Utils.isValidUrl(url)) {
            Utils.showNotification('Пожалуйста, введите корректный URL (например: example.com или https://example.com)', 'error');
            urlInput.focus();
            return;
        }
        
        this.showProgress(true);
        Utils.showNotification('Анализируем ресурсы сайта...', 'info');
        
        try {
            this.updateProgress(30, 'Загрузка страницы...');
            
            // Выполняем анализ
            this.currentResults = await MainAnalyzer.analyze(url);
            
            this.updateProgress(90, 'Формирование отчета...');
            
            if (this.currentResults.success) {
                this.updateProgress(100, 'Анализ завершен!');
                await Utils.delay(500);
                
                this.displayResourceResults();
                Utils.showNotification('Анализ ресурсов завершен!', 'success');
            } else {
                Utils.showNotification(`Ошибка анализа: ${this.currentResults.error}`, 'error');
            }
            
        } catch (error) {
            console.error('Ошибка анализа:', error);
            Utils.showNotification(`Ошибка при анализе сайта: ${error.message}`, 'error');
        } finally {
            this.showProgress(false);
        }
    },
    
    showProgress(show) {
        const progressSection = document.getElementById('progressSection');
        if (!progressSection) return;
        
        if (show) {
            progressSection.classList.remove('hidden');
            this.updateProgress(0, 'Подготовка...');
        } else {
            setTimeout(() => {
                progressSection.classList.add('hidden');
            }, 1000);
        }
    },
    
    updateProgress(percent, status) {
        const progressFill = document.getElementById('progressFill');
        const progressStatus = document.getElementById('progressStatus');
        const progressPercent = document.getElementById('progressPercent');
        
        if (progressFill) progressFill.style.width = `${percent}%`;
        if (progressStatus) progressStatus.textContent = status;
        if (progressPercent) progressPercent.textContent = `${percent}%`;
    },
    
    displayResourceResults() {
        if (!this.currentResults || !this.currentResults.resourceDistribution) {
            console.error('Нет результатов для отображения');
            return;
        }
        
        const distribution = this.currentResults.resourceDistribution;
        const counts = distribution.counts || {};
        const formatted = distribution.formatted || {};
        const targetOrigin = distribution.targetOrigin || new URL(this.currentResults.url).origin;
        
        console.log('Отображаем результаты:', distribution);
        
        // 1. Обновляем информацию о сайте
        const analyzedUrlEl = document.getElementById('analyzedUrl');
        const analysisDateEl = document.getElementById('analysisDate');
        const analysisTimeEl = document.getElementById('analysisTime');
        
        if (analyzedUrlEl) analyzedUrlEl.textContent = this.currentResults.url;
        if (analysisDateEl) analysisDateEl.textContent = `Дата: ${this.currentResults.date}`;
        if (analysisTimeEl) analysisTimeEl.textContent = `Время: ${this.currentResults.time}`;
        
        // 2. Создаем или обновляем блок с результатами ресурсов
        let resultsContainer = document.getElementById('resourceResults');
        if (!resultsContainer) {
            resultsContainer = document.createElement('div');
            resultsContainer.id = 'resourceResults';
            resultsContainer.className = 'resource-results card';
            
            const resultsSection = document.getElementById('resultsSection');
            if (resultsSection) {
                resultsSection.innerHTML = ''; // Очищаем старые результаты
                resultsSection.appendChild(resultsContainer);
                resultsSection.classList.remove('hidden');
            }
        }
        
        // 3. Отображаем результаты
        resultsContainer.innerHTML = `
            <div class="resource-header">
                <h2><i class="fas fa-chart-pie"></i> Ресурсы целевого сайта</h2>
                <div class="target-info">
                    <div class="target-url">${targetOrigin}</div>
                    <div class="analysis-time">Проанализировано: ${this.currentResults.date} ${this.currentResults.time}</div>
                </div>
            </div>
            
            <div class="resource-stats">
                <div class="stat-item">
                    <div class="stat-icon" style="background-color: #4361ee;">
                        <i class="fas fa-file-alt"></i>
                    </div>
                    <div class="stat-content">
                        <div class="stat-value">${counts.html}</div>
                        <div class="stat-label">HTML страниц</div>
                    </div>
                </div>
                
                <div class="stat-item">
                    <div class="stat-icon" style="background-color: #4cc9f0;">
                        <i class="fab fa-css3-alt"></i>
                    </div>
                    <div class="stat-content">
                        <div class="stat-value">${counts.css}</div>
                        <div class="stat-label">CSS файлов</div>
                    </div>
                </div>
                
                <div class="stat-item">
                    <div class="stat-icon" style="background-color: #7209b7;">
                        <i class="fab fa-js"></i>
                    </div>
                    <div class="stat-content">
                        <div class="stat-value">${counts.js}</div>
                        <div class="stat-label">JavaScript файлов</div>
                    </div>
                </div>
                
                <div class="stat-item">
                    <div class="stat-icon" style="background-color: #f72585;">
                        <i class="fas fa-image"></i>
                    </div>
                    <div class="stat-content">
                        <div class="stat-value">${counts.images}</div>
                        <div class="stat-label">Изображений</div>
                    </div>
                </div>
                
                <div class="stat-item">
                    <div class="stat-icon" style="background-color: #f8961e;">
                        <i class="fas fa-font"></i>
                    </div>
                    <div class="stat-content">
                        <div class="stat-value">${counts.fonts}</div>
                        <div class="stat-label">Шрифтов</div>
                    </div>
                </div>
                
                <div class="stat-item">
                    <div class="stat-icon" style="background-color: #38b000;">
                        <i class="fas fa-file"></i>
                    </div>
                    <div class="stat-content">
                        <div class="stat-value">${counts.other}</div>
                        <div class="stat-label">Других ресурсов</div>
                    </div>
                </div>
            </div>
            
            ${distribution.note ? `
            <div class="resource-note">
                <i class="fas fa-info-circle"></i> ${distribution.note}
            </div>
            ` : ''}
            
            <div class="resource-total">
                <div class="total-label">Всего ресурсов на сайте:</div>
                <div class="total-value">${Object.values(counts).reduce((a, b) => a + b, 0)}</div>
            </div>
        `;
        
        // 4. Если нужно, обновляем график (опционально)
        if (typeof Charts !== 'undefined' && distribution.counts) {
            const percentages = Analyzer.calculatePercentages(distribution.counts);
            Charts.updateResourcesChart(percentages);
        }
        
        // 5. Прокручиваем к результатам
        setTimeout(() => {
            resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    }
};
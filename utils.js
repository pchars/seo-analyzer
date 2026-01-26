const Utils = {
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },
    
    isValidUrl(url) {
        try {
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                url = 'https://' + url;
            }
            new URL(url);
            return true;
        } catch (_) {
            return false;
        }
    },
    
    showNotification(message, type = 'info') {
        const notification = document.getElementById('notification');
        if (!notification) return;
        
        const colors = {
            'success': '#4cc9f0',
            'error': '#f72585',
            'warning': '#f8961e',
            'info': '#4361ee'
        };
        
        notification.style.backgroundColor = colors[type] || colors.info;
        notification.textContent = message;
        notification.classList.remove('hidden');
        
        setTimeout(() => {
            notification.classList.add('hidden');
        }, 5000);
    },
    
    async simpleFetch(url, options = {}) {
        try {
            const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
            
            const response = await fetch(proxyUrl, {
                method: options.method || 'GET',
                ...options
            });
            
            return response;
        } catch (error) {
            console.error(`[Fetch] Ошибка для ${url}:`, error.message);
            throw error;
        }
    },
    
    async fetchHtml(url) {
        try {
            console.log(`[Utils] Получаем HTML: ${url}`);
            const response = await this.simpleFetch(url);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const html = await response.text();
            
            if (!html || html.length < 100) {
                throw new Error('HTML слишком короткий');
            }
            
            return html;
        } catch (error) {
            console.error(`[Utils] Ошибка получения HTML: ${error.message}`);
            throw error;
        }
    },
    
    countResources(html, baseUrl) {
        const counts = {
            html: 1,
            css: 0,
            js: 0,
            images: 0,
            fonts: 0,
            other: 0
        };
        
        try {
            if (!html) return counts;
            
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // CSS
            counts.css = doc.querySelectorAll('link[rel="stylesheet"][href]').length;
            
            // JS
            counts.js = doc.querySelectorAll('script[src]').length;
            
            // Images
            const imgCount = doc.querySelectorAll('img[src]').length;
            const sourceCount = doc.querySelectorAll('source[src], source[srcset]').length;
            counts.images = imgCount + sourceCount;
            
            console.log(`[Utils] Найдено ресурсов: CSS=${counts.css}, JS=${counts.js}, Images=${counts.images}`);
            
        } catch (error) {
            console.error('[Utils] Ошибка подсчета ресурсов:', error);
        }
        
        return counts;
    },
    
    // НОВЫЙ ФУНКЦИОНАЛ: Детальный анализ ресурсов с таблицей
    async analyzeResourceDistribution(url) {
        console.log('[Target Analysis] Начинаем анализ ресурсов целевого сайта:', url);
        
        try {
            const html = await this.fetchHtml(url);
            
            if (!html || html.length < 100) {
                console.warn('[Target Analysis] HTML слишком короткий для анализа');
                return this.getDefaultResourceDistribution(url);
            }
            
            // Получаем детальную информацию о ресурсах
            const resourcesData = this.collectResourcesDetailed(html, url);
            const counts = resourcesData.counts;
            const resources = resourcesData.resources;
            
            // Рассчитываем проценты
            const percentages = this.calculateResourcePercentages(counts);
            
            // Форматируем для отображения
            const result = {
                targetUrl: url,
                targetOrigin: new URL(url).origin,
                counts: counts,
                percentages: percentages,
                resources: resources, // Массив с детальной информацией о каждом ресурсе
                formatted: this.formatResourceCounts(counts),
                timestamp: new Date().toISOString()
            };
            
            console.log('[Target Analysis] Результаты для целевого сайта:');
            console.log('  Количество файлов:', counts);
            console.log('  Процентное соотношение:', percentages);
            console.log('  Всего ресурсов собрано:', resources.length);
            
            return result;
            
        } catch (error) {
            console.error('[Target Analysis] Ошибка анализа целевого сайта:', error);
            return this.getDefaultResourceDistribution(url);
        }
    },
    
    collectResourcesDetailed(html, baseUrl) {
        console.log('[Target Analysis] Начинаем сбор ресурсов для:', baseUrl);
        
        const counts = {
            html: 1,
            css: 0,
            js: 0,
            images: 0,
            fonts: 0,
            other: 0
        };
        
        const resources = [];
        
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            const targetOrigin = new URL(baseUrl).origin;
            console.log('[Target Analysis] Origin целевого сайта:', targetOrigin);
            
            // 1. CSS файлы
            const cssLinks = doc.querySelectorAll('link[rel="stylesheet"][href]');
            console.log('[Target Analysis] Найдено CSS ссылок:', cssLinks.length);
            
            cssLinks.forEach(link => {
                const href = link.getAttribute('href');
                if (href && !href.startsWith('data:')) {
                    try {
                        const absoluteUrl = new URL(href, baseUrl).href;
                        
                        if (new URL(absoluteUrl).origin === targetOrigin) {
                            counts.css++;
                            
                            resources.push({
                                url: absoluteUrl,
                                type: 'css',
                                element: 'link[rel="stylesheet"]',
                                filename: this.getFileName(absoluteUrl),
                                path: absoluteUrl.replace(this.getFileName(absoluteUrl), ''),
                                size: null
                            });
                        }
                    } catch (e) {}
                }
            });
            
            // 2. JS файлы
            const jsScripts = doc.querySelectorAll('script[src]');
            console.log('[Target Analysis] Найдено JS скриптов:', jsScripts.length);
            
            jsScripts.forEach(script => {
                const src = script.getAttribute('src');
                if (src && !src.startsWith('data:')) {
                    try {
                        const absoluteUrl = new URL(src, baseUrl).href;
                        
                        if (new URL(absoluteUrl).origin === targetOrigin) {
                            counts.js++;
                            
                            resources.push({
                                url: absoluteUrl,
                                type: 'js',
                                element: 'script[src]',
                                filename: this.getFileName(absoluteUrl),
                                path: absoluteUrl.replace(this.getFileName(absoluteUrl), ''),
                                size: null
                            });
                        }
                    } catch (e) {}
                }
            });
            
            // 3. Изображения
            const imgSelectors = [
                'img[src]',
                'link[rel="icon"][href]',
                'link[rel="shortcut icon"][href]',
                'link[rel="apple-touch-icon"][href]',
                'meta[property="og:image"][content]',
                'meta[name="twitter:image"][content]'
            ];
            
            const imageElements = doc.querySelectorAll(imgSelectors.join(', '));
            console.log('[Target Analysis] Найдено изображений:', imageElements.length);
            
            imageElements.forEach(element => {
                let src = element.getAttribute('src') || 
                         element.getAttribute('href') || 
                         element.getAttribute('content');
                
                if (src && !src.startsWith('data:')) {
                    try {
                        const absoluteUrl = new URL(src, baseUrl).href;
                        
                        if (new URL(absoluteUrl).origin === targetOrigin) {
                            // Проверяем что это изображение по расширению
                            if (this.isImageUrl(absoluteUrl)) {
                                counts.images++;
                                
                                resources.push({
                                    url: absoluteUrl,
                                    type: 'image',
                                    element: element.tagName.toLowerCase() + (element.hasAttribute('rel') ? `[rel="${element.getAttribute('rel')}"]` : ''),
                                    filename: this.getFileName(absoluteUrl),
                                    path: absoluteUrl.replace(this.getFileName(absoluteUrl), ''),
                                    size: null
                                });
                            } else {
                                counts.other++;
                                
                                resources.push({
                                    url: absoluteUrl,
                                    type: 'other',
                                    element: element.tagName.toLowerCase(),
                                    filename: this.getFileName(absoluteUrl),
                                    path: absoluteUrl.replace(this.getFileName(absoluteUrl), ''),
                                    size: null
                                });
                            }
                        }
                    } catch (e) {}
                }
            });
            
            // 4. Другие ресурсы
            const otherSelectors = [
                'link[rel="manifest"][href]',
                'link[rel="preload"][href]',
                'link[rel="prefetch"][href]',
                'source[src]',
                'source[srcset]',
                'video[src]',
                'audio[src]',
                'iframe[src]',
                'embed[src]',
                'object[data]'
            ];
            
            const otherElements = doc.querySelectorAll(otherSelectors.join(', '));
            console.log('[Target Analysis] Найдено других ресурсов:', otherElements.length);
            
            otherElements.forEach(element => {
                let src = element.getAttribute('src') || 
                         element.getAttribute('href') || 
                         element.getAttribute('data') ||
                         element.getAttribute('content');
                
                // Для srcset берем первый URL
                if (element.hasAttribute('srcset')) {
                    const srcset = element.getAttribute('srcset');
                    if (srcset) {
                        src = srcset.split(',')[0].trim().split(' ')[0];
                    }
                }
                
                if (src && !src.startsWith('data:')) {
                    try {
                        const absoluteUrl = new URL(src, baseUrl).href;
                        
                        if (new URL(absoluteUrl).origin === targetOrigin) {
                            // Определяем тип ресурса
                            if (this.isImageUrl(absoluteUrl)) {
                                counts.images++;
                                
                                resources.push({
                                    url: absoluteUrl,
                                    type: 'image',
                                    element: element.tagName.toLowerCase() + (element.hasAttribute('rel') ? `[rel="${element.getAttribute('rel')}"]` : ''),
                                    filename: this.getFileName(absoluteUrl),
                                    path: absoluteUrl.replace(this.getFileName(absoluteUrl), ''),
                                    size: null
                                });
                            } else if (this.isFontUrl(absoluteUrl)) {
                                counts.fonts++;
                                
                                resources.push({
                                    url: absoluteUrl,
                                    type: 'font',
                                    element: element.tagName.toLowerCase(),
                                    filename: this.getFileName(absoluteUrl),
                                    path: absoluteUrl.replace(this.getFileName(absoluteUrl), ''),
                                    size: null
                                });
                            } else {
                                counts.other++;
                                
                                resources.push({
                                    url: absoluteUrl,
                                    type: 'other',
                                    element: element.tagName.toLowerCase() + (element.hasAttribute('rel') ? `[rel="${element.getAttribute('rel')}"]` : ''),
                                    filename: this.getFileName(absoluteUrl),
                                    path: absoluteUrl.replace(this.getFileName(absoluteUrl), ''),
                                    size: null
                                });
                            }
                        }
                    } catch (e) {}
                }
            });
            
            // Добавляем главную HTML страницу
            resources.unshift({
                url: baseUrl,
                type: 'html',
                element: 'document',
                filename: this.getFileName(baseUrl),
                path: baseUrl.replace(this.getFileName(baseUrl), ''),
                size: html.length
            });
            
            console.log('[Target Analysis] Итоговый подсчет:', counts);
            console.log('[Target Analysis] Всего ресурсов собрано:', resources.length);
            
        } catch (error) {
            console.error('[Target Analysis] Ошибка сбора ресурсов:', error);
        }
        
        return {
            counts: counts,
            resources: resources
        };
    },
    
	getDefaultResourceDistribution(url) {
		const origin = url ? new URL(url).origin : 'unknown';
		
		return {
			targetUrl: url,
			targetOrigin: origin,
			counts: { html: 1, css: 0, js: 0, images: 0, fonts: 0, other: 0 },
			percentages: { html: 100, css: 0, js: 0, images: 0, fonts: 0, other: 0 },
			resources: [{
				url: url,
				type: 'html',
				element: 'document',
				filename: this.getFileName(url),
				path: url.replace(this.getFileName(url), ''),
				size: null
			}],
			formatted: {
				html: "1 файл",
				css: "0 файлов",
				js: "0 файлов",
				images: "0 файлов",
				fonts: "0 файлов",
				other: "0 файлов"
			},
			note: "Не удалось проанализировать ресурсы целевого сайта"
		};
	},
    
    calculateResourcePercentages(counts) {
        const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
        
        if (total === 0 || total === 1) { // Только HTML страница
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
        
        // Корректируем до 100%
        let currentTotal = Object.values(percentages).reduce((a, b) => a + b, 0);
        if (currentTotal !== 100) {
            // Распределяем разницу пропорционально
            const diff = 100 - currentTotal;
            const keys = Object.keys(percentages);
            const adjustment = diff / keys.length;
            
            keys.forEach(key => {
                percentages[key] = Math.max(0, Math.round(percentages[key] + adjustment));
            });
            
            // Еще одна проверка
            currentTotal = Object.values(percentages).reduce((a, b) => a + b, 0);
            if (currentTotal !== 100) {
                percentages.html += (100 - currentTotal);
            }
        }
        
        return percentages;
    },
    
    formatResourceCounts(counts) {
        return {
            html: `${counts.html} файл${counts.html !== 1 ? 'ов' : ''}`,
            css: `${counts.css} файл${counts.css !== 1 ? 'ов' : ''}`,
            js: `${counts.js} файл${counts.js !== 1 ? 'ов' : ''}`,
            images: `${counts.images} файл${counts.images !== 1 ? 'ов' : ''}`,
            fonts: `${counts.fonts} файл${counts.fonts !== 1 ? 'ов' : ''}`,
            other: `${counts.other} файл${counts.other !== 1 ? 'ов' : ''}`
        };
    },
    
    getFileName(url) {
        try {
            const urlObj = new URL(url);
            const pathname = urlObj.pathname;
            const parts = pathname.split('/');
            return parts[parts.length - 1] || url;
        } catch {
            const parts = url.split('/');
            return parts[parts.length - 1] || url;
        }
    },
    
    isImageUrl(url) {
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico', '.bmp', '.tiff', '.avif'];
        return imageExtensions.some(ext => url.toLowerCase().includes(ext));
    },
    
    isFontUrl(url) {
        const fontExtensions = ['.woff', '.woff2', '.ttf', '.eot', '.otf'];
        return fontExtensions.some(ext => url.toLowerCase().includes(ext));
    },
    
    // Вспомогательные методы для проверок
    async getHeaders(url) {
        try {
            const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
            const response = await fetch(proxyUrl, { method: 'HEAD' });
            return response.headers;
        } catch (error) {
            throw error;
        }
    },
    
    async checkFileExists(url) {
        try {
            const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
            const response = await fetch(proxyUrl, { method: 'HEAD' });
            return { exists: response.ok, status: response.status };
        } catch (error) {
            return { exists: false, status: 0 };
        }
    }
};

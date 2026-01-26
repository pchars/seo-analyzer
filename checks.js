const Checks = {
    expandedChecks: {
        speed: [
            { 
                id: 'ttfb',
                name: 'Время до первого байта (TTFB)', 
                description: 'Время от отправки запроса до получения первого байта ответа',
                suggestion: 'Оптимизируйте работу сервера, используйте кеширование, CDN',
                weight: 1
            },
            { 
                id: 'load-time',
                name: 'Общее время загрузки', 
                description: 'Полное время загрузки страницы со всеми ресурсами',
                suggestion: 'Уменьшите размер ресурсов, используйте ленивую загрузку',
                weight: 1
            },
            { 
                id: 'page-size',
                name: 'Размер всех ресурсов', 
                description: 'Общий размер загружаемых ресурсов (HTML, CSS, JS, изображения)',
                suggestion: 'Сжимайте изображения, минифицируйте CSS и JS, используйте GZIP',
                weight: 1
            },
            { 
                id: 'requests-count',
                name: 'Количество HTTP-запросов', 
                description: 'Общее количество HTTP-запросов при загрузке страницы',
                suggestion: 'Объедините CSS и JS файлы, используйте спрайты для изображений',
                weight: 1
            },
            { 
                id: 'image-optimization',
                name: 'Оптимизация изображений', 
                description: 'Использование современных форматов изображений (WebP, AVIF)',
                suggestion: 'Конвертируйте изображения в WebP, используйте тег picture',
                weight: 1
            },
            { 
                id: 'caching',
                name: 'Кеширование статики', 
                description: 'Наличие заголовков Cache-Control для статических ресурсов',
                suggestion: 'Установите Cache-Control: max-age=31536000 для статики',
                weight: 1
            },
            { 
                id: 'compression',
                name: 'Сжатие GZIP/Brotli', 
                description: 'Сжатие ресурсов на сервере',
                suggestion: 'Включите сжатие GZIP или Brotli на сервере',
                weight: 1
            },
            { 
                id: 'minification',
                name: 'Минификация CSS/JS', 
                description: 'Минификация CSS и JavaScript файлов',
                suggestion: 'Используйте инструменты минификации для CSS и JS',
                weight: 1
            },
            { 
                id: 'async-defer',
                name: 'Загрузка скриптов (async/defer)', 
                description: 'Правильное использование async и defer для скриптов',
                suggestion: 'Используйте async для независимых скриптов, defer для зависимых',
                weight: 1
            },
            { 
                id: 'font-display',
                name: 'Оптимизация шрифтов', 
                description: 'Использование font-display: swap для веб-шрифтов',
                suggestion: 'Добавьте font-display: swap для всех веб-шрифтов',
                weight: 1
            }
        ],
        seo: [
            { 
                id: 'title',
                name: 'Title страницы', 
                description: 'Наличие и корректность заголовка title',
                suggestion: 'Title должен быть 50-60 символов, содержать ключевые слова',
                weight: 1
            },
            { 
                id: 'meta-description',
                name: 'Meta Description', 
                description: 'Наличие и качество мета-описания',
                suggestion: 'Добавьте description длиной 120-160 символов с ключевыми словами',
                weight: 1
            },
            { 
                id: 'headings',
                name: 'Структура заголовков H1-H6', 
                description: 'Правильная иерархия заголовков на странице',
                suggestion: 'Используйте только один H1 на странице, соблюдайте иерархию H2-H6',
                weight: 1
            },
            { 
                id: 'robots-txt',
                name: 'Robots.txt', 
                description: 'Наличие файла robots.txt',
                suggestion: 'Создайте robots.txt в корне сайта для управления индексацией',
                weight: 1
            },
            { 
                id: 'sitemap',
                name: 'Sitemap.xml', 
                description: 'Наличие карты сайта sitemap.xml',
                suggestion: 'Создайте sitemap.xml и укажите его в robots.txt и Search Console',
                weight: 1
            },
            { 
                id: 'mobile-friendly',
                name: 'Мобильная адаптивность', 
                description: 'Корректное отображение на мобильных устройствах',
                suggestion: 'Используйте responsive design, метатег viewport, тестируйте на разных устройствах',
                weight: 1
            },
            { 
                id: 'canonical',
                name: 'Канонические URL', 
                description: 'Наличие rel="canonical" для дублирующего контента',
                suggestion: 'Указывайте канонические URL для всех страниц с дублирующим контентом',
                weight: 1
            },
            { 
                id: 'alt-text',
                name: 'Alt-тексты изображений', 
                description: 'Наличие описательных alt-текстов у изображений',
                suggestion: 'Добавляйте описательные alt-тексты для всех значимых изображений',
                weight: 1
            },
            { 
                id: 'schema-markup',
                name: 'Микроразметка Schema.org', 
                description: 'Наличие структурированных данных',
                suggestion: 'Добавьте микроразметку Schema.org для улучшения сниппетов в поиске',
                weight: 1
            },
            { 
                id: 'open-graph',
                name: 'Open Graph разметка', 
                description: 'Наличие метатегов Open Graph для социальных сетей',
                suggestion: 'Добавьте Open Graph теги для лучшего отображения в соцсетях',
                weight: 1
            },
            { 
                id: 'twitter-cards',
                name: 'Twitter Cards', 
                description: 'Наличие разметки для Twitter',
                suggestion: 'Добавьте Twitter Card разметку',
                weight: 1
            },
            { 
                id: 'breadcrumbs',
                name: 'Хлебные крошки', 
                description: 'Наличие навигационных цепочек',
                suggestion: 'Добавьте хлебные крошки для улучшения навигации и SEO',
                weight: 1
            }
        ],
        tech: [
            { 
                id: 'https',
                name: 'HTTPS', 
                description: 'Использование защищенного протокола HTTPS',
                suggestion: 'Установите SSL-сертификат и перенаправьте весь трафик на HTTPS',
                weight: 1
            },
            { 
                id: 'http2',
                name: 'HTTP/2 поддержка', 
                description: 'Поддержка современного протокола HTTP/2',
                suggestion: 'Настройте сервер для поддержки HTTP/2 для увеличения скорости загрузки',
                weight: 1
            },
            { 
                id: 'security-headers',
                name: 'Заголовки безопасности', 
                description: 'Наличие CSP, X-Frame-Options, X-Content-Type-Options',
                suggestion: 'Настройте заголовки безопасности для защиты от атак',
                weight: 1
            },
            { 
                id: 'favicon',
                name: 'Favicon', 
                description: 'Наличие favicon',
                suggestion: 'Добавьте favicon для улучшения пользовательского опыта',
                weight: 1
            },
            { 
                id: 'console-errors',
                name: 'Ошибки в консоли', 
                description: 'Наличие ошибок JavaScript в консоли браузера',
                suggestion: 'Исправьте ошибки JavaScript для улучшения стабильности сайта',
                weight: 1
            },
            { 
                id: 'dom-size',
                name: 'Размер DOM', 
                description: 'Количество DOM-элементов на странице',
                suggestion: 'Упростите DOM-структуру, удалите лишние элементы для увеличения скорости отрисовки',
                weight: 1
            },
            { 
                id: 'preload',
                name: 'Предзагрузка критических ресурсов', 
                description: 'Использование preload, prefetch для критических ресурсов',
                suggestion: 'Добавьте preload для критического CSS и шрифтов для увеличения скорости загрузки',
                weight: 1
            },
            { 
                id: 'modern-formats',
                name: 'Современные форматы', 
                description: 'Использование WebP, AVIF для изображений, WOFF2 для шрифтов',
                suggestion: 'Используйте современные форматы для лучшей производительности',
                weight: 1
            },
            { 
                id: 'service-worker',
                name: 'Service Worker', 
                description: 'Наличие Service Worker для оффлайн работы',
                suggestion: 'Добавьте Service Worker для улучшения производительности и оффлайн работы',
                weight: 1
            },
            { 
                id: 'accessibility',
                name: 'Доступность (a11y)', 
                description: 'Соответствие стандартам доступности WCAG',
                suggestion: 'Улучшите доступность сайта для пользователей с ограниченными возможностями',
                weight: 1
            }
        ]
    },
    
    getChecksByCategory: function(category) {
        return this.expandedChecks[category] || [];
    },
    
    getTotalChecksCount: function() {
        return Object.values(this.expandedChecks).reduce((sum, checks) => sum + checks.length, 0);
    },
    
    getCategoryByCheckId: function(checkId) {
        for (const category in this.expandedChecks) {
            if (this.expandedChecks[category].some(check => check.id === checkId)) {
                return category;
            }
        }
        return 'general';
    }
};
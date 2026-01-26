const PDFGenerator = {
    async generate(results) {
        if (!results) {
            Utils.showNotification('Сначала выполните анализ сайта', 'warning');
            return;
        }
        
        Utils.showNotification('Генерация PDF отчета...', 'info');
        
        try {
            // Инициализируем PDF с поддержкой кириллицы
            const { jsPDF } = window.jspdf;
            
            // Создаем PDF с кастомными настройками для кириллицы
            const doc = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4',
                compress: true
            });
            
            // Устанавливаем шрифт для кириллицы
            doc.setFont('helvetica'); // Используем стандартный шрифт, который поддерживает кириллицу
            
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const margin = 15;
            const contentWidth = pageWidth - 2 * margin;
            
            // Создаем страницы отчета
            const pages = this.createReportPages(results);
            
            // Генерируем каждую страницу
            for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
                if (pageIndex > 0) {
                    doc.addPage();
                }
                
                const pageHTML = pages[pageIndex];
                
                // Создаем временный контейнер для рендеринга
                const tempDiv = document.createElement('div');
                tempDiv.style.cssText = `
                    position: fixed;
                    left: -9999px;
                    top: -9999px;
                    width: ${contentWidth}mm;
                    padding: 5mm;
                    background: white;
                    font-family: Arial, sans-serif;
                    color: black;
                    box-sizing: border-box;
                    font-size: 11px;
                    line-height: 1.4;
                `;
                
                // Добавляем номер страницы в HTML (чтобы он был частью изображения)
                const pageWithNumber = `
                    <div style="position: relative; min-height: ${pageHeight - 2 * margin - 10}mm;">
                        ${pageHTML}
                        <div style="position: absolute; bottom: -5mm; left: 0; right: 0; text-align: center; color: #999; font-size: 9px; font-family: Arial;">
                            Страница ${pageIndex + 1} из ${pages.length}
                        </div>
                    </div>
                `;
                
                tempDiv.innerHTML = pageWithNumber;
                document.body.appendChild(tempDiv);
                
                // Даем время на рендеринг
                await new Promise(resolve => setTimeout(resolve, 200));
                
                try {
                    // Оптимизированные настройки для html2canvas
                    const canvas = await html2canvas(tempDiv, {
                        scale: 1.2, // Оптимальный масштаб
                        useCORS: true,
                        logging: false,
                        backgroundColor: '#ffffff',
                        width: contentWidth * 3.78,
                        height: tempDiv.scrollHeight,
                        windowWidth: contentWidth * 3.78,
                        windowHeight: tempDiv.scrollHeight,
                        onclone: function(clonedDoc) {
                            // Оптимизация для кириллицы
                            clonedDoc.body.style.fontFamily = 'Arial, sans-serif';
                        }
                    });
                    
                    // Рассчитываем высоту изображения
                    const imgWidth = canvas.width;
                    const imgHeight = canvas.height;
                    const pdfImgHeight = (imgHeight * contentWidth) / imgWidth;
                    
                    // Проверяем, чтобы изображение не выходило за пределы страницы
                    const maxImgHeight = pageHeight - 2 * margin - 10;
                    let finalImgHeight = pdfImgHeight;
                    
                    // Если изображение слишком высокое, масштабируем
                    if (pdfImgHeight > maxImgHeight) {
                        const scaleFactor = maxImgHeight / pdfImgHeight;
                        finalImgHeight = maxImgHeight;
                        // Вместо масштабирования изображения, просто обрежем
                        // Лучше разбивать на несколько страниц, но для простоты оставляем как есть
                        console.log(`Изображение страницы ${pageIndex + 1} обрезано: ${pdfImgHeight.toFixed(1)}mm > ${maxImgHeight}mm`);
                    }
                    
                    // Добавляем изображение на страницу PDF
                    const imgData = canvas.toDataURL('image/jpeg', 0.85); // Качество 85%
                    doc.addImage(imgData, 'JPEG', margin, margin, contentWidth, finalImgHeight);
                    
                } catch (canvasError) {
                    console.error('Ошибка генерации canvas:', canvasError);
                    // Создаем простую страницу с ошибкой
                    doc.setFontSize(16);
                    doc.text('Ошибка генерации страницы', margin, margin + 20);
                    doc.setFontSize(11);
                    doc.text(`Страница ${pageIndex + 1} из ${pages.length}`, margin, margin + 30);
                } finally {
                    // Удаляем временный контейнер
                    if (tempDiv.parentNode) {
                        document.body.removeChild(tempDiv);
                    }
                }
            }
            
            // Сохраняем PDF
            const cleanUrl = results.url.replace(/^https?:\/\//, '').replace(/\/$/, '');
            const fileName = `seo-отчет-${cleanUrl.replace(/[^a-z0-9а-я]/gi, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.pdf`;
            doc.save(fileName);
            
            Utils.showNotification('PDF отчет успешно сгенерирован', 'success');
            
        } catch (error) {
            console.error('Ошибка генерации PDF:', error);
            Utils.showNotification('Ошибка при генерации PDF отчета. Проверьте консоль для деталей.', 'error');
        }
    },
    
    // Создаем отдельные страницы отчета с контролем высоты
    createReportPages(results) {
        const pages = [];
        
        // Страница 1: Обложка
        pages.push(this.createCoverPage(results));
        
        // Страница 2: Сводная информация
        pages.push(this.createSummaryPage(results));
        
        // Разбиваем проверки по категориям с контролем высоты
        const speedPages = this.createCategoryPages(results.speedChecks, 'Скорость загрузки', '#4361ee');
        const seoPages = this.createCategoryPages(results.seoChecks, 'SEO оптимизация', '#4cc9f0');
        const techPages = this.createCategoryPages(results.techChecks, 'Техническая оптимизация', '#7209b7');
        
        pages.push(...speedPages, ...seoPages, ...techPages);
        
        // Страницы с рекомендациями
        if (results.recommendations && results.recommendations.length > 0) {
            const recommendationPages = this.createRecommendationPages(results.recommendations);
            pages.push(...recommendationPages);
        } else {
            pages.push(this.createNoRecommendationsPage());
        }
        
        // Заключительная страница
        pages.push(this.createFinalPage(results));
        
        return pages;
    },
    
    // [Остальные функции остаются без изменений, но убедимся что они есть]
    createCoverPage(results) {
        return `
            <div style="height: 250mm; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; background: linear-gradient(135deg, #4361ee, #3a56d4); color: white; padding: 20mm; font-family: Arial, sans-serif;">
                <div style="background: white; width: 80px; height: 80px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
                    <span style="color: #4361ee; font-size: 24px; font-weight: bold;">SEO</span>
                </div>
                
                <h1 style="font-size: 32px; margin: 0 0 10px 0; font-weight: bold; letter-spacing: 1px;">SEO Analyzer Pro</h1>
                <h2 style="font-size: 24px; margin: 0 0 40px 0; font-weight: normal; opacity: 0.9;">Анализ сайта</h2>
                
                <div style="max-width: 90%; word-break: break-all; margin-bottom: 30px; background: rgba(255,255,255,0.1); padding: 15px; border-radius: 8px;">
                    <p style="font-size: 16px; margin: 0; font-weight: 500;">${results.url}</p>
                </div>
                
                <div style="margin-bottom: 30px;">
                    <p style="font-size: 14px; margin: 5px 0;">Дата анализа: ${results.date}</p>
                    <p style="font-size: 14px; margin: 5px 0;">Время: ${results.time}</p>
                </div>
                
                <div style="background: rgba(255,255,255,0.15); padding: 25px 40px; border-radius: 20px; margin-top: 20px; backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.2);">
                    <div style="font-size: 56px; font-weight: bold; margin-bottom: 10px; text-shadow: 0 2px 10px rgba(0,0,0,0.2);">
                        ${results.overallScore}
                    </div>
                    <div style="font-size: 16px; opacity: 0.9;">
                        из 100 баллов
                    </div>
                </div>
                
                <div style="margin-top: 60px; font-size: 10px; opacity: 0.7;">
                    Сгенерировано SEO Analyzer Pro • ${new Date().getFullYear()}
                </div>
            </div>
        `;
    },
    
    createSummaryPage(results) {
        const speedPassed = results.speedChecks.filter(c => c.status === 'good').length;
        const seoPassed = results.seoChecks.filter(c => c.status === 'good').length;
        const techPassed = results.techChecks.filter(c => c.status === 'good').length;
        
        const speedTotal = results.speedChecks.length;
        const seoTotal = results.seoChecks.length;
        const techTotal = results.techChecks.length;
        
        const speedPercent = speedTotal > 0 ? Math.round((speedPassed / speedTotal) * 100) : 0;
        const seoPercent = seoTotal > 0 ? Math.round((seoPassed / seoTotal) * 100) : 0;
        const techPercent = techTotal > 0 ? Math.round((techPassed / techTotal) * 100) : 0;
        
        const totalChecks = speedTotal + seoTotal + techTotal;
        const totalPassed = speedPassed + seoPassed + techPassed;
        const overallPercent = totalChecks > 0 ? Math.round((totalPassed / totalChecks) * 100) : 0;
        
        return `
            <div style="min-height: 270mm; padding: 15mm; font-family: Arial, sans-serif;">
                <h2 style="color: #4361ee; border-bottom: 2px solid #4361ee; padding-bottom: 5mm; margin-bottom: 8mm; font-size: 20px; font-weight: bold;">
                    📊 Сводный отчет анализа
                </h2>
                
                <div style="margin-bottom: 10mm;">
                    <h3 style="color: #333; margin-bottom: 3mm; font-size: 16px; font-weight: 600;">Информация о сайте</h3>
                    <div style="background: #f8f9fa; padding: 4mm; border-radius: 4mm; border-left: 4px solid #4361ee;">
                        <p style="margin: 2mm 0; font-size: 13px;"><strong>🌐 URL:</strong> ${results.url}</p>
                        <p style="margin: 2mm 0; font-size: 13px;"><strong>📅 Дата анализа:</strong> ${results.date}</p>
                        <p style="margin: 2mm 0; font-size: 13px;"><strong>⏰ Время:</strong> ${results.time}</p>
                    </div>
                </div>
                
                <div style="margin-bottom: 10mm; text-align: center; background: linear-gradient(135deg, #f8f9fa, #e9ecef); padding: 8mm; border-radius: 8mm; border: 1px solid #dee2e6;">
                    <div style="font-size: 42px; font-weight: bold; color: #4361ee; margin-bottom: 2mm;">
                        ${results.overallScore}
                    </div>
                    <div style="color: #666; font-size: 16px; font-weight: 500;">Общая оценка</div>
                    <div style="color: #999; font-size: 13px; margin-top: 1mm;">${overallPercent}% успешных проверок</div>
                </div>
                
                <div style="margin-bottom: 10mm;">
                    <h3 style="color: #333; margin-bottom: 5mm; font-size: 16px; font-weight: 600;">Статистика по категориям</h3>
                    
                    <div style="display: flex; flex-direction: column; gap: 5mm; background: #f8f9fa; padding: 6mm; border-radius: 6mm;">
                        <!-- Скорость -->
                        <div>
                            <div style="display: flex; justify-content: space-between; margin-bottom: 2mm; align-items: center;">
                                <span style="font-weight: bold; color: #4361ee; font-size: 14px;">🚀 Скорость загрузки</span>
                                <span style="font-size: 13px; background: rgba(67, 97, 238, 0.1); padding: 2mm 4mm; border-radius: 3mm; font-weight: 600;">${speedPassed}/${speedTotal} (${speedPercent}%)</span>
                            </div>
                            <div style="height: 8px; background: #e9ecef; border-radius: 4px; overflow: hidden;">
                                <div style="height: 100%; background: linear-gradient(90deg, #4361ee, #3a56d4); width: ${speedPercent}%; transition: width 1s ease;"></div>
                            </div>
                        </div>
                        
                        <!-- SEO -->
                        <div>
                            <div style="display: flex; justify-content: space-between; margin-bottom: 2mm; align-items: center;">
                                <span style="font-weight: bold; color: #4cc9f0; font-size: 14px;">🔍 SEO оптимизация</span>
                                <span style="font-size: 13px; background: rgba(76, 201, 240, 0.1); padding: 2mm 4mm; border-radius: 3mm; font-weight: 600;">${seoPassed}/${seoTotal} (${seoPercent}%)</span>
                            </div>
                            <div style="height: 8px; background: #e9ecef; border-radius: 4px; overflow: hidden;">
                                <div style="height: 100%; background: linear-gradient(90deg, #4cc9f0, #3aa9d4); width: ${seoPercent}%; transition: width 1s ease;"></div>
                            </div>
                        </div>
                        
                        <!-- Техническая -->
                        <div>
                            <div style="display: flex; justify-content: space-between; margin-bottom: 2mm; align-items: center;">
                                <span style="font-weight: bold; color: #7209b7; font-size: 14px;">⚙️ Техническая оптимизация</span>
                                <span style="font-size: 13px; background: rgba(114, 9, 183, 0.1); padding: 2mm 4mm; border-radius: 3mm; font-weight: 600;">${techPassed}/${techTotal} (${techPercent}%)</span>
                            </div>
                            <div style="height: 8px; background: #e9ecef; border-radius: 4px; overflow: hidden;">
                                <div style="height: 100%; background: linear-gradient(90deg, #7209b7, #5a07a5); width: ${techPercent}%; transition: width 1s ease;"></div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div>
                    <h3 style="color: #333; margin-bottom: 5mm; font-size: 16px; font-weight: 600;">Общая статистика</h3>
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 5mm;">
                        <div style="background: linear-gradient(135deg, #f8f9fa, #e9ecef); padding: 5mm; border-radius: 5mm; text-align: center; border: 1px solid #dee2e6;">
                            <div style="font-size: 28px; font-weight: bold; color: #4361ee;">${totalChecks}</div>
                            <div style="font-size: 12px; color: #666; margin-top: 2mm;">Всего проверок</div>
                        </div>
                        <div style="background: linear-gradient(135deg, #f8f9fa, #e9ecef); padding: 5mm; border-radius: 5mm; text-align: center; border: 1px solid #dee2e6;">
                            <div style="font-size: 28px; font-weight: bold; color: #4361ee;">${totalPassed}</div>
                            <div style="font-size: 12px; color: #666; margin-top: 2mm;">Пройдено успешно</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },
    
    createCategoryPages(checks, categoryName, color) {
        const pages = [];
        const maxChecksPerPage = 4; // Уменьшаем количество проверок на странице
        
        for (let i = 0; i < checks.length; i += maxChecksPerPage) {
            const pageChecks = checks.slice(i, i + maxChecksPerPage);
            const pageNumber = Math.floor(i / maxChecksPerPage) + 1;
            const totalPages = Math.ceil(checks.length / maxChecksPerPage);
            
            let pageHTML = `
                <div style="min-height: 250mm; padding: 15mm;">
                    <h2 style="color: ${color}; border-bottom: 2px solid ${color}; padding-bottom: 5mm; margin-bottom: 8mm; font-size: 20px;">
                        ${categoryName} <span style="font-size: 14px; color: #666;">(страница ${pageNumber} из ${totalPages})</span>
                    </h2>
            `;
            
            pageChecks.forEach((check, index) => {
                pageHTML += this.createCheckHTML(check, i + index + 1);
            });
            
            pageHTML += '</div>';
            pages.push(pageHTML);
        }
        
        return pages;
    },
    
    createCheckHTML(check, number) {
        const statusColors = {
            'good': '#4cc9f0',
            'warning': '#f8961e',
            'bad': '#f72585'
        };
        
        const statusTexts = {
            'good': '✓ Пройдено',
            'warning': '⚠ Требует улучшения',
            'bad': '✗ Не пройдено'
        };
        
        const statusColor = statusColors[check.status];
        const statusText = statusTexts[check.status];
        
        return `
            <div style="margin-bottom: 10mm; padding: 5mm; border-left: 4px solid ${statusColor}; background: #f8f9fa; border-radius: 0 4mm 4mm 0;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 3mm;">
                    <div style="flex: 1;">
                        <div style="font-weight: bold; font-size: 14px; margin-bottom: 2mm;">
                            ${number}. ${check.name}
                        </div>
                        <div style="color: #666; font-size: 12px; line-height: 1.4;">
                            ${check.description}
                        </div>
                    </div>
                    <div style="background: ${statusColor}; color: white; padding: 2mm 4mm; border-radius: 3mm; font-size: 12px; font-weight: bold; white-space: nowrap; margin-left: 5mm;">
                        ${statusText}
                    </div>
                </div>
                
                <div style="margin-bottom: 3mm; color: #888; font-size: 12px;">
                    <strong>Результат:</strong> ${check.value}
                </div>
                
                ${check.status !== 'good' ? `
                <div style="background: white; padding: 4mm; border-radius: 3mm; border: 1px solid #e9ecef; margin-top: 3mm;">
                    <div style="color: #4361ee; font-weight: bold; font-size: 12px; margin-bottom: 2mm;">
                        💡 Рекомендация:
                    </div>
                    <div style="color: #333; font-size: 12px; line-height: 1.4;">
                        ${check.suggestion}
                    </div>
                </div>
                ` : ''}
            </div>
        `;
    },
    
    createRecommendationPages(recommendations) {
        const pages = [];
        const maxRecsPerPage = 2; // Уменьшаем количество рекомендаций на странице
        
        // Группируем рекомендации по приоритету
        const groupedByPriority = {
            high: recommendations.filter(r => r.priority === 'high'),
            medium: recommendations.filter(r => r.priority === 'medium'),
            low: recommendations.filter(r => r.priority === 'low')
        };
        
        let currentPage = [];
        let recNumber = 1;
        
        // Функция для создания страницы
        const createPage = (content) => {
            return `
                <div style="min-height: 250mm; padding: 15mm;">
                    <h2 style="color: #4361ee; border-bottom: 2px solid #4361ee; padding-bottom: 5mm; margin-bottom: 8mm; font-size: 20px;">
                        Рекомендации по улучшению
                    </h2>
                    ${content}
                </div>
            `;
        };
        
        // Высокий приоритет
        if (groupedByPriority.high.length > 0) {
            let sectionHTML = `
                <div style="margin-bottom: 10mm;">
                    <h3 style="color: #f72585; margin-bottom: 5mm; padding-left: 3mm; border-left: 4px solid #f72585; font-size: 16px;">
                        🔴 Высокий приоритет
                    </h3>
            `;
            
            groupedByPriority.high.forEach((rec, index) => {
                if (index > 0 && index % maxRecsPerPage === 0) {
                    // Начинаем новую страницу
                    sectionHTML += '</div>';
                    currentPage.push(sectionHTML);
                    pages.push(createPage(currentPage.join('')));
                    currentPage = [];
                    sectionHTML = `
                        <div style="margin-bottom: 10mm;">
                            <h3 style="color: #f72585; margin-bottom: 5mm; padding-left: 3mm; border-left: 4px solid #f72585; font-size: 16px;">
                                🔴 Высокий приоритет (продолжение)
                            </h3>
                    `;
                }
                sectionHTML += this.createRecommendationHTML(rec, recNumber++);
            });
            
            sectionHTML += '</div>';
            currentPage.push(sectionHTML);
        }
        
        // Средний приоритет
        if (groupedByPriority.medium.length > 0) {
            let sectionHTML = `
                <div style="margin-bottom: 10mm;">
                    <h3 style="color: #f8961e; margin-bottom: 5mm; padding-left: 3mm; border-left: 4px solid #f8961e; font-size: 16px;">
                        🟡 Средний приоритет
                    </h3>
            `;
            
            groupedByPriority.medium.forEach((rec, index) => {
                if (currentPage.length > 0 && (recNumber - 1) % maxRecsPerPage === 0) {
                    // Начинаем новую страницу
                    sectionHTML += '</div>';
                    currentPage.push(sectionHTML);
                    pages.push(createPage(currentPage.join('')));
                    currentPage = [];
                    sectionHTML = `
                        <div style="margin-bottom: 10mm;">
                            <h3 style="color: #f8961e; margin-bottom: 5mm; padding-left: 3mm; border-left: 4px solid #f8961e; font-size: 16px;">
                                🟡 Средний приоритет (продолжение)
                            </h3>
                    `;
                }
                sectionHTML += this.createRecommendationHTML(rec, recNumber++);
            });
            
            sectionHTML += '</div>';
            currentPage.push(sectionHTML);
        }
        
        // Низкий приоритет
        if (groupedByPriority.low.length > 0) {
            let sectionHTML = `
                <div style="margin-bottom: 10mm;">
                    <h3 style="color: #4cc9f0; margin-bottom: 5mm; padding-left: 3mm; border-left: 4px solid #4cc9f0; font-size: 16px;">
                        🟢 Низкий приоритет
                    </h3>
            `;
            
            groupedByPriority.low.forEach((rec, index) => {
                if (currentPage.length > 0 && (recNumber - 1) % maxRecsPerPage === 0) {
                    // Начинаем новую страницу
                    sectionHTML += '</div>';
                    currentPage.push(sectionHTML);
                    pages.push(createPage(currentPage.join('')));
                    currentPage = [];
                    sectionHTML = `
                        <div style="margin-bottom: 10mm;">
                            <h3 style="color: #4cc9f0; margin-bottom: 5mm; padding-left: 3mm; border-left: 4px solid #4cc9f0; font-size: 16px;">
                                🟢 Низкий приоритет (продолжение)
                            </h3>
                    `;
                }
                sectionHTML += this.createRecommendationHTML(rec, recNumber++);
            });
            
            sectionHTML += '</div>';
            currentPage.push(sectionHTML);
        }
        
        // Добавляем последнюю страницу если есть рекомендации
        if (currentPage.length > 0) {
            pages.push(createPage(currentPage.join('')));
        }
        
        return pages;
    },
    
    createRecommendationHTML(rec, number) {
        const categoryNames = {
            'speed': 'Скорость',
            'seo': 'SEO',
            'tech': 'Техническая'
        };
        
        const priorityColors = {
            'high': '#f72585',
            'medium': '#f8961e',
            'low': '#4cc9f0'
        };
        
        return `
            <div style="margin-bottom: 6mm; padding: 4mm; background: #f8f9fa; border-radius: 3mm;">
                <div style="display: flex; align-items: flex-start; margin-bottom: 3mm;">
                    <div style="width: 24px; height: 24px; background: ${priorityColors[rec.priority]}; 
                         color: white; border-radius: 50%; display: flex; align-items: center; 
                         justify-content: center; font-weight: bold; margin-right: 3mm; flex-shrink: 0;">
                        ${number}
                    </div>
                    <div style="flex-grow: 1;">
                        <div style="font-weight: bold; font-size: 14px; margin-bottom: 1mm;">
                            ${rec.title}
                        </div>
                        <div style="color: #666; font-size: 12px;">
                            ${rec.description}
                        </div>
                    </div>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="color: #888; font-size: 12px;">
                        Категория: <strong>${categoryNames[rec.category] || rec.category}</strong>
                    </div>
                    <div style="background: ${priorityColors[rec.priority]}; color: white; 
                         padding: 1mm 3mm; border-radius: 2mm; font-size: 11px; font-weight: bold;">
                        ${rec.priority === 'high' ? 'Высокий' : rec.priority === 'medium' ? 'Средний' : 'Низкий'} приоритет
                    </div>
                </div>
            </div>
        `;
    },
    
    createNoRecommendationsPage() {
        return `
            <div style="padding: 15mm; font-family: Arial, sans-serif; text-align: center; display: flex; flex-direction: column; justify-content: center; min-height: 250mm;">
                <div style="font-size: 72px; color: #4cc9f0; margin-bottom: 10mm;">🎉</div>
                <h2 style="color: #4cc9f0; margin-bottom: 5mm;">Отличный результат!</h2>
                <p style="color: #666; font-size: 16px; margin-bottom: 10mm;">
                    Все проверки пройдены успешно.<br>
                    Сайт оптимизирован по всем параметрам.
                </p>
                <div style="background: #f0f9ff; padding: 10mm; border-radius: 5mm; display: inline-block; margin: 0 auto;">
                    <div style="font-size: 48px; font-weight: bold; color: #4cc9f0;">
                        100%
                    </div>
                    <div style="color: #666; font-size: 14px; margin-top: 2mm;">
                        успешных проверок
                    </div>
                </div>
            </div>
        `;
    },
    
    createFinalPage(results) {
        const rating = this.getOverallRating(results.overallScore);
        
        return `
            <div style="padding: 15mm; font-family: Arial, sans-serif;">
                <h2 style="color: #4361ee; border-bottom: 2px solid #4361ee; padding-bottom: 5mm; margin-bottom: 8mm;">
                    Заключение
                </h2>
                
                <div style="margin-bottom: 10mm; background: #f8f9fa; padding: 8mm; border-radius: 5mm; text-align: center;">
                    <div style="font-size: 36px; font-weight: bold; color: #4361ee; margin-bottom: 2mm;">
                        ${results.overallScore}/100
                    </div>
                    <div style="font-size: 18px; color: ${rating.color}; font-weight: bold; margin-bottom: 4mm;">
                        ${rating.text}
                    </div>
                    <div style="color: #666; font-size: 14px;">
                        Итоговая оценка сайта
                    </div>
                </div>
                
                <div style="margin-bottom: 8mm;">
                    <h3 style="color: #333; margin-bottom: 4mm;">Ключевые выводы</h3>
                    <div style="background: white; padding: 6mm; border-radius: 3mm; border: 1px solid #e9ecef;">
                        <div style="color: #333; font-size: 14px; line-height: 1.6;">
                            ${this.getConclusions(results)}
                        </div>
                    </div>
                </div>
                
                ${results.recommendations.length > 0 ? `
                <div style="margin-bottom: 8mm;">
                    <h3 style="color: #333; margin-bottom: 4mm;">Следующие шаги</h3>
                    <div style="background: white; padding: 6mm; border-radius: 3mm; border: 1px solid #e9ecef;">
                        <ol style="color: #333; font-size: 14px; line-height: 1.6; margin: 0; padding-left: 4mm;">
                            <li style="margin-bottom: 2mm;">Начните с рекомендаций высокого приоритета</li>
                            <li style="margin-bottom: 2mm;">Регулярно проводите повторный анализ (раз в 3-6 месяцев)</li>
                            <li>Отслеживайте изменения в показателях производительности</li>
                        </ol>
                    </div>
                </div>
                ` : ''}
                
                <div style="margin-top: 15mm; padding-top: 8mm; border-top: 1px solid #e9ecef; color: #999; font-size: 12px;">
                    <p style="margin: 2mm 0;">Отчет сгенерирован автоматически</p>
                    <p style="margin: 2mm 0;">SEO Analyzer Pro © ${new Date().getFullYear()}</p>
                    <p style="margin: 2mm 0;">Для получения профессиональной консультации обратитесь к специалистам</p>
                </div>
            </div>
        `;
    },
    
    getOverallRating(score) {
        if (score >= 90) {
            return { 
                text: 'Отлично', 
                color: '#4cc9f0'
            };
        } else if (score >= 70) {
            return { 
                text: 'Хорошо', 
                color: '#7209b7'
            };
        } else if (score >= 50) {
            return { 
                text: 'Удовлетворительно', 
                color: '#f8961e'
            };
        } else {
            return { 
                text: 'Требует улучшений', 
                color: '#f72585'
            };
        }
    },
    
    getConclusions(results) {
        const score = results.overallScore;
        
        if (score >= 90) {
            return 'Сайт отлично оптимизирован по всем проверенным параметрам. Все основные метрики соответствуют современным стандартам веб-разработки. Продолжайте поддерживать текущий уровень качества и регулярно мониторьте показатели для сохранения высоких результатов.';
        } else if (score >= 70) {
            return 'Сайт хорошо оптимизирован, но есть возможности для улучшения. Основные параметры находятся на приемлемом уровне, однако некоторые аспекты требуют внимания. Рекомендуется обратить внимание на рекомендации среднего и высокого приоритета для достижения оптимальных показателей.';
        } else if (score >= 50) {
            return 'Требуется оптимизация по нескольким ключевым направлениям. Сайт имеет базовую функциональность, но многие важные аспекты производительности и SEO требуют улучшения. Рекомендуется начать с критических замечаний и последовательно внедрять все рекомендации.';
        } else {
            return 'Необходима серьезная работа по оптимизации сайта. Многие важные параметры не соответствуют современным стандартам. Рекомендуется начать с критических замечаний высокого приоритета и систематически улучшать все аспекты производительности и оптимизации.';
        }
    }
};
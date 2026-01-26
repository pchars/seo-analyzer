const Charts = {
    resourcesChart: null,
    
    init() {
        // Инициализируем только если есть canvas
        const ctx = document.getElementById('resourcesChart');
        if (ctx) {
            this.initResourcesChart();
        }
    },
    
    initResourcesChart() {
        const ctx = document.getElementById('resourcesChart');
        if (!ctx) return;
        
        try {
            this.resourcesChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['HTML', 'CSS', 'JavaScript', 'Изображения', 'Шрифты', 'Другое'],
                    datasets: [{
                        data: [100, 0, 0, 0, 0, 0], // Начальные данные
                        backgroundColor: [
                            '#4361ee',
                            '#4cc9f0',
                            '#7209b7',
                            '#f72585',
                            '#f8961e',
                            '#38b000'
                        ],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'right',
                            labels: {
                                padding: 20,
                                usePointStyle: true,
                                font: {
                                    size: 12
                                }
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return `${context.label}: ${context.raw}%`;
                                }
                            }
                        }
                    },
                    cutout: '65%'
                }
            });
        } catch (error) {
            console.error('Ошибка инициализации графика:', error);
        }
    },
    
    updateResourcesChart(percentages) {
        if (!this.resourcesChart) {
            console.warn('График не инициализирован');
            return;
        }
        
        if (!percentages) {
            console.warn('Нет данных для графика');
            return;
        }
        
        try {
            this.resourcesChart.data.datasets[0].data = [
                percentages.html || 0,
                percentages.css || 0,
                percentages.js || 0,
                percentages.images || 0,
                percentages.fonts || 0,
                percentages.other || 0
            ];
            
            this.resourcesChart.update();
        } catch (error) {
            console.error('Ошибка обновления графика:', error);
        }
    }
};
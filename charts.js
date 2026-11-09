export const Charts = {
    resourcesChart: null,
    scoreChart: null,

    init() {
        this.ensure();
    },

    ensure() {
        if (typeof Chart === 'undefined') return;
        if (!this.resourcesChart) this.initResourcesChart();
        if (!this.scoreChart) this.initScoreChart();
    },

    initResourcesChart() {
        const ctx = document.getElementById('resourcesChart');
        if (!ctx) return;
        this.resourcesChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['HTML', 'CSS', 'JavaScript', 'Изображения', 'Шрифты', 'Другое'],
                datasets: [{
                    data: [100, 0, 0, 0, 0, 0],
                    backgroundColor: ['#4361ee', '#4cc9f0', '#7209b7', '#f72585', '#f8961e', '#38b000'],
                    borderWidth: 0,
                    hoverOffset: 0
                }]
            },
            options: doughnutOptions((label, raw) => `${label}: ${raw}%`)
        });
    },

    initScoreChart() {
        const ctx = document.getElementById('scoreChart');
        if (!ctx) return;
        this.scoreChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Оценка', 'Осталось'],
                datasets: [{
                    data: [0, 100],
                    backgroundColor: ['#4361ee', '#e9ecef'],
                    borderWidth: 0,
                    hoverOffset: 0
                }]
            },
            options: doughnutOptions((label, raw) => `${label}: ${raw}`, { legend: false })
        });
    },

    updateResourcesChart(percentages = {}) {
        this.ensure();
        if (!this.resourcesChart) return;
        this.resourcesChart.data.datasets[0].data = [
            percentages.html || 0,
            percentages.css || 0,
            percentages.js || 0,
            percentages.images || 0,
            percentages.fonts || 0,
            percentages.other || 0
        ];
        this.resourcesChart.update();
    },

    updateScoreChart(score) {
        this.ensure();
        if (!this.scoreChart) return;
        const value = Math.max(0, Math.min(100, Number(score) || 0));
        const color = value >= 90 ? '#4cc9f0' : value >= 70 ? '#7209b7' : value >= 50 ? '#f8961e' : '#f72585';
        this.scoreChart.data.datasets[0].data = [value, 100 - value];
        this.scoreChart.data.datasets[0].backgroundColor = [color, '#e9ecef'];
        this.scoreChart.update();
    }
};

function doughnutOptions(label, { legend = true } = {}) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: legend,
                position: 'right',
                labels: {
                    padding: 16,
                    usePointStyle: true,
                    pointStyle: 'circle',
                    boxWidth: 8,
                    boxHeight: 8,
                    font: { size: 12 }
                }
            },
            tooltip: {
                usePointStyle: true,
                boxWidth: 8,
                boxHeight: 8,
                boxPadding: 4,
                callbacks: {
                    label(context) {
                        return label(context.label, context.raw);
                    }
                }
            }
        },
        cutout: '68%'
    };
}

const Storage = {
    loadHistory() {
        const savedHistory = localStorage.getItem('seoAnalyzerHistory');
        return savedHistory ? JSON.parse(savedHistory) : [];
    },
    
    saveToHistory(url, score) {
        let history = this.loadHistory();
        const existingIndex = history.findIndex(item => item.url === url);
        
        const historyItem = {
            url: url,
            score: score,
            date: new Date().toISOString()
        };
        
        if (existingIndex !== -1) {
            history[existingIndex] = historyItem;
        } else {
            history.unshift(historyItem);
            if (history.length > 10) {
                history = history.slice(0, 10);
            }
        }
        
        localStorage.setItem('seoAnalyzerHistory', JSON.stringify(history));
        this.renderHistory();
    },
    
    clearHistory() {
        if (confirm('Вы уверены, что хотите очистить историю проверок?')) {
            localStorage.removeItem('seoAnalyzerHistory');
            this.renderHistory();
            Utils.showNotification('История проверок очищена', 'success');
        }
    },
    
    renderHistory() {
        const historyList = document.getElementById('historyList');
        if (!historyList) return;
        
        const history = this.loadHistory();
        
        if (history.length === 0) {
            historyList.innerHTML = '<p class="history-empty">История проверок пуста</p>';
            return;
        }
        
        historyList.innerHTML = history.map(item => `
            <div class="history-item">
                <div class="history-url" title="${item.url}">${item.url}</div>
                <div class="history-score">${item.score}/100</div>
            </div>
        `).join('');
        
        document.querySelectorAll('.history-item').forEach((item, index) => {
            item.addEventListener('click', () => {
                document.getElementById('urlInput').value = history[index].url;
                document.getElementById('urlInput').focus();
            });
        });
    }
};
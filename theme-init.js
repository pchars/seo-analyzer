try {
    if (localStorage.getItem('seoAnalyzerTheme') === 'dark') {
        document.documentElement.classList.add('dark-theme');
    }
} catch (error) {
    // Тема останется светлой, если хранилище недоступно.
}

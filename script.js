import { UI } from './ui.js';
import { Charts } from './charts.js';

function start() {
    UI.init();
    Charts.init();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
} else {
    start();
}

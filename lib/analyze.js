import { collectFromDocument } from './resources.js';
import { evaluateChecks } from './evaluate.js';
import { calculateOverallScore, categoryScores, generateRecommendations } from './report.js';

export function analyzeSnapshot(snapshot, options = {}) {
    const now = options.now instanceof Date ? options.now : new Date();
    const pageUrl = snapshot.finalUrl || snapshot.requestedUrl;
    const doc = new DOMParser().parseFromString(snapshot.html || '', 'text/html');
    const resourceDistribution = collectFromDocument(doc, pageUrl);
    const evaluated = evaluateChecks(snapshot, resourceDistribution, doc);

    return {
        url: pageUrl,
        requestedUrl: snapshot.requestedUrl || pageUrl,
        date: now.toLocaleDateString('ru-RU'),
        time: now.toLocaleTimeString('ru-RU'),
        ...evaluated,
        resourceDistribution: {
            counts: resourceDistribution.counts,
            percentages: resourceDistribution.percentages,
            resources: resourceDistribution.resources,
            formatted: resourceDistribution.formatted
        },
        overallScore: calculateOverallScore(evaluated),
        categoryScores: categoryScores(evaluated),
        recommendations: generateRecommendations(evaluated),
        detailedReport: options.detailedReport !== false,
        rendered: Boolean(snapshot.rendered),
        success: true
    };
}

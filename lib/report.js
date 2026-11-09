export function calculateOverallScore(results) {
    const checks = allChecks(results);
    if (checks.length === 0) return 0;
    const applicable = checks.filter((check) => check.status !== 'na');
    if (applicable.length === 0) return 0;
    const points = applicable.reduce((sum, check) => {
        if (check.status === 'good') return sum + 1;
        if (check.status === 'warning') return sum + 0.5;
        return sum;
    }, 0);
    return Math.round((points / applicable.length) * 100);
}

export function categoryScores(results) {
    return {
        speed: tally(results.speedChecks),
        seo: tally(results.seoChecks),
        tech: tally(results.techChecks)
    };
}

export function generateRecommendations(results) {
    const order = { high: 0, medium: 1, low: 2 };
    return [
        ...withCategory(results.speedChecks, 'speed'),
        ...withCategory(results.seoChecks, 'seo'),
        ...withCategory(results.techChecks, 'tech')
    ]
        .filter((check) => check.status !== 'good' && check.status !== 'na')
        .map((check) => ({
            title: check.name,
            description: `${check.value}. ${check.suggestion}`,
            detail: `Сейчас: ${check.value}. ${check.detail || check.suggestion}`,
            category: check.category,
            priority: priorityFor(check)
        }))
        .sort((a, b) => order[a.priority] - order[b.priority]);
}

function priorityFor(check) {
    if (check.status === 'bad') return check.optional ? 'medium' : 'high';
    return check.optional ? 'low' : 'medium';
}

function withCategory(checks, category) {
    return (checks || []).map((check) => ({ ...check, category }));
}

function allChecks(results) {
    return [...(results.speedChecks || []), ...(results.seoChecks || []), ...(results.techChecks || [])];
}

function tally(checks = []) {
    const applicable = checks.filter((check) => check.status !== 'na');
    return {
        good: applicable.filter((check) => check.status === 'good').length,
        total: applicable.length
    };
}

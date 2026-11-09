import fs from 'node:fs/promises';

export function createMemoryLimiter(limit, windowMs = 60_000, now = () => Date.now(), sweepAt = 1000) {
    const hits = new Map();
    const allow = (ip) => {
        const time = now();
        if (hits.size >= sweepAt) {
            for (const [key, stamps] of hits) {
                const fresh = stamps.filter((stamp) => time - stamp < windowMs);
                if (fresh.length === 0) hits.delete(key);
                else hits.set(key, fresh);
            }
        }
        const recent = (hits.get(ip) || []).filter((stamp) => time - stamp < windowMs);
        if (recent.length >= limit) {
            hits.set(ip, recent);
            return false;
        }
        recent.push(time);
        hits.set(ip, recent);
        return true;
    };
    allow.size = () => hits.size;
    return allow;
}

export function createSemaphore(max) {
    let active = 0;
    return {
        tryEnter() {
            if (active >= max) return false;
            active += 1;
            return true;
        },
        leave() {
            active = Math.max(0, active - 1);
        }
    };
}

export function createFileLimiter(file, limit, windowMs = 60_000, now = () => Date.now()) {
    return (ip) => withLock(`${file}.lock`, async () => {
        let data = {};
        try {
            data = JSON.parse(await fs.readFile(file, 'utf8'));
        } catch {
            data = {};
        }
        const time = now();
        const recent = (Array.isArray(data[ip]) ? data[ip] : []).filter((stamp) => time - stamp < windowMs);
        const allowed = recent.length < limit;
        if (allowed) recent.push(time);
        data[ip] = recent;
        await fs.writeFile(file, JSON.stringify(data));
        return allowed;
    });
}

async function withLock(lockPath, fn) {
    const started = Date.now();
    for (;;) {
        try {
            const handle = await fs.open(lockPath, 'wx');
            try {
                return await fn();
            } finally {
                await handle.close();
                await fs.rm(lockPath, { force: true });
            }
        } catch (error) {
            if (error.code !== 'EEXIST') throw error;
            if (Date.now() - started > 2000) return false;
            await new Promise((resolve) => setTimeout(resolve, 15));
        }
    }
}

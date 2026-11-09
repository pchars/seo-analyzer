import assert from 'node:assert/strict';
import test from 'node:test';
import { assertPublicHttpUrl, isBlockedAddress } from '../lib/ssrf.js';

test('blocks private, local and shorthand addresses', async () => {
    for (const address of ['127.0.0.1', '10.1.2.3', '192.168.0.5', '172.16.0.1', '169.254.169.254', '::1', '0.0.0.0']) {
        assert.equal(isBlockedAddress(address), true, address);
    }
    assert.equal(isBlockedAddress('8.8.8.8'), false);
    assert.equal(isBlockedAddress('192.0.2.1'), false);

    await assert.rejects(() => assertPublicHttpUrl('http://127.0.0.1/'), /локальные адреса/i);
    await assert.rejects(() => assertPublicHttpUrl('http://127.1/'), /локальные адреса/i);
    await assert.rejects(() => assertPublicHttpUrl('http://[::1]/'), /локальные адреса/i);
    await assert.rejects(() => assertPublicHttpUrl('http://0177.0.0.1/'), /локальные адреса/i);
    await assert.rejects(() => assertPublicHttpUrl('http://0x7f000001/'), /локальные адреса/i);
    await assert.rejects(() => assertPublicHttpUrl('file:///etc/passwd'), /http\(s\)/i);
    await assert.rejects(() => assertPublicHttpUrl('http://user:pass@example.com'), /http\(s\)/i);

    const allowed = await assertPublicHttpUrl('http://192.0.2.1/report');
    assert.equal(allowed.href, 'http://192.0.2.1/report');
});

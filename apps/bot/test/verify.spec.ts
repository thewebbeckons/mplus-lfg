import { describe, expect, it } from 'vitest';
import { verifyDiscordRequest, verifySignature } from '../src/verify';
import { bytesToHex, createSigningKey, signedInteraction } from './helpers';

async function sign(key: CryptoKey, message: string): Promise<string> {
	return bytesToHex(new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, key, new TextEncoder().encode(message))));
}

describe('verifySignature', () => {
	it('accepts a signature over timestamp + body', async () => {
		const key = await createSigningKey();
		const body = '{"type":1}';
		const timestamp = '1750000000';
		const signature = await sign(key.privateKey, timestamp + body);

		expect(await verifySignature(body, signature, timestamp, key.publicKeyHex)).toBe(true);
	});

	it('rejects a tampered body', async () => {
		const key = await createSigningKey();
		const timestamp = '1750000000';
		const signature = await sign(key.privateKey, `${timestamp}{"type":1}`);

		expect(await verifySignature('{"type":2}', signature, timestamp, key.publicKeyHex)).toBe(false);
	});

	it('rejects a replayed signature under a different timestamp', async () => {
		const key = await createSigningKey();
		const signature = await sign(key.privateKey, '1750000000{"type":1}');

		expect(await verifySignature('{"type":1}', signature, '1750000999', key.publicKeyHex)).toBe(false);
	});

	it('rejects a signature from a different application key', async () => {
		const [signer, other] = await Promise.all([createSigningKey(), createSigningKey()]);
		const timestamp = '1750000000';
		const signature = await sign(signer.privateKey, `${timestamp}{"type":1}`);

		expect(await verifySignature('{"type":1}', signature, timestamp, other.publicKeyHex)).toBe(false);
	});

	it('rejects malformed input instead of throwing', async () => {
		const key = await createSigningKey();
		expect(await verifySignature('{}', 'not-hex', '1750000000', key.publicKeyHex)).toBe(false);
		expect(await verifySignature('{}', 'abcd', '1750000000', key.publicKeyHex)).toBe(false);
		expect(await verifySignature('{}', 'ab'.repeat(64), '1750000000', 'zz')).toBe(false);
	});
});

describe('verifyDiscordRequest', () => {
	it('verifies a Discord-shaped request and hands back the raw body', async () => {
		const key = await createSigningKey();
		const request = await signedInteraction(key, { type: 1 });

		const result = await verifyDiscordRequest(request, key.publicKeyHex);
		expect(result.valid).toBe(true);
		expect(JSON.parse(result.body)).toEqual({ type: 1 });
	});

	it('rejects a request with no signature headers', async () => {
		const key = await createSigningKey();
		const request = new Request('https://example.com/interactions', { method: 'POST', body: '{"type":1}' });

		expect((await verifyDiscordRequest(request, key.publicKeyHex)).valid).toBe(false);
	});

	it('rejects when the public key is not configured', async () => {
		const key = await createSigningKey();
		const request = await signedInteraction(key, { type: 1 });

		expect((await verifyDiscordRequest(request, '')).valid).toBe(false);
	});
});

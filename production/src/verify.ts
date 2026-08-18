/**
 * Ed25519 request verification for Discord HTTP interactions.
 *
 * Discord signs `timestamp + rawBody` with the application's private key and
 * sends the signature in `X-Signature-Ed25519`. Every request must be rejected
 * with 401 if it does not verify — Discord probes this during endpoint setup.
 */

/** Imported keys are cached per isolate; `importKey` is the expensive part. */
const keyCache = new Map<string, Promise<CryptoKey>>();

function hexToBytes(hex: string): Uint8Array {
	if (hex.length % 2 !== 0 || /[^0-9a-fA-F]/.test(hex)) {
		throw new Error('Invalid hex string');
	}
	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < bytes.length; i++) {
		bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	}
	return bytes;
}

function importPublicKey(publicKeyHex: string): Promise<CryptoKey> {
	let cached = keyCache.get(publicKeyHex);
	if (!cached) {
		cached = crypto.subtle.importKey('raw', hexToBytes(publicKeyHex), { name: 'Ed25519' }, false, ['verify']);
		// Do not cache a rejected import: a transient failure would poison the isolate.
		cached.catch(() => keyCache.delete(publicKeyHex));
		keyCache.set(publicKeyHex, cached);
	}
	return cached;
}

/**
 * @param rawBody the request body exactly as received — re-serialized JSON will not verify.
 */
export async function verifySignature(rawBody: string, signatureHex: string, timestamp: string, publicKeyHex: string): Promise<boolean> {
	try {
		const key = await importPublicKey(publicKeyHex);
		const signature = hexToBytes(signatureHex);
		if (signature.length !== 64) return false;
		const message = new TextEncoder().encode(timestamp + rawBody);
		return await crypto.subtle.verify({ name: 'Ed25519' }, key, signature, message);
	} catch {
		// Malformed hex, wrong key length, unsupported algorithm — all mean "reject".
		return false;
	}
}

export interface VerifiedRequest {
	valid: boolean;
	/** Raw body text, read once so callers do not need to re-read the stream. */
	body: string;
}

export async function verifyDiscordRequest(request: Request, publicKeyHex: string): Promise<VerifiedRequest> {
	const signature = request.headers.get('X-Signature-Ed25519');
	const timestamp = request.headers.get('X-Signature-Timestamp');
	const body = await request.text();

	if (!signature || !timestamp || !publicKeyHex) {
		return { valid: false, body };
	}
	return { valid: await verifySignature(body, signature, timestamp, publicKeyHex), body };
}

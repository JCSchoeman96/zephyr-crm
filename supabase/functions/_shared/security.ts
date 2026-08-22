async function constantTimeEqual(left: string, right: string): Promise<boolean> {
	const [leftDigest, rightDigest] = await Promise.all(
		[left, right].map((value) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
	);
	const leftBytes = new Uint8Array(leftDigest);
	const rightBytes = new Uint8Array(rightDigest);
	let difference = left.length ^ right.length;
	for (let index = 0; index < leftBytes.length; index += 1) {
		difference |= leftBytes[index] ^ rightBytes[index];
	}
	return difference === 0;
}

export function verifyBearerSecret(
	header: string | null,
	expectedSecret: string | undefined
): Promise<boolean> {
	if (!header?.trim() || !expectedSecret?.trim()) return Promise.resolve(false);
	return constantTimeEqual(header.trim(), `Bearer ${expectedSecret.trim()}`);
}

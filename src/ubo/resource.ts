import { brotliCompressSync, constants } from 'node:zlib';

export function compress(s: string) {
    const data: Uint8Array = brotliCompressSync(s, {
        params: {
            [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT,
            [constants.BROTLI_PARAM_QUALITY]: 11,
            [constants.BROTLI_PARAM_SIZE_HINT]: s.length,
        },
    });

    return data.buffer.slice(
        data.byteOffset,
        data.byteOffset + data.byteLength,
    ) as ArrayBuffer;
}

export async function tag(s: string) {
    const buf = await crypto.subtle.digest(
        { name: 'SHA-256' },
        new TextEncoder().encode(s),
    );

    return ['"', ...new Uint32Array(buf).slice(0, 3), '"']
        .map((a) => (a as number | string).toString(36)).join('');
}

export async function tag(s: string) {
    const buf = await crypto.subtle.digest(
        { name: 'SHA-256' },
        new TextEncoder().encode(s),
    );

    return ['"', ...new Uint32Array(buf).slice(0, 3), '"']
        .map((a) => (a as number | string).toString(36)).join('');
}

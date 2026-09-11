const escape = (s: string) => {
    return s
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');
};

const serializeNode = (name: string, value: unknown): string => {
    if (value === null || value === undefined) {
        return '';
    }

    if (Array.isArray(value)) {
        return value.map((item) => serializeNode(name, item)).join('');
    }

    if (typeof value === 'object') {
        const attrs: string[] = [];
        let children = '';
        for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
            if (key.startsWith('@')) {
                attrs.push(` ${key.slice(1)}="${escape(String(val))}"`);
            } else {
                children += serializeNode(key, val);
            }
        }
        if (!children) {
            return `<${name}${attrs.join('')}/>`;
        }
        return `<${name}${attrs.join('')}>${children}</${name}>`;
    }

    return `<${name}>${escape(String(value))}</${name}>`;
};

export const stringify = (obj: Record<string, unknown>) => {
    let declaration = '';
    let body = '';
    for (const [key, value] of Object.entries(obj)) {
        if (key === '@version' || key === '@encoding') {
            continue;
        }
        body += serializeNode(key, value);
    }
    const version = obj['@version'] ?? '1.0';
    const encoding = obj['@encoding'] ?? 'UTF-8';
    declaration = `<?xml version="${version}" encoding="${encoding}"?>`;
    return declaration + body;
};

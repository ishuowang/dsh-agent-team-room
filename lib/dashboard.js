import { readFile } from 'node:fs/promises';
import z from '@deepseek-ai/schemastery';
export const name = 'agent-team-room-dashboard';
export const inject = ['rooms', 'webServer'];
export const Config = z.object({
    routePrefix: z.string().default('/agent-team-room'),
    allowRemote: z.boolean().default(false),
});
function normalizedPrefix(value) {
    const prefix = value.trim();
    if (!prefix.startsWith('/') || prefix === '/' || prefix.endsWith('/')) {
        throw new Error('agent-team-room dashboard routePrefix must start with / and have no trailing slash');
    }
    return prefix;
}
export function isLoopbackAddress(address) {
    if (!address)
        return false;
    const normalized = address.toLowerCase();
    return normalized === '::1'
        || normalized.startsWith('127.')
        || normalized.startsWith('::ffff:127.');
}
function send(req, res, status, contentType, body, headers = {}) {
    const length = Buffer.byteLength(body);
    res.writeHead(status, {
        'content-type': contentType,
        'content-length': String(length),
        'x-content-type-options': 'nosniff',
        ...headers,
    });
    res.end(req.method === 'HEAD' ? undefined : body);
}
function json(req, res, status, value) {
    send(req, res, status, 'application/json; charset=utf-8', `${JSON.stringify(value)}\n`, {
        'cache-control': 'no-store',
    });
}
async function loadAssets() {
    const [html, css, javascript] = await Promise.all([
        readFile(new URL('../assets/dashboard.html', import.meta.url)),
        readFile(new URL('../assets/dashboard.css', import.meta.url)),
        readFile(new URL('../assets/dashboard.js', import.meta.url)),
    ]);
    return { html, css, javascript };
}
/** Serve a read-only, loopback-by-default dashboard and JSON projection. */
export async function apply(ctx, config) {
    const prefix = normalizedPrefix(config.routePrefix);
    const assets = await loadAssets();
    const csp = [
        "default-src 'none'",
        "base-uri 'self'",
        "connect-src 'self'",
        "font-src 'self'",
        "frame-ancestors 'self'",
        "img-src 'self' data:",
        "script-src 'self'",
        "style-src 'self'",
    ].join('; ');
    ctx.effect(() => ctx.webServer.register({
        kind: 'prefix',
        path: prefix,
        handler(req, res) {
            if (req.method !== 'GET' && req.method !== 'HEAD') {
                res.writeHead(405, { allow: 'GET, HEAD' });
                res.end();
                return;
            }
            if (!config.allowRemote && !isLoopbackAddress(req.socket.remoteAddress)) {
                json(req, res, 403, { error: 'remote_dashboard_access_disabled' });
                return;
            }
            const pathname = new URL(req.url ?? '/', 'http://dsh.local').pathname;
            if (pathname === prefix) {
                res.writeHead(308, { location: `${prefix}/` });
                res.end();
                return;
            }
            if (pathname === `${prefix}/`) {
                send(req, res, 200, 'text/html; charset=utf-8', assets.html, {
                    'cache-control': 'no-cache',
                    'content-security-policy': csp,
                    'referrer-policy': 'no-referrer',
                });
                return;
            }
            if (pathname === `${prefix}/dashboard.css`) {
                send(req, res, 200, 'text/css; charset=utf-8', assets.css, { 'cache-control': 'no-cache' });
                return;
            }
            if (pathname === `${prefix}/dashboard.js`) {
                send(req, res, 200, 'text/javascript; charset=utf-8', assets.javascript, { 'cache-control': 'no-cache' });
                return;
            }
            if (pathname === `${prefix}/api/rooms`) {
                json(req, res, 200, { rooms: ctx.rooms.listAllRooms(true) });
                return;
            }
            const roomPrefix = `${prefix}/api/rooms/`;
            if (pathname.startsWith(roomPrefix)) {
                const encoded = pathname.slice(roomPrefix.length);
                if (encoded.length === 0 || encoded.includes('/')) {
                    json(req, res, 404, { error: 'not_found' });
                    return;
                }
                try {
                    const room = ctx.rooms.getRoomForDashboard(decodeURIComponent(encoded));
                    json(req, res, 200, { room });
                }
                catch (error) {
                    json(req, res, 404, { error: error instanceof Error ? error.message : String(error) });
                }
                return;
            }
            json(req, res, 404, { error: 'not_found' });
        },
    }), 'agent-team-room: dashboard route');
}
//# sourceMappingURL=dashboard.js.map
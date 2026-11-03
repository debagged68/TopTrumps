/** @type {import('next').NextConfig} */
const base = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
];
// Challenge pages and APIs carry private capabilities: never leak them via Referer,
// caches or search indexes. Later entries override earlier ones for the same header.
const privateHeaders = [
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Cache-Control', value: 'no-store, private' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
];
const nextConfig = {
  poweredByHeader: false,
  experimental: { cpus: 2 },
  async headers() {
    return [
      { source: '/(.*)', headers: base },
      ...['/challenge/:path*', '/challenges', '/challenges/:path*', '/api/challenges/:path*', '/api/challenges', '/api/guests/:path*']
        .map(source => ({ source, headers: privateHeaders })),
    ];
  },
};
export default nextConfig;

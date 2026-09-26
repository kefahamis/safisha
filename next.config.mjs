/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Database drivers load native/WASM assets at runtime; keep them out of the bundle.
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  // Migrations are read from ./drizzle at runtime; ship them with every server function.
  outputFileTracingIncludes: {
    "/**": ["./drizzle/**/*"],
  },
};

export default nextConfig;

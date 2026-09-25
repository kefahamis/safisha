/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Database drivers load native/WASM assets at runtime; keep them out of the bundle.
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
};

export default nextConfig;

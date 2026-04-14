import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['playwright', 'playwright-core'],
  outputFileTracingRoot: path.join(__dirname, '..'),
  webpack: (config, { isServer }) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
    };

    if (isServer) {
      const existingExternals = config.externals || [];
      config.externals = [
        ...existingExternals,
        'playwright',
        'playwright-core',
      ];
    }

    return config;
  },
};

export default nextConfig;

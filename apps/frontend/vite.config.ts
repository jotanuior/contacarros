import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const appBasePath = env.VITE_APP_BASE_PATH || '/';

  return {
    base: appBasePath === '/' ? '/' : `/${appBasePath.replace(/^\/+|\/+$/g, '')}/`,
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) {
              return undefined;
            }

            if (id.includes('recharts')) {
              return 'charts';
            }

            if (id.includes('@tanstack/react-query') || id.includes('axios')) {
              return 'data';
            }

            if (id.includes('react-router-dom')) {
              return 'router';
            }

            if (id.includes('react') || id.includes('scheduler')) {
              return 'react-vendor';
            }

            return 'vendor';
          },
        },
      },
    },
    server: {
      port: 5173,
    },
    preview: {
      port: 4173,
      host: '0.0.0.0',
    },
  };
});

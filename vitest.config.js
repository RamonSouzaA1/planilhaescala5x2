import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [react()],
        test: {
          name: 'web',
          root: './web',
          environment: 'jsdom',
          globals: true,
          include: ['src/**/*.test.{js,jsx}'],
        },
      },
      {
        test: {
          name: 'shared',
          root: './shared',
          environment: 'node',
          include: ['**/*.test.js'],
        },
      },
      {
        test: {
          name: 'api',
          root: './api',
          environment: 'node',
          include: ['src/**/*.test.js'],
        },
      },
    ],
  },
});

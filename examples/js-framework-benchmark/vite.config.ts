import { gable } from '@gable/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [gable()],
  test: { include: ['src/**/*.test.ts'] },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://trainiq:trainiq@localhost:5432/trainiq_test',
      ML_URL: 'http://ml.test',
    },
  },
});

import { describe, expect, it } from 'vitest';
import config from '../vite.config';

// GitHub Pages の配置先（/family-game/mori/）とずれると画面が真っ白になるので確認しておく
describe('vite.config', () => {
  it('base が公開先のパスになっている', () => {
    expect(config).toMatchObject({ base: '/family-game/mori/' });
  });
});

import request from 'supertest';
import { createApp } from '../src/app';

describe('GET /api/health', () => {
  it('returns 200 with status up', async () => {
    const app = createApp();
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('up');
  });
});

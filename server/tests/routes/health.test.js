const request = require('supertest');
const app = require('../../src/app');


describe('GET /api/health', () => {
  it('risponde 200 con status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
jest.mock('../../src/mqtt/client', () => ({ publish: jest.fn().mockResolvedValue() }));

const { publish } = require('../../src/mqtt/client');
const { TOPICS } = require('../../src/config/mqtt');
const { buildPayload, publishClock } = require('../../src/screens/clockScreen');

describe('clockScreen', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('formatta l\'ora come HH:mm con zero iniziale', () => {
    jest.useFakeTimers({ now: new Date(2026, 8, 19, 9, 5, 30) });

    expect(buildPayload()).toEqual({ time: '11:05' });
  });

  it('gestisce mezzanotte e le 23:59', () => {
    jest.useFakeTimers({ now: new Date(2026, 8, 19, 0, 0, 0) });
    expect(buildPayload()).toEqual({ time: '02:00' });

    jest.setSystemTime(new Date(2026, 8, 19, 23, 59, 59));
    expect(buildPayload()).toEqual({ time: '01:59' });
  });

  it('pubblica su data/clock con QoS 0 e senza retain', async () => {
    jest.useFakeTimers({ now: new Date(2026, 8, 19, 14, 35) });

    await publishClock();

    expect(publish).toHaveBeenCalledWith(TOPICS.dataClock, { time: '16:35' }, { qos: 0 });
    expect(TOPICS.dataClock).toBe('display/cyd-01/data/clock');
  });
});
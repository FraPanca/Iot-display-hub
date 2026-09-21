jest.mock('../../src/mqtt/client', () => ({ publish: jest.fn().mockResolvedValue() }));
jest.mock('../../src/integrations/weatherClient');

const { publish } = require('../../src/mqtt/client');
const { fetchWeather } = require('../../src/integrations/weatherClient');
const { TOPICS } = require('../../src/config/mqtt');
const { publishWeather, handleDaySelect } = require('../../src/screens/weatherScreen');
const { silenceConsole } = require('../helpers/silenceConsole');

silenceConsole();

describe('weatherScreen', () => {
  it('pubblica su data/weather con QoS 1 il payload ottenuto dal client', async () => {
    const payload = { current: { condition: 'clear' }, forecast: [] };
    fetchWeather.mockResolvedValue(payload);

    await publishWeather();

    expect(publish).toHaveBeenCalledWith(TOPICS.dataWeather, payload, { qos: 1 });
  });

  it('non pubblica se il recupero dei dati fallisce', async () => {
    fetchWeather.mockRejectedValue(new Error('Open-Meteo giu'));

    await expect(publishWeather()).rejects.toThrow('Open-Meteo giu');
    expect(publish).not.toHaveBeenCalled();
  });

  it('handleDaySelect si limita a loggare l\'evento', () => {
    expect(() => handleDaySelect({ day_index: 2 })).not.toThrow();
    expect(console.log).toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });
});

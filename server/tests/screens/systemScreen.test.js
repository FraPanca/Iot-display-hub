jest.mock('../../src/system/shutdownService', () => ({ requestShutdown: jest.fn().mockResolvedValue() }));

const { requestShutdown } = require('../../src/system/shutdownService');
const { handleShutdownEvent, handleOtaResult } = require('../../src/screens/systemScreen');
const { silenceConsole } = require('../helpers/silenceConsole');

silenceConsole();

describe('systemScreen', () => {
  it('delega l\'evento di shutdown al servizio', async () => {
    await handleShutdownEvent({ target: 'pi' });

    expect(requestShutdown).toHaveBeenCalledWith({ target: 'pi' });
  });

  it('propaga l\'errore del servizio di shutdown', async () => {
    requestShutdown.mockRejectedValueOnce(new Error('publish fallita'));

    await expect(handleShutdownEvent({ target: 'pi' })).rejects.toThrow('publish fallita');
  });

  it('handleOtaResult logga l\'esito senza altre azioni', () => {
    handleOtaResult({ status: 'success', version: 'v1.4.0' });

    expect(console.log).toHaveBeenCalledWith(expect.any(String), { status: 'success', version: 'v1.4.0' });
  });
});

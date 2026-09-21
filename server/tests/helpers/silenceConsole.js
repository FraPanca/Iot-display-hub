// Silenzia log ed errori durante i test, i mock restano ispezionabili via console.error
function silenceConsole() {
  let spies = [];

  beforeEach(() => {
    spies = ['log', 'error', 'warn'].map((method) => jest.spyOn(console, method).mockImplementation(() => {}));
  });

  afterEach(() => {
    spies.forEach((spy) => spy.mockRestore());
  });
}

module.exports = { silenceConsole };

const Store = require('./store');

const userDataStore = new Store({
  configName: 'user-data',
  defaults: {
    sessionToken: '',
    iksmCookie: '',
  }
});
module.exports.userDataStore = userDataStore;

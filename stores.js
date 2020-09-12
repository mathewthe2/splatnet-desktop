const Store = require('electron-store');

const userDataStore = new Store({
  sessionToken: '',
  iksmCookie: '',
});
module.exports.userDataStore = userDataStore;

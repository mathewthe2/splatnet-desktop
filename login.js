const {BrowserWindow, protocol} = require('electron')
const { userDataStore } = require('./stores');
const nso = require('./nso');

const crypto = require('crypto');
const base64url = require('base64url');

const splatnetUrl = `https://app.splatoon2.nintendo.net`;

let authParams = {};
let sessionToken = '';

let mainWindow;
function setMainWindow(win) {
  mainWindow = win;
}

function generateRandom(length) {
  return base64url(crypto.randomBytes(length));
}

function calculateChallenge(codeVerifier) {
  const hash = crypto.createHash('sha256');
  hash.update(codeVerifier);
  const codeChallenge = base64url(hash.digest());
  return codeChallenge;
}

function generateAuthenticationParams() {
  const state = generateRandom(36);
  const codeVerifier = generateRandom(32);
  const codeChallenge = calculateChallenge(codeVerifier);

  return {
    state,
    codeVerifier,
    codeChallenge
  };
}

function openNSOLogin () {
  authParams = generateAuthenticationParams();
  const params = {
    state: authParams.state,
    redirect_uri: 'npf71b963c1b7b6d119://auth&client_id=71b963c1b7b6d119',
    scope: 'openid%20user%20user.birthday%20user.mii%20user.screenName',
    response_type: 'session_token_code',
    session_token_code_challenge: authParams.codeChallenge,
    session_token_code_challenge_method: 'S256',
    theme: 'login_form'
  };
  const arrayParams = [];
  for (var key in params) {
    if (!params.hasOwnProperty(key)) continue;
    arrayParams.push(`${key}=${params[key]}`);
  }
  const stringParams = arrayParams.join('&');
  console.log(`https://accounts.nintendo.com/connect/1.0.0/authorize?${stringParams}`);
  mainWindow.loadURL(`https://accounts.nintendo.com/connect/1.0.0/authorize?${stringParams}`)
}

function openSplatNet () {
  mainWindow.loadFile('./views/loading.html')
  iksm = userDataStore.get('iksmCookie')
  if (iksm) {
    nso.checkIksmValid(iksm, mainWindow.webContents.session)
    .then(isValid=>{
        if (isValid) {
            mainWindow.loadURL(`${splatnetUrl}/home`)
        } else {
        const session_token = userDataStore.get('sessionToken');
        if (session_token) {
            nso.refresh_iksm(session_token)
            .then(iksm =>{
            nso
            .setIksmToken(iksm, mainWindow.webContents.session)
            .then(()=> mainWindow.loadURL(`${splatnetUrl}/home`))
            })
            .catch(err => {
            console.log('Error refreshing iksm with session token:', err)
            openNSOLogin();
            }) 
        } else {
            // No cookies or tokens
            openNSOLogin();
        }
        }
    })
  }
}


protocol.registerSchemesAsPrivileged([
  { scheme: 'npf71b963c1b7b6d119', privileges: { standard: true, secure: true } },
  { scheme: 'https', privileges: { standard: true, secure: true } },
  { scheme: 'http', privileges: { standard: true, secure: true } }
])

function registerSplatnetHandler () {
  protocol.registerHttpProtocol(
    'npf71b963c1b7b6d119',
    (request, callback) => {
      mainWindow.loadFile('./views/logging-in.html')
      const url = request.url;
      const params = {};
      url
        .split('#')[1]
        .split('&')
        .forEach(str => {
          const splitStr = str.split('=');
          params[splitStr[0]] = splitStr[1];
        });
        nso
        .getSplatnetSession(params.session_token_code, authParams.codeVerifier)
        .then(async tokens => {
          try {
            sessionToken = tokens.sessionToken;
            userDataStore.set('sessionToken', sessionToken);
            await nso.getSessionCookie(tokens.accessToken);
            const iksm = nso.getIksmToken();
            userDataStore.set('iksmCookie', iksm);
            openSplatNet();
          } catch (e) {
            console.log('error', e)
          }
        })
        .catch(e=>console.log(e));
    }
  );
}

exports.setMainWindow = setMainWindow;
exports.openNSOLogin = openNSOLogin;
exports.registerSplatnetHandler = registerSplatnetHandler;
exports.openSplatNet = openSplatNet;
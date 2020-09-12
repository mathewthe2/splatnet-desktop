const { userDataStore } = require('./stores');
const request2 = require('request-promise-native');

const { v4: uuidv4 } = require('uuid');
const { app } = require('electron');
const Memo = require('promise-memoize');

const userAgentVersion = `1.8.0`;
const userAgentString = `com.nintendo.znca/${userAgentVersion} (Android/7.1.2)`;
const appVersion = app.getVersion();
const splatnetDesktopUserAgentString = `splatnetDesktop/${appVersion}`;
const splatnetUrl = `https://app.splatoon2.nintendo.net`;

let userLanguage = 'en-US';
let uniqueId = '';

const jar = request2.jar();
let request;
if (process.env.PROXY) {
  const proxy = 'http://localhost:8888';
  request = request2.defaults({
    proxy: proxy,
    rejectUnauthorized: false,
    jar: jar
  });
  log.info(`Splatnet proxy on ${proxy}`);
} else {
  request = request2.defaults({ jar: jar });
}

async function getSplatnetApi(url) {
  const resp = await request({
    method: 'GET',
    uri: `${splatnetUrl}/api/${url}`,
    headers: {
      Accept: '*/*',
      'Accept-Encoding': 'gzip, deflate',
      'Accept-Language': userLanguage,
      'User-Agent': userAgentString,
      Connection: 'keep-alive'
    },
    json: true,
    gzip: true
  });

  return resp;
}

async function getUniqueId(token) {
  const records = await getSplatnetApi('records');
  uniqueId = records.records.unique_id;
  return uniqueId;
}
const getUniqueIdMemo10 = Memo(getUniqueId, { maxAge: 10000 });

async function getSessionToken(session_token_code, codeVerifier) {
  const resp = await request({
    method: 'POST',
    uri: 'https://accounts.nintendo.com/connect/1.0.0/api/session_token',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Platform': 'Android',
      'X-ProductVersion': userAgentVersion,
      'User-Agent': `OnlineLounge/${userAgentVersion} NASDKAPI Android`
    },
    form: {
      client_id: '71b963c1b7b6d119',
      session_token_code: session_token_code,
      session_token_code_verifier: codeVerifier
    },
    json: true
  });

  return resp.session_token;
}

async function getApiToken(session_token) {
  const resp = await request({
    method: 'POST',
    uri: 'https://accounts.nintendo.com/connect/1.0.0/api/token',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Platform': 'Android',
      'X-ProductVersion': userAgentVersion,
      'User-Agent': userAgentString
    },
    json: {
      client_id: '71b963c1b7b6d119',
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer-session-token',
      session_token: session_token
    }
  }); 

  return {
    id: resp.id_token,
    access: resp.access_token
  };
}

async function getHash(idToken, timestamp) {
  const response = await request({
    method: 'POST',
    uri: 'https://elifessler.com/s2s/api/gen2',
    headers: {
      'User-Agent': splatnetDesktopUserAgentString
    },
    form: {
      naIdToken: idToken,
      timestamp: timestamp
    }
  });

  const responseObject = JSON.parse(response);
  return responseObject.hash;
}

async function callFlapg(idToken, guid, timestamp, login) {
  const hash = await getHash(idToken, timestamp)
  const response = await request({
    method: 'GET',
    uri: 'https://flapg.com/ika2/api/login?public',
    headers: {
      'x-token': idToken,
      'x-time': timestamp,
      'x-guid': guid,
      'x-hash': hash,
      'x-ver': '3',
      'x-iid': login
    }
  });
  const responseObject = JSON.parse(response);

  return responseObject.result;
}

async function refresh_iksm(session_token) {
  const splatnetToken = await getSessionWithSessionToken(session_token);
  await getSessionCookie(splatnetToken.accessToken);
  const iksm = getIksmToken();
  userDataStore.set('iksmCookie', iksm);
  return iksm
}

async function getUserInfo(token) {
  const response = await request({
    method: 'GET',
    uri: 'https://api.accounts.nintendo.com/2.0.0/users/me',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Platform': 'Android',
      'X-ProductVersion': userAgentVersion,
      'User-Agent': userAgentString,
      Authorization: `Bearer ${token}`
    },
    json: true
  });

  return {
    nickname: response.nickname,
    language: response.language,
    birthday: response.birthday,
    country: response.country
  };
}

async function getApiLogin(userinfo, flapg_nso) {
  const resp = await request({
    method: 'POST',
    uri: 'https://api-lp1.znc.srv.nintendo.net/v1/Account/Login',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Platform': 'Android',
      'X-ProductVersion': userAgentVersion,
      'User-Agent': userAgentString,
      Authorization: 'Bearer'
    },
    body: {
      parameter: {
        language: userinfo.language,
        naCountry: userinfo.country,
        naBirthday: userinfo.birthday,
        f: flapg_nso.f,
        naIdToken: flapg_nso.p1,
        timestamp: flapg_nso.p2,
        requestId: flapg_nso.p3
      }
    },
    json: true,
    gzip: true
  });
  return resp.result.webApiServerCredential.accessToken;
}

async function getWebServiceToken(token, flapg_app) {
  const resp = await request({
    method: 'POST',
    uri: 'https://api-lp1.znc.srv.nintendo.net/v2/Game/GetWebServiceToken',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Platform': 'Android',
      'X-ProductVersion': userAgentVersion,
      'User-Agent': userAgentString,
      Authorization: `Bearer ${token}`
    },
    json: {
      parameter: {
        id: 5741031244955648, // SplatNet 2 ID
        f: flapg_app.f,
        registrationToken: flapg_app.p1,
        timestamp: flapg_app.p2,
        requestId: flapg_app.p3
      }
    }
  });

  return {
    accessToken: resp.result.accessToken,
    expiresAt: Math.round(new Date().getTime()) + resp.result.expiresIn
  };
}

async function getSessionCookie(token) {
  const resp = await request({
    method: 'GET',
    uri: splatnetUrl,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Platform': 'Android',
      'X-ProductVersion': userAgentVersion,
      'User-Agent': userAgentString,
      'x-gamewebtoken': token,
      'x-isappanalyticsoptedin': false,
      'X-Requested-With': 'com.nintendo.znca',
      Connection: 'keep-alive'
    }
  });

  const iksmToken = getIksmToken();
  await getUniqueIdMemo10(iksmToken);
}

async function getSessionWithSessionToken(sessionToken) {
  const apiTokens = await getApiToken(sessionToken);
  const userInfo = await getUserInfo(apiTokens.access);
  const guid = uuidv4();
  const timestamp = String(Math.floor(Date.now() / 1000));
  const flapg_nso = await callFlapg(apiTokens.id, guid, timestamp, "nso");
  const apiAccessToken = await getApiLogin(userInfo, flapg_nso);
  const flapg_app = await callFlapg(apiAccessToken, guid, timestamp, "app");
  const splatnetToken = await getWebServiceToken(apiAccessToken, flapg_app);
  await getSessionCookie(splatnetToken.accessToken);
  return splatnetToken;
}

async function getSplatnetSession(sessionTokenCode, sessionVerifier) {
  const sessionToken = await getSessionToken(sessionTokenCode, sessionVerifier);
  const splatnetToken = await getSessionWithSessionToken(sessionToken);

  return {
    sessionToken: sessionToken,
    accessToken: splatnetToken.accessToken
  };
}

async function setIksmToken(cookieValue, ses) {
  ses.clearStorageData([], (data) => {})
  const cookie = { url: splatnetUrl, name: 'iksm_session', value: cookieValue }
  await ses.cookies.set(cookie);
  return cookie;
}

function getIksmToken() {
  const cookies = jar.getCookies(splatnetUrl);
  let value;
  cookies.find(cookie => {
    if (cookie.key === 'iksm_session') {
      value = cookie.value;
    }
    return cookie.key === 'iksm_session';
  });
  if (value == null) {
    throw new Error('Could not get iksm_session cookie');
  }

  return value;
}

async function checkIksmValid(iksm, ses) {
  try {
    await setIksmToken(iksm, ses)
    await getSplatnetApi('schedule');
    return true;
  } catch (e) {
    return false;
  }
}

exports.getSplatnetSession = getSplatnetSession;
exports.setIksmToken = setIksmToken;
exports.getIksmToken = getIksmToken;
exports.getSessionCookie = getSessionCookie;
exports.refresh_iksm = refresh_iksm;
exports.checkIksmValid = checkIksmValid;
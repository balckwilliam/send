/* global LIMITS AUTH_CONFIG */
import assets from '../common/assets';
import { getFileList, setFileList } from './api';
import { encryptStream, decryptStream } from './ece';
import { arrayToB64, b64ToArray, streamToArrayBuffer } from './utils';
import { blobStream } from './streams';
import { getFileListKey, prepareScopedBundleKey, preparePkce } from './fxa';
import storage from './storage';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export default class User {
  constructor(storage) {
    this.storage = storage;
    this.data = storage.user || {};
  }

  get info() {
    return this.data || this.storage.user || {};
  }

  set info(data) {
    this.data = data;
    this.storage.user = data;
  }

  get firstAction() {
    return this.storage.get('firstAction');
  }

  set firstAction(action) {
    this.storage.set('firstAction', action);
  }

  get id() {
    return this.info.uid; //TODO
  }

  get avatar() {
    const defaultAvatar = assets.get('user.svg');
    if (this.info.avatarDefault) {
      return assets.get('firefox_logo-only.svg');
    }
    return this.info.avatar || defaultAvatar;
  }

  get name() {
    return this.info.displayName;
  }

  get email() {
    return this.info.email;
  }

  get loggedIn() {
    return !!this.info.access_token;
  }

  get bearerToken() {
    return this.info.access_token;
  }

  get maxSize() {
    return this.loggedIn ? LIMITS.MAX_FILE_SIZE : LIMITS.ANON.MAX_FILE_SIZE;
  }

  get maxExpireSeconds() {
    return this.loggedIn
      ? LIMITS.MAX_EXPIRE_SECONDS
      : LIMITS.ANON.MAX_EXPIRE_SECONDS;
  }

  get maxDownloads() {
    return this.loggedIn ? LIMITS.MAX_DOWNLOADS : LIMITS.ANON.MAX_DOWNLOADS;
  }

  async login(email) {
    const state = arrayToB64(crypto.getRandomValues(new Uint8Array(16)));
    storage.set('oauthState', state);
    const keys_jwk = await prepareScopedBundleKey(this.storage);
    const code_challenge = await preparePkce(this.storage);
    const options = {
      client_id: AUTH_CONFIG.client_id,
      code_challenge,
      code_challenge_method: 'S256',
      response_type: 'code',
      scope: `profile ${AUTH_CONFIG.key_scope}`,
      state,
      keys_jwk
    };
    if (email) {
      options.email = email;
    }
    const params = new URLSearchParams(options);
    location.assign(
      `${AUTH_CONFIG.authorization_endpoint}?${params.toString()}`
    );
  }

  async finishLogin(code, state) {
    const localState = storage.get('oauthState');
    storage.remove('oauthState');
    if (state !== localState) {
      throw new Error('state mismatch');
    }
    const tokenResponse = await fetch(AUTH_CONFIG.token_endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code,
        client_id: AUTH_CONFIG.client_id,
        code_verifier: this.storage.get('pkceVerifier')
      })
    });
    const auth = await tokenResponse.json();
    const infoResponse = await fetch(AUTH_CONFIG.userinfo_endpoint, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${auth.access_token}`
      }
    });
    const userInfo = await infoResponse.json();
    userInfo.access_token = auth.access_token;
    userInfo.fileListKey = await getFileListKey(this.storage, auth.keys_jwe);
    this.info = userInfo;
    this.storage.remove('pkceVerifier');
  }

  logout() {
    this.storage.clearLocalFiles();
    this.info = {};
  }

  async syncFileList() {
    let changes = { incoming: false, outgoing: false, downloadCount: false };
    if (!this.loggedIn) {
      return this.storage.merge();
    }
    let list = [];
    try {
      const encrypted = await getFileList(this.bearerToken);
      const decrypted = await streamToArrayBuffer(
        decryptStream(blobStream(encrypted), b64ToArray(this.info.fileListKey))
      );
      list = JSON.parse(textDecoder.decode(decrypted));
    } catch (e) {
      if (e.message === '401') {
        this.logout();
        return { incoming: true };
      }
    }
    changes = await this.storage.merge(list);
    if (!changes.outgoing) {
      return changes;
    }
    try {
      const blob = new Blob([
        textEncoder.encode(JSON.stringify(this.storage.files))
      ]);
      const encrypted = await streamToArrayBuffer(
        encryptStream(blobStream(blob), b64ToArray(this.info.fileListKey))
      );
      await setFileList(this.bearerToken, encrypted);
    } catch (e) {
      //
    }
    return changes;
  }

  toJSON() {
    return this.info;
  }
}

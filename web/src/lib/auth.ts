import { startAuthentication, startRegistration, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { api, type User } from './api';

export const passkeysSupported = () => browserSupportsWebAuthn();

export async function registerWithPasskey(name: string): Promise<User> {
  const options = await api.post<Parameters<typeof startRegistration>[0]['optionsJSON']>('/api/auth/register/options', { name });
  const attResp = await startRegistration({ optionsJSON: options });
  return api.post<User>('/api/auth/register/verify', attResp);
}

export async function loginWithPasskey(): Promise<User> {
  const options = await api.post<Parameters<typeof startAuthentication>[0]['optionsJSON']>('/api/auth/login/options');
  const asseResp = await startAuthentication({ optionsJSON: options });
  return api.post<User>('/api/auth/login/verify', asseResp);
}

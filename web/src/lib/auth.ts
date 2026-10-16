import { startAuthentication, startRegistration, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { api, type User } from './api';

export const passkeysSupported = () => browserSupportsWebAuthn();

export type Enrolled = User & { recoveryCode?: string };
export type Device = { id: string; label: string | null; created_at: string | null; last_used_at: string | null };

export async function registerWithPasskey(name: string): Promise<Enrolled> {
  const options = await api.post<Parameters<typeof startRegistration>[0]['optionsJSON']>('/api/auth/register/options', { name });
  const attResp = await startRegistration({ optionsJSON: options });
  return api.post<Enrolled>('/api/auth/register/verify', attResp);
}

export async function loginWithPasskey(): Promise<User> {
  const options = await api.post<Parameters<typeof startAuthentication>[0]['optionsJSON']>('/api/auth/login/options');
  const asseResp = await startAuthentication({ optionsJSON: options });
  return api.post<User>('/api/auth/login/verify', asseResp);
}

/** Adds a passkey on this device to an existing account, using an invite link code or a recovery code. */
export async function enrollWithToken(token: string): Promise<Enrolled> {
  const options = await api.post<Parameters<typeof startRegistration>[0]['optionsJSON']>('/api/auth/enroll/options', { token });
  const attResp = await startRegistration({ optionsJSON: options });
  return api.post<Enrolled>('/api/auth/enroll/verify', attResp);
}

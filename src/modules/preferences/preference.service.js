import { getPreferencesForUser, setPreference } from './preference.repository.js';

export async function listPreferences(userId) {
  return getPreferencesForUser(userId);
}

export async function updatePreference(userId, notificationType, { inAppEnabled, emailEnabled }) {
  return setPreference(userId, notificationType, { inAppEnabled, emailEnabled });
}
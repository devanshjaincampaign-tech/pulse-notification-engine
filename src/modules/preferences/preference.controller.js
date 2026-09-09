import { listPreferences, updatePreference } from './preference.service.js';

export async function listPreferencesController(req, res, next) {
  try {
    const preferences = await listPreferences(req.user.userId);
    res.status(200).json(preferences);
  } catch (err) {
    next(err);
  }
}

export async function updatePreferenceController(req, res, next) {
  try {
    const notificationType = req.params.type;
    const { inAppEnabled, emailEnabled } = req.body;

    const result = await updatePreference(req.user.userId, notificationType, {
      inAppEnabled,
      emailEnabled,
    });

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
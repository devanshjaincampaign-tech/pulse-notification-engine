import { listPreferences, updatePreference } from './preference.service.js';

export async function listPreferencesController(req, res) {
  try {
    const preferences = await listPreferences(req.user.userId);
    res.status(200).json(preferences);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function updatePreferenceController(req, res) {
  try {
    const notificationType = req.params.type;
    const { inAppEnabled, emailEnabled } = req.body;

    const result = await updatePreference(req.user.userId, notificationType, {
      inAppEnabled,
      emailEnabled,
    });

    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}
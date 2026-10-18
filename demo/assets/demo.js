const EVENT_TYPES = ['POST_LIKED', 'USER_FOLLOWED', 'COMMENT_CREATED', 'MESSAGE_RECEIVED',
  'ORDER_STATUS_CHANGED', 'PAYMENT_COMPLETED', 'SECURITY_ALERT'];
const state = {
  actor: null,
  recipient: null,
  socket: null,
  cursor: null,
  hasMore: false,
  authMode: { actor: 'register', recipient: 'register' },
  preferences: new Map(),
};

const byId = (id) => document.getElementById(id);
const eventIcons = {
  POST_LIKED: '♥',
  USER_FOLLOWED: '＋',
  COMMENT_CREATED: '☷',
  MESSAGE_RECEIVED: '✉',
  ORDER_STATUS_CHANGED: '↗',
  PAYMENT_COMPLETED: '$',
  SECURITY_ALERT: '⌑',
};

function apiOrigin(instance = 'same') {
  if (instance === 'same') return window.location.origin;
  const url = new URL(window.location.origin);
  url.port = url.port === '3001' ? '3000' : '3001';
  return url.origin;
}

async function request(origin, route, {
  token,
  method = 'GET',
  body,
  allowFailure = false,
} = {}) {
  const headers = { accept: 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  let response;
  try {
    response = await fetch(`${origin}${route}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error(`Could not reach ${origin}. Check that both local API instances are running.`);
  }

  const responseText = await response.text();
  let result = null;
  if (responseText) {
    try {
      result = JSON.parse(responseText);
    } catch {
      result = responseText;
    }
  }
  if (!response.ok && !allowFailure) {
    const message = result && typeof result === 'object' && result.error
      ? result.error
      : `${response.status} ${response.statusText}`;
    throw new Error(message);
  }
  return result;
}

function showToast(message, isError = false) {
  const toast = document.createElement('div');
  toast.className = `toast${isError ? ' error' : ''}`;
  toast.textContent = message;
  byId('toast-region').append(toast);
  window.setTimeout(() => toast.remove(), 4200);
}

function logSocket(message, kind = '') {
  const log = byId('socket-log');
  const line = document.createElement('div');
  line.className = `console-line${kind ? ` ${kind}-line` : ''}`;
  const time = document.createElement('span');
  time.className = 'console-time';
  time.textContent = new Date().toLocaleTimeString([], { hour12: false });
  const text = document.createElement('span');
  text.textContent = message;
  line.append(time, text);
  log.append(line);
  while (log.children.length > 40) log.firstElementChild.remove();
  log.scrollTop = log.scrollHeight;
}

function updateHealthBadge(id, healthy, label = healthy ? 'Online' : 'Offline') {
  const badge = byId(id);
  badge.className = `status-badge ${healthy ? 'healthy' : 'unhealthy'}`;
  badge.textContent = label;
}

async function checkHealth() {
  const origin = apiOrigin();
  byId('api-origin-label').textContent = new URL(origin).host;
  try {
    const [health, readiness] = await Promise.all([
      request(origin, '/health'),
      request(origin, '/ready', { allowFailure: true }),
    ]);
    updateHealthBadge('api-health', health?.status === 'ok');
    updateHealthBadge('database-health', readiness?.checks?.database === true);
    const redisReady = readiness?.checks?.redisPublisher === true &&
      readiness?.checks?.redisSubscriber === true;
    updateHealthBadge('redis-health', redisReady);
    const allReady = readiness?.status === 'ready';
    byId('health-caption').textContent = allReady
      ? 'All local dependencies are ready'
      : 'API is reachable; one or more dependencies are not ready';
  } catch (error) {
    updateHealthBadge('api-health', false, 'Unavailable');
    updateHealthBadge('database-health', false, 'Unknown');
    updateHealthBadge('redis-health', false, 'Unknown');
    byId('health-caption').textContent = error.message;
  }
}

function setAuthMode(role, mode) {
  state.authMode[role] = mode;
  document.querySelectorAll(`.mode-button[data-role="${role}"]`).forEach((button) => {
    const selected = button.dataset.mode === mode;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  byId(`${role}-username-label`).classList.toggle('hidden', mode === 'login');
  byId(`${role}-username`).classList.toggle('hidden', mode === 'login');
  byId(`${role}-auth-submit`).firstChild.textContent = mode === 'register'
    ? `Create ${role} account `
    : `Sign in as ${role} `;
  byId(`${role}-password`).autocomplete = mode === 'register' ? 'new-password' : 'current-password';
}

function roleUserName(role) {
  const user = state[role]?.user;
  return user?.username || user?.email || `User ${user?.id ?? ''}`;
}

function renderRole(role) {
  const signedIn = Boolean(state[role]);
  byId(`${role}-auth-form`).classList.toggle('hidden', signedIn);
  byId(`${role}-authenticated`).classList.toggle('hidden', !signedIn);
  byId(`${role}-state-dot`).classList.toggle('signed-in', signedIn);
  byId(`${role}-user-label`).textContent = signedIn ? roleUserName(role) : '';
  byId(`${role}-id-label`).textContent = signedIn ? `USER ID  ${state[role].user.id}` : '';
  if (role === 'recipient') {
    byId('event-recipient-label').textContent = signedIn
      ? `${roleUserName(role)} · #${state.recipient.user.id}`
      : 'Sign in a recipient first';
    byId('socket-toggle').disabled = !signedIn;
    byId('send-event').disabled = !signedIn || !state.actor;
    byId('mark-all-read').disabled = !signedIn;
    if (!signedIn) {
      byId('unread-count').textContent = '0';
      byId('feed-caption').textContent = 'Sign in to load the notification feed.';
      byId('notification-list').replaceChildren(createEmptyFeed());
      byId('preferences-content').replaceChildren(createEmptyPreferences());
    }
  } else {
    byId('send-event').disabled = !signedIn || !state.recipient;
  }
}

function createEmptyFeed() {
  const empty = document.createElement('div');
  empty.className = 'empty-feed';
  const illustration = document.createElement('div');
  illustration.className = 'empty-illustration';
  const orbitOne = document.createElement('span');
  orbitOne.className = 'empty-orbit orbit-one';
  const orbitTwo = document.createElement('span');
  orbitTwo.className = 'empty-orbit orbit-two';
  const bell = document.createElement('span');
  bell.className = 'empty-bell';
  bell.textContent = '♧';
  illustration.append(orbitOne, orbitTwo, bell);
  const title = document.createElement('strong');
  title.textContent = 'Your inbox is waiting';
  const description = document.createElement('p');
  description.textContent = 'Authenticate a recipient, then send an event to watch the pipeline work.';
  empty.append(illustration, title, description);
  return empty;
}

function createEmptyPreferences() {
  const empty = document.createElement('div');
  empty.className = 'empty-inline';
  const symbol = document.createElement('span');
  symbol.className = 'empty-symbol';
  symbol.textContent = '◌';
  const label = document.createElement('span');
  label.textContent = 'Sign in as the recipient to load preferences.';
  empty.append(symbol, label);
  return empty;
}

async function authenticate(role) {
  const mode = state.authMode[role];
  const submit = byId(`${role}-auth-submit`);
  const username = byId(`${role}-username`).value.trim();
  const email = byId(`${role}-email`).value.trim();
  const password = byId(`${role}-password`).value;
  if (!email || !password || (mode === 'register' && username.length < 3)) {
    showToast(mode === 'register'
      ? 'Enter a username (at least 3 characters), email, and password (at least 8 characters).'
      : 'Enter your email and password.', true);
    return;
  }

  submit.disabled = true;
  try {
    const body = mode === 'register'
      ? { username, email, password }
      : { email, password, deviceName: `Pulse demo ${role}` };
    const result = await request(apiOrigin(), `/api/auth/${mode}`, { method: 'POST', body });
    state[role] = {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
    };
    byId(`${role}-password`).value = '';
    renderRole(role);
    showToast(`${role === 'recipient' ? 'Recipient' : 'Actor'} authenticated. Access token is held in memory.`);
    logSocket(`${roleUserName(role)} authenticated · session established`, 'success');
    if (role === 'recipient') {
      await Promise.all([loadNotifications(), loadUnreadCount(), loadPreferences()]);
      connectSocket();
    }
  } catch (error) {
    showToast(error.message, true);
  } finally {
    submit.disabled = false;
  }
}

function disconnectSocket(message = 'Socket disconnected') {
  if (state.socket) {
    state.socket.removeAllListeners();
    state.socket.disconnect();
    state.socket = null;
    logSocket(message, 'muted');
  }
  byId('socket-indicator').className = 'socket-indicator disconnected';
  byId('socket-state').textContent = 'OFFLINE';
  byId('socket-toggle').textContent = 'Connect socket';
}

function connectSocket() {
  if (!state.recipient) {
    showToast('Authenticate the recipient before connecting a socket.', true);
    return;
  }
  if (typeof window.io !== 'function') {
    showToast('Socket.IO client did not load. Check the local app server and refresh the page.', true);
    return;
  }
  disconnectSocket('Opening authenticated socket…');
  const origin = apiOrigin(byId('socket-instance').value);
  logSocket(`Connecting to ${new URL(origin).host} with recipient session`, 'muted');
  const socket = window.io(origin, {
    auth: { token: state.recipient.accessToken },
    reconnection: false,
    timeout: 5000,
  });
  state.socket = socket;
  socket.on('connect', () => {
    byId('socket-indicator').className = 'socket-indicator connected';
    byId('socket-state').textContent = 'CONNECTED';
    byId('socket-toggle').textContent = 'Disconnect';
    logSocket(`Connected · socket ${socket.id}`, 'success');
  });
  socket.on('connect_error', (error) => {
    byId('socket-indicator').className = 'socket-indicator disconnected';
    byId('socket-state').textContent = 'REJECTED';
    logSocket(`Connection rejected · ${error.message}`, 'error');
    showToast(`Socket connection failed: ${error.message}`, true);
  });
  socket.on('sync', ({ notifications = [] } = {}) => {
    logSocket(`Reconnect sync · ${notifications.length} unread notification(s) from PostgreSQL`, 'success');
    void Promise.all([loadNotifications(), loadUnreadCount()]);
  });
  socket.on('notification', (notification) => {
    const eventType = notification.type || 'notification';
    logSocket(`Live notification · ${eventType} · #${notification.id}`, 'success');
    showToast(`${notification.title || 'New notification'} received live`);
    void Promise.all([loadNotifications(), loadUnreadCount()]);
  });
  socket.on('disconnect', (reason) => {
    if (state.socket !== socket) return;
    byId('socket-indicator').className = 'socket-indicator disconnected';
    byId('socket-state').textContent = 'OFFLINE';
    byId('socket-toggle').textContent = 'Connect socket';
    logSocket(`Disconnected · ${reason}`, 'muted');
  });
}

async function sendEvent() {
  if (!state.actor || !state.recipient) return;
  const type = byId('event-type').value;
  const route = type === 'POST_LIKED' ? '/post-liked' : '/user-followed';
  const body = { targetUserId: state.recipient.user.id };
  if (type === 'POST_LIKED') {
    const postId = byId('post-id').value.trim();
    if (!postId) {
      showToast('Add a post identifier for the like event.', true);
      byId('post-id').focus();
      return;
    }
    body.postId = postId;
  }

  const submit = byId('send-event');
  submit.disabled = true;
  const origin = apiOrigin(byId('target-instance').value);
  try {
    await request(origin, `/api/test-events${route}`, {
      token: state.actor.accessToken,
      method: 'POST',
      body,
    });
    const result = byId('event-result');
    result.classList.remove('hidden', 'error');
    result.textContent = `${type} accepted by ${new URL(origin).host}. The outbox worker will process it; the live socket may receive it shortly.`;
    logSocket(`Event accepted · ${type} · producer ${new URL(origin).host}`, 'success');
    showToast(`${type} accepted and written to the event outbox.`);
  } catch (error) {
    const result = byId('event-result');
    result.classList.remove('hidden');
    result.classList.add('error');
    result.textContent = error.message;
    showToast(error.message, true);
  } finally {
    submit.disabled = !state.actor || !state.recipient;
  }
}

function displayDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function metricTotal(metrics, name) {
  const pattern = new RegExp(`^${name}(?:\\{[^}]*\\})?\\s+([0-9.eE+-]+)$`, 'gm');
  let total = 0;
  for (const match of metrics.matchAll(pattern)) total += Number(match[1]);
  return total;
}

async function loadMetrics() {
  const headers = {};
  const token = byId('metrics-token').value.trim();
  if (token) headers.authorization = `Bearer ${token}`;
  try {
    const response = await fetch(`${apiOrigin()}/metrics`, { headers });
    if (!response.ok) {
      throw new Error(response.status === 401 || response.status === 404
        ? 'Metrics are protected. Add the configured metrics bearer token, if available.'
        : `Metrics endpoint returned ${response.status}.`);
    }
    const metrics = await response.text();
    byId('metric-http-requests').textContent = String(metricTotal(metrics, 'http_requests_total'));
    byId('metric-socket-connections').textContent = String(metricTotal(metrics, 'websocket_connections'));
    byId('metric-publishes').textContent = String(metricTotal(metrics, 'notification_delivery_total'));
    const outboxRows = [...metrics.matchAll(/^outbox_rows\{status="([^"]+)"\}\s+([0-9.eE+-]+)$/gm)];
    const totalRows = outboxRows.reduce((sum, match) => sum + Number(match[2]), 0);
    byId('metric-outbox-rows').textContent = String(totalRows);
    const states = new Map(outboxRows.map((match) => [match[1], Number(match[2])]));
    byId('metric-outbox-breakdown').textContent =
      `${states.get('pending') || 0} pending · ${states.get('processing') || 0} processing · ${states.get('dead_letter') || 0} dead letter`;
  } catch (error) {
    for (const id of ['metric-http-requests', 'metric-socket-connections', 'metric-publishes', 'metric-outbox-rows']) {
      byId(id).textContent = '—';
    }
    byId('metric-outbox-breakdown').textContent = error.message;
  }
}

function renderNotifications(notifications, append = false) {
  const container = byId('notification-list');
  if (!append) container.replaceChildren();
  if (!notifications.length && !append) {
    container.append(createEmptyFeed());
    byId('feed-caption').textContent = 'No notifications yet. Send an event to populate the inbox.';
    return;
  }

  for (const notification of notifications) {
    const item = document.createElement('article');
    item.className = `notification-item${notification.is_read ? '' : ' unread'}`;
    const icon = document.createElement('span');
    icon.className = 'notification-icon';
    icon.textContent = eventIcons[notification.type] || '◉';

    const copy = document.createElement('div');
    copy.className = 'notification-copy';
    const title = document.createElement('h4');
    title.className = 'notification-title';
    title.textContent = notification.title || notification.type || 'Notification';
    if (!notification.is_read) {
      const unread = document.createElement('span');
      unread.className = 'notification-unread-dot';
      unread.setAttribute('aria-label', 'Unread');
      title.append(unread);
    }
    const message = document.createElement('p');
    message.className = 'notification-message';
    message.textContent = notification.message || '';
    const meta = document.createElement('span');
    meta.className = 'notification-meta';
    meta.textContent = `${notification.type || 'EVENT'} · ${displayDate(notification.created_at)}`;
    copy.append(title, message, meta);

    const buttons = document.createElement('div');
    buttons.className = 'notification-buttons';
    if (!notification.is_read) {
      const markRead = document.createElement('button');
      markRead.className = 'notification-action';
      markRead.type = 'button';
      markRead.textContent = 'Read';
      markRead.addEventListener('click', () => void mutateNotification(notification.id, 'read'));
      buttons.append(markRead);
    }
    const remove = document.createElement('button');
    remove.className = 'notification-action';
    remove.type = 'button';
    remove.textContent = 'Delete';
    remove.addEventListener('click', () => void mutateNotification(notification.id, 'delete'));
    buttons.append(remove);
    item.append(icon, copy, buttons);
    container.append(item);
  }
}

async function loadNotifications({ append = false } = {}) {
  if (!state.recipient) return;
  const cursor = append ? state.cursor : null;
  const query = new URLSearchParams({ limit: '10' });
  if (cursor) query.set('cursor', cursor);
  try {
    const result = await request(apiOrigin(), `/api/notifications/cursor?${query}`, {
      token: state.recipient.accessToken,
    });
    renderNotifications(result.notifications || [], append);
    state.cursor = result.nextCursor;
    state.hasMore = result.hasMore === true;
    byId('load-more').hidden = !state.hasMore;
    if (result.notifications?.length) {
      byId('feed-caption').textContent = result.hasMore
        ? 'Showing the latest page. Older activity is available.'
        : `${result.notifications.length} notification(s) in this page.`;
    }
  } catch (error) {
    byId('feed-caption').textContent = error.message;
    showToast(`Could not load the notification feed: ${error.message}`, true);
  }
}

async function loadUnreadCount() {
  if (!state.recipient) return;
  try {
    const result = await request(apiOrigin(), '/api/notifications/unread-count', {
      token: state.recipient.accessToken,
    });
    byId('unread-count').textContent = String(result.count ?? 0);
  } catch (error) {
    showToast(`Could not load unread count: ${error.message}`, true);
  }
}

async function mutateNotification(id, action) {
  if (!state.recipient) return;
  const route = `/api/notifications/${id}${action === 'read' ? '/read' : ''}`;
  try {
    await request(apiOrigin(), route, {
      token: state.recipient.accessToken,
      method: action === 'read' ? 'PATCH' : 'DELETE',
    });
    showToast(action === 'read' ? 'Notification marked as read.' : 'Notification deleted.');
    await Promise.all([loadNotifications(), loadUnreadCount()]);
  } catch (error) {
    showToast(error.message, true);
  }
}

async function markAllRead() {
  if (!state.recipient) return;
  try {
    await request(apiOrigin(), '/api/notifications/read-all', {
      token: state.recipient.accessToken,
      method: 'PATCH',
    });
    showToast('All notifications marked as read.');
    await Promise.all([loadNotifications(), loadUnreadCount()]);
  } catch (error) {
    showToast(error.message, true);
  }
}

async function loadPreferences() {
  if (!state.recipient) return;
  try {
    const preferences = await request(apiOrigin(), '/api/preferences', {
      token: state.recipient.accessToken,
    });
    state.preferences = new Map(preferences.map((preference) => [preference.notification_type, {
      inAppEnabled: preference.in_app_enabled,
      emailEnabled: preference.email_enabled,
    }]));
    renderPreferences();
  } catch (error) {
    showToast(`Could not load preferences: ${error.message}`, true);
  }
}

function renderPreferences() {
  const container = byId('preferences-content');
  container.replaceChildren();
  if (!state.recipient) {
    container.append(createEmptyPreferences());
    return;
  }
  for (const type of EVENT_TYPES) {
    const preference = state.preferences.get(type) || { inAppEnabled: true, emailEnabled: false };
    const row = document.createElement('div');
    row.className = 'preference-row';
    const label = document.createElement('span');
    label.className = 'preference-type';
    label.textContent = type;
    const inApp = makePreferenceControl(type, 'inAppEnabled', 'In-app', preference);
    const email = makePreferenceControl(type, 'emailEnabled', 'Email', preference);
    row.append(label, inApp, email);
    container.append(row);
  }
}

function makePreferenceControl(type, key, labelText, preference) {
  const label = document.createElement('label');
  label.className = 'preference-channel';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = preference[key];
  input.setAttribute('aria-label', `${labelText} notifications for ${type}`);
  input.addEventListener('change', () => void updatePreference(type, key, input.checked));
  const text = document.createElement('span');
  text.textContent = labelText;
  label.append(input, text);
  return label;
}

async function updatePreference(type, key, checked) {
  const previous = state.preferences.get(type) || { inAppEnabled: true, emailEnabled: false };
  if (key === 'emailEnabled' && checked &&
      !window.confirm('Email delivery sends real email when SMTP is configured. Enable this channel?')) {
    renderPreferences();
    return;
  }
  const next = { ...previous, [key]: checked };
  try {
    const result = await request(apiOrigin(), `/api/preferences/${type}`, {
      token: state.recipient.accessToken,
      method: 'PATCH',
      body: next,
    });
    state.preferences.set(type, {
      inAppEnabled: result.in_app_enabled,
      emailEnabled: result.email_enabled,
    });
    renderPreferences();
    showToast(`${type} preferences saved.`);
  } catch (error) {
    renderPreferences();
    showToast(`Could not save preference: ${error.message}`, true);
  }
}

async function loadSessions(role) {
  if (!state[role]) return;
  const list = byId(`${role}-session-list`);
  try {
    const result = await request(apiOrigin(), '/api/auth/sessions', { token: state[role].accessToken });
    list.replaceChildren();
    if (!result.sessions.length) {
      const empty = document.createElement('div');
      empty.className = 'session-item';
      empty.textContent = 'No active sessions.';
      list.append(empty);
    }
    for (const session of result.sessions) {
      const row = document.createElement('div');
      row.className = 'session-item';
      const name = document.createElement('span');
      name.textContent = `${session.device_name || 'Device'}${session.current ? ' · current' : ''}`;
      const revoke = document.createElement('button');
      revoke.type = 'button';
      revoke.textContent = 'Revoke';
      revoke.disabled = session.current;
      revoke.addEventListener('click', () => void revokeSession(role, session.id));
      row.append(name, revoke);
      list.append(row);
    }
    list.classList.remove('hidden');
  } catch (error) {
    showToast(`Could not load sessions: ${error.message}`, true);
  }
}

async function revokeSession(role, sessionId) {
  try {
    await request(apiOrigin(), `/api/auth/sessions/${encodeURIComponent(sessionId)}`, {
      token: state[role].accessToken,
      method: 'DELETE',
    });
    showToast('Session revoked.');
    await loadSessions(role);
  } catch (error) {
    showToast(`Could not revoke session: ${error.message}`, true);
  }
}

async function rotateToken(role) {
  if (!state[role]) return;
  try {
    const result = await request(apiOrigin(), '/api/auth/refresh', {
      method: 'POST',
      body: { refreshToken: state[role].refreshToken },
    });
    state[role].accessToken = result.accessToken;
    state[role].refreshToken = result.refreshToken;
    showToast(`${role === 'recipient' ? 'Recipient' : 'Actor'} refresh token rotated. Previous token is no longer reusable.`);
    logSocket(`${roleUserName(role)} rotated refresh token`, 'success');
  } catch (error) {
    showToast(`Token rotation failed: ${error.message}`, true);
  }
}

async function logout(role, allSessions = false) {
  if (!state[role]) return;
  const route = allSessions ? '/api/auth/logout-all' : '/api/auth/logout';
  try {
    await request(apiOrigin(), route, {
      token: state[role].accessToken,
      method: 'POST',
    });
    if (role === 'recipient') {
      disconnectSocket(allSessions ? 'Recipient sessions revoked' : 'Recipient signed out');
      state.preferences.clear();
      state.cursor = null;
      state.hasMore = false;
    }
    state[role] = null;
    byId(`${role}-session-list`).classList.add('hidden');
    renderRole(role);
    showToast(allSessions ? 'All sessions revoked.' : `${role === 'recipient' ? 'Recipient' : 'Actor'} signed out.`);
  } catch (error) {
    showToast(`Sign out failed: ${error.message}`, true);
  }
}

function initialize() {
  document.querySelectorAll('.mode-button').forEach((button) => {
    button.addEventListener('click', () => setAuthMode(button.dataset.role, button.dataset.mode));
  });
  for (const role of ['actor', 'recipient']) {
    byId(`${role}-auth-submit`).addEventListener('click', () => void authenticate(role));
    byId(`${role}-password`).addEventListener('keydown', (event) => {
      if (event.key === 'Enter') void authenticate(role);
    });
    byId(`${role}-refresh-token`).addEventListener('click', () => void rotateToken(role));
    byId(`${role}-logout`).addEventListener('click', () => void logout(role));
  }
  byId('recipient-sessions').addEventListener('click', () => void loadSessions('recipient'));
  byId('recipient-logout-all').addEventListener('click', () => {
    if (window.confirm('Revoke every active session for this recipient account?')) {
      void logout('recipient', true);
    }
  });
  byId('event-type').addEventListener('change', (event) => {
    byId('post-id-field').classList.toggle('hidden', event.target.value !== 'POST_LIKED');
  });
  byId('send-event').addEventListener('click', () => void sendEvent());
  byId('socket-toggle').addEventListener('click', () => {
    if (state.socket?.connected) disconnectSocket('Socket disconnected by user');
    else connectSocket();
  });
  byId('socket-instance').addEventListener('change', () => {
    if (state.socket?.connected) connectSocket();
  });
  byId('refresh-health').addEventListener('click', () => void checkHealth());
  byId('refresh-feed').addEventListener('click', () => {
    state.cursor = null;
    void Promise.all([loadNotifications(), loadUnreadCount()]);
  });
  byId('load-more').addEventListener('click', () => void loadNotifications({ append: true }));
  byId('mark-all-read').addEventListener('click', () => void markAllRead());
  byId('refresh-metrics').addEventListener('click', () => void loadMetrics());
  setAuthMode('actor', 'register');
  setAuthMode('recipient', 'register');
  const otherPort = new URL(apiOrigin('second')).port;
  byId('target-instance').options[1].textContent = `Second instance · :${otherPort}`;
  byId('socket-instance').options[1].textContent = `Second instance · :${otherPort}`;
  renderRole('actor');
  renderRole('recipient');
  void checkHealth();
  window.setInterval(() => void checkHealth(), 20000);
}

document.addEventListener('DOMContentLoaded', initialize, { once: true });

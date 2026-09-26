const counters = new Map();
const gauges = new Map();
const histograms = new Map();

function labelsKey(labels) {
  return Object.entries(labels).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}="${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n')}"`)
    .join(',');
}

export function observe(name, help, value, labels = {}, buckets = [1, 5, 10, 50, 100, 250, 500, 1000, 5000]) {
  let metric = histograms.get(name);
  if (!metric) {
    metric = { help, buckets, values: new Map() };
    histograms.set(name, metric);
  }
  const key = labelsKey(labels);
  let sample = metric.values.get(key);
  if (!sample) {
    sample = { labels, count: 0, sum: 0, bucketCounts: buckets.map(() => 0) };
    metric.values.set(key, sample);
  }
  sample.count++;
  sample.sum += value;
  buckets.forEach((bound, index) => {
    if (value <= bound) sample.bucketCounts[index]++;
  });
}

export function increment(name, labels = {}, amount = 1, help = name) {
  let metric = counters.get(name);
  if (!metric) {
    metric = { help, values: new Map() };
    counters.set(name, metric);
  }
  const key = labelsKey(labels);
  const sample = metric.values.get(key) || { labels, value: 0 };
  sample.value += amount;
  metric.values.set(key, sample);
}

export function setGauge(name, value, help = name) {
  let metric = gauges.get(name);
  if (!metric) {
    metric = { help, values: new Map() };
    gauges.set(name, metric);
  }
  metric.values.set('', { labels: {}, value });
}

export function addGauge(name, amount, help = name) {
  let metric = gauges.get(name);
  if (!metric) {
    metric = { help, values: new Map() };
    gauges.set(name, metric);
  }
  const sample = metric.values.get('') || { labels: {}, value: 0 };
  sample.value += amount;
  metric.values.set('', sample);
}

export function setLabeledGauge(name, value, labels = {}, help = name) {
  let metric = gauges.get(name);
  if (!metric) {
    metric = { help, values: new Map() };
    gauges.set(name, metric);
  }
  metric.values.set(labelsKey(labels), { labels, value });
}

export function observeHttpRequest(durationMs, method, route, status) {
  observe('http_request_duration_ms', 'HTTP request duration in milliseconds', durationMs, {
    method, route, status,
  });
  increment('http_requests_total', { method, route, status }, 1, 'Total HTTP requests');
}

export function observeOutboxLag(seconds) {
  observe('outbox_event_lag_seconds', 'Age of an event when claimed, in seconds', seconds);
}

export function observeUnreadSync(count, durationMs, outcome = 'success') {
  if (outcome === 'success') {
    observe('unread_sync_notifications', 'Notifications returned by reconnect sync', count);
  }
  observe('unread_sync_duration_ms', 'Reconnect sync duration in milliseconds', durationMs, { outcome });
}

export function renderMetrics() {
  const lines = [];
  for (const [name, metric] of counters) {
    lines.push(`# HELP ${name} ${metric.help}`, `# TYPE ${name} counter`);
    for (const sample of metric.values.values()) {
      lines.push(`${name}${sample.labels && Object.keys(sample.labels).length ? `{${labelsKey(sample.labels)}}` : ''} ${sample.value}`);
    }
  }
  for (const [name, metric] of gauges) {
    lines.push(`# HELP ${name} ${metric.help}`, `# TYPE ${name} gauge`);
    for (const sample of metric.values.values()) {
      lines.push(`${name}${Object.keys(sample.labels).length ? `{${labelsKey(sample.labels)}}` : ''} ${sample.value}`);
    }
  }
  for (const [name, metric] of histograms) {
    lines.push(`# HELP ${name} ${metric.help}`, `# TYPE ${name} histogram`);
    for (const sample of metric.values.values()) {
      const labels = labelsKey(sample.labels);
      const prefix = labels ? `{${labels},` : '{';
      metric.buckets.forEach((bound, index) => {
        lines.push(`${name}_bucket${prefix}le="${bound}"} ${sample.bucketCounts[index]}`);
      });
      lines.push(`${name}_bucket${prefix}le="+Inf"} ${sample.count}`);
      lines.push(`${name}_sum${labels ? `{${labels}}` : ''} ${sample.sum}`);
      lines.push(`${name}_count${labels ? `{${labels}}` : ''} ${sample.count}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

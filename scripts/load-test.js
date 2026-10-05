import autocannon from 'autocannon';

const target = new URL(process.env.LOAD_TEST_URL || 'http://localhost:3000/health');
const duration = Number(process.env.LOAD_TEST_SECONDS || 30);
const connections = Number(process.env.LOAD_TEST_CONNECTIONS || 10);

if (process.env.NODE_ENV === 'production' && process.env.LOAD_TEST_ALLOW_PRODUCTION !== 'true') {
  throw new Error('Refusing to run load test in production without LOAD_TEST_ALLOW_PRODUCTION=true');
}
if (target.protocol !== 'http:' && target.protocol !== 'https:') {
  throw new Error('LOAD_TEST_URL must use HTTP or HTTPS');
}
if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) &&
    process.env.LOAD_TEST_ALLOW_REMOTE !== 'true') {
  throw new Error('Refusing to load-test a remote host without LOAD_TEST_ALLOW_REMOTE=true');
}
if (!Number.isSafeInteger(duration) || duration < 1 || duration > 3600) {
  throw new Error('LOAD_TEST_SECONDS must be between 1 and 3600');
}
if (!Number.isSafeInteger(connections) || connections < 1 || connections > 1000) {
  throw new Error('LOAD_TEST_CONNECTIONS must be between 1 and 1000');
}

const headers = process.env.LOAD_TEST_TOKEN
  ? { authorization: `Bearer ${process.env.LOAD_TEST_TOKEN}` }
  : undefined;

const result = await new Promise((resolve, reject) => {
  autocannon({
    url: target.toString(),
    method: 'GET',
    headers,
    duration,
    connections,
    pipelining: 1,
  }, (error, report) => error ? reject(error) : resolve(report));
});

console.log(JSON.stringify({
  url: target.origin + target.pathname,
  durationSeconds: duration,
  connections,
  requestsPerSecond: result.requests.average,
  latencyMs: result.latency,
  throughputBytesPerSecond: result.throughput.average,
  errors: result.errors,
  timeouts: result.timeouts,
  non2xx: result.non2xx,
}, null, 2));

if (result.errors || result.timeouts || result.non2xx) process.exitCode = 1;

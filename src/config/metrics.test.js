import { describe, expect, it } from 'vitest';
import { increment, observe, renderMetrics, setLabeledGauge } from './metrics.js';

describe('Prometheus metrics', () => {
  it('renders counter and histogram samples using exposition format', () => {
    increment('test_metric_total', { component: 'outbox' }, 2, 'Test counter');
    observe('test_duration_ms', 'Test duration', 12, { route: '/ready' }, [10, 20]);
    setLabeledGauge('test_rows', 3, { status: 'pending' }, 'Test row counts');

    const output = renderMetrics();
    expect(output).toContain('# TYPE test_metric_total counter');
    expect(output).toContain('test_metric_total{component="outbox"} 2');
    expect(output).toContain('test_duration_ms_bucket{route="/ready",le="10"} 0');
    expect(output).toContain('test_duration_ms_bucket{route="/ready",le="20"} 1');
    expect(output).toContain('test_duration_ms_count{route="/ready"} 1');
    expect(output).toContain('test_rows{status="pending"} 3');
  });
});

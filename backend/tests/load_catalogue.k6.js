import http from 'k6/http';
import { check } from 'k6';

// Run against provisioned staging. Supply BASE_URL; no production default.
export const options = {
  scenarios: { catalogue: { executor: 'constant-arrival-rate', rate: Number(__ENV.RPM || 5000), timeUnit: '1m', duration: __ENV.DURATION || '30m', preAllocatedVUs: 100, maxVUs: 300 } },
  thresholds: { http_req_failed: ['rate<0.005'], http_req_duration: ['p(95)<300'], checks: ['rate>0.995'], dropped_iterations: ['count==0'] },
};

export default function () {
  if (!__ENV.BASE_URL) throw new Error('BASE_URL must point to the staging API');
  const response = http.get(`${__ENV.BASE_URL}/v1/catalogue/products?per_page=24`);
  check(response, { 'successful catalogue': r => r.status === 200 && Array.isArray(r.json()) });
}

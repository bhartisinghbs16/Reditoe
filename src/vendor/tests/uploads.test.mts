/**
 * How the vendor app sends a file.
 *
 * Since SDK 53 Expo's own `fetch` refuses the `{ uri, name, type }` part a
 * phone's document picker returns - "Unsupported FormDataPart implementation",
 * thrown before anything is sent - so a KYC document or a menu sheet never left
 * the phone. On a phone those calls go through XMLHttpRequest instead; these
 * stand in for it:
 *
 *     node --import ./tests/register-stubs.mjs --test tests/uploads.test.mts
 *
 * Run from vendor/. Deliberately not an npm script: package.json scripts are
 * part of the Expo runtime fingerprint, so adding one would put the next OTA on
 * a runtime that no installed build has.
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

(globalThis as any).__DEV__ = true;
process.env.EXPO_PUBLIC_API_URL = 'http://api.test/api';

const { uploadKycDocument, uploadMenuSheet, setToken, ApiError } = await import('../src/lib/api.ts');

type Sent = { method: string; url: string; headers: Record<string, string>; body: unknown };
let sent: Sent[] = [];
let answer: { status: number; text?: string; body?: unknown; fail?: boolean; hang?: boolean } = { status: 200 };
let fetchCalls = 0;

// Expo's fetch, for what matters here: it cannot send a picked file.
(globalThis as any).fetch = async () => {
  fetchCalls += 1;
  throw new TypeError('Unsupported FormDataPart implementation');
};

class FakeXHR {
  status = 0;
  responseText = '';
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private method = '';
  private url = '';
  private headers: Record<string, string> = {};
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  abort() {}
  send(body: unknown) {
    sent.push({ method: this.method, url: this.url, headers: this.headers, body });
    if (answer.hang) return;
    queueMicrotask(() => {
      if (answer.fail) return this.onerror?.();
      this.status = answer.status;
      this.responseText = answer.text ?? JSON.stringify(answer.body ?? {});
      this.onload?.();
    });
  }
}

const pickedFile = () => {
  const body = new FormData();
  body.append('document', { uri: 'file:///cache/fssai.jpg', name: 'fssai.jpg', type: 'image/jpeg' } as any);
  body.append('documentType', 'fssai');
  return body;
};

beforeEach(async () => {
  sent = [];
  fetchCalls = 0;
  answer = { status: 200, body: { status: 'success', data: { documentType: 'fssai' } } };
  (globalThis as any).XMLHttpRequest = FakeXHR;
  await setToken('vendor-token');
});

describe('uploading a document', () => {
  test('goes through XMLHttpRequest, not fetch, and lets the runtime set the boundary', async () => {
    const result = await uploadKycDocument(pickedFile());
    assert.deepEqual(result, { documentType: 'fssai' });
    assert.equal(fetchCalls, 0, 'fetch was not used');
    assert.equal(sent.length, 1);
    assert.equal(sent[0].method, 'POST');
    assert.equal(sent[0].url, 'http://api.test/api/vendor/kyc/upload');
    assert.ok(sent[0].body instanceof FormData);
    assert.equal(sent[0].headers['Content-Type'], undefined);
  });

  test('carries the signed-in vendor', async () => {
    await uploadKycDocument(pickedFile());
    assert.equal(sent[0].headers.Authorization, 'Bearer vendor-token');
  });

  test('a refusal keeps its own words', async () => {
    answer = { status: 400, body: { status: 'error', message: 'File too large' } };
    await assert.rejects(
      () => uploadKycDocument(pickedFile()),
      (error: any) => error instanceof ApiError && error.status === 400 && error.message === 'File too large'
    );
  });

  test('an error page that is not JSON is reported by its status', async () => {
    answer = { status: 502, text: '<html>Bad gateway</html>' };
    await assert.rejects(
      () => uploadKycDocument(pickedFile()),
      (error: any) => error.status === 502 && /Upload failed \(502\)/.test(error.message)
    );
  });

  test('a success that cannot be read is not taken for one', async () => {
    answer = { status: 200, text: '<html>captive portal</html>' };
    await assert.rejects(
      () => uploadKycDocument(pickedFile()),
      (error: any) => /could not be read/i.test(error.message)
    );
  });

  test('a dropped connection says the server could not be reached', async () => {
    answer = { status: 0, fail: true };
    await assert.rejects(
      () => uploadKycDocument(pickedFile()),
      (error: any) =>
        error instanceof ApiError && error.status === 0 && /could not reach the server/i.test(error.message)
    );
  });
});

describe('importing a menu sheet', () => {
  test('goes through XMLHttpRequest to the import route and answers with the whole reply', async () => {
    answer = { status: 200, body: { status: 'success', data: { created: 12, problems: [] } } };
    const body = new FormData();
    body.append('file', { uri: 'file:///cache/menu.xlsx', name: 'menu.xlsx', type: 'application/vnd.ms-excel' } as any);

    const result: any = await uploadMenuSheet(body);
    assert.equal(result.data.created, 12);
    assert.equal(fetchCalls, 0);
    assert.equal(sent[0].url, 'http://api.test/api/vendor/menu/import');
  });

  test('a refusal reads "Import failed" when the server gives no reason', async () => {
    answer = { status: 500, body: {} };
    await assert.rejects(
      () => uploadMenuSheet(new FormData()),
      (error: any) => /Import failed \(500\)/.test(error.message)
    );
  });
});

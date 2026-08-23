/**
 * Renders openapi/openapi.json from the endpoint manifest — no server start.
 * Request schemas are the exact zod parsers the controllers run (contracts
 * package), converted via zod v4's native JSON Schema output. Deterministic:
 * same manifest + schemas → byte-identical file (CI drift check depends on it).
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z, type ZodType } from 'zod';
import { ENDPOINTS } from './manifest';

function toSchema(schema: ZodType): object {
  return z.toJSONSchema(schema, {
    target: 'draft-2020-12',
    unrepresentable: 'any',
  });
}

function pathParams(path: string) {
  return [...path.matchAll(/\{(\w+)\}/g)].map((m) => ({
    name: m[1],
    in: 'path',
    required: true,
    schema: { type: 'string' },
  }));
}

function queryParams(schema: ZodType) {
  const json = toSchema(schema) as {
    properties?: Record<string, object>;
    required?: string[];
  };
  return Object.entries(json.properties ?? {}).map(([name, prop]) => ({
    name,
    in: 'query',
    required: json.required?.includes(name) ?? false,
    schema: prop,
  }));
}

const paths: Record<string, Record<string, object>> = {};
for (const e of ENDPOINTS) {
  const operation: Record<string, unknown> = {
    tags: [e.tag],
    summary: e.summary,
    operationId: `${e.method}_${e.path.replace(/[/{}]+/g, '_').replace(/^_|_$/g, '')}`,
    security: e.public ? [] : [{ bearerAuth: [] }],
    parameters: [
      ...pathParams(e.path),
      ...(e.query ? queryParams(e.query) : []),
    ],
    responses: {
      '200': {
        description: e.responseDescription ?? 'Success',
        ...(e.response && {
          content: { 'application/json': { schema: toSchema(e.response) } },
        }),
      },
      '400': { description: 'Validation failed (zod issues in body)' },
      '401': { description: 'Missing/invalid token, or TOTP required' },
      '403': { description: 'Role lacks the required permission' },
    },
  };
  if (e.permission) operation['x-required-permission'] = e.permission;
  if (e.body) {
    operation.requestBody = {
      required: true,
      content: { 'application/json': { schema: toSchema(e.body) } },
    };
  }
  paths[e.path] = { ...(paths[e.path] ?? {}), [e.method]: operation };
}

const document = {
  openapi: '3.1.0',
  info: {
    title: 'Ursainyk API',
    version: '0.1.0',
    description:
      'Nabhahita Phase 1 — candidates, ESM centres, contractors, review gate, matching, verification, billing. ' +
      'Authorization is role-based (see x-required-permission per operation); scoping (territory/org/own) is enforced server-side.',
  },
  servers: [{ url: 'http://localhost:3000', description: 'local dev' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
  },
  paths,
};

const out = join(__dirname, '..', '..', '..', '..', 'openapi', 'openapi.json');
writeFileSync(out, JSON.stringify(document, null, 2) + '\n');
console.log(`openapi:export → ${out} (${ENDPOINTS.length} operations)`);

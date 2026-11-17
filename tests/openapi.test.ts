import { describe, expect, it } from 'vitest';
import { app } from '../src/worker/index';
import { documentedRoutes, openApiDocument } from '../src/worker/openapi';

/** Every concrete API route Hono has registered, as "METHOD /api/path/{param}". */
function registeredRoutes(): string[] {
  const methods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
  return [
    ...new Set(
      app.routes
        .filter((r) => methods.has(r.method) && r.path.startsWith('/api/') && !r.path.includes('*'))
        .map((r) => `${r.method} ${r.path.replace(/:([A-Za-z_]+)(\{[^}]*\})?/g, '{$1}')}`),
    ),
  ].sort();
}

function refs(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v) => refs(v, found));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k === '$ref' && typeof v === 'string') found.push(v);
      else refs(v, found);
    }
  }
  return found;
}

describe('OpenAPI document', () => {
  it('documents exactly the routes the Worker serves', () => {
    const registered = registeredRoutes();
    const documented = documentedRoutes().sort();
    expect(registered.filter((r) => !documented.includes(r)), 'routes missing from src/worker/openapi.ts').toEqual([]);
    expect(documented.filter((r) => !registered.includes(r)), 'documented routes that do not exist').toEqual([]);
  });

  it('is a well-formed OpenAPI 3.1 document', () => {
    const doc = openApiDocument('https://go.example.com') as any;
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.servers).toEqual([{ url: 'https://go.example.com' }]);
    const schemas = Object.keys(doc.components.schemas);
    for (const r of refs(doc)) expect(schemas, r).toContain(r.replace('#/components/schemas/', ''));
    // Link bodies are generated from the validation schemas.
    expect(doc.components.schemas.LinkInput.required).toContain('url');
    expect(Object.keys(doc.components.schemas.LinkInput.properties)).toEqual(expect.arrayContaining(['slug', 'rules', 'variants', 'password', 'max_clicks']));
    expect(doc.components.schemas.LinkPatch.required ?? []).toEqual([]);
    for (const [path, ops] of Object.entries<Record<string, any>>(doc.paths)) {
      for (const [method, op] of Object.entries(ops)) {
        expect(op.summary, `${method} ${path}`).toBeTruthy();
        expect(op.responses, `${method} ${path}`).toBeTruthy();
        const pathParams = [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
        const declared = (op.parameters ?? []).filter((p: any) => p.in === 'path').map((p: any) => p.name);
        expect(declared, `${method} ${path} path parameters`).toEqual(pathParams);
      }
    }
  });
});

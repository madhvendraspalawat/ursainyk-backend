/**
 * Exports the OpenAPI document to ../../openapi/openapi.json without starting a server.
 * TODO (identity/contracts workstream): NestFactory.create(AppModule, { logger: false })
 *   → SwaggerModule.createDocument(app, new DocumentBuilder()...build())
 *   → cleanupOpenApiDoc (nestjs-zod) → writeFileSync → app.close()
 */
console.log('openapi:export — not wired yet (see src/openapi/export.ts)');

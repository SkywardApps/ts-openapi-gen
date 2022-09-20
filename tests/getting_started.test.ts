import { OpenAPIV3 } from 'openapi-types';
import { OpenApiDocumentationGenerator} from '../src/OpenApiDocumentationGenerator';
import { OpenApiUtil } from '../src/OpenApiUtil';

// Execute against our sample getting_started project
const generator = new OpenApiDocumentationGenerator('jest.getting_started.json', 'samples/getting_started/src', 'samples/getting_started/tsconfig.json');
const documentPromise = generator.GenerateOpenApiSchema();


test('Generate promise is not falsey', () => 
{
	expect(documentPromise).not.toBeFalsy();
});

test('The results are not falsey', async () => 
{
	const document = await documentPromise;
	expect(document).not.toBeFalsy();
});

test('Body type comments are included', async () => 
{
	const document = await documentPromise;
	const modelSchema = document?.components?.schemas?.['IBodyData'] as OpenAPIV3.SchemaObject | undefined;
	expect(OpenApiUtil.isReferenceObject(modelSchema)).toBeFalsy();
	expect(modelSchema?.description ?? '').toContain('{TST1}');

	const requestBody = document?.paths['/post']?.post?.requestBody as OpenAPIV3.RequestBodyObject | undefined;
	const requestSchema = requestBody?.content?.['application/json'].schema as OpenAPIV3.ReferenceObject | undefined;
	expect(OpenApiUtil.isReferenceObject(requestSchema)).toBeTruthy();
	expect(requestSchema?.$ref).toBe('#/components/schemas/IBodyData');
});

test('Optional and required properties are set correctly', async () => 
{
	const document = await documentPromise;
	const modelSchema = document?.components?.schemas?.['IBodyData'] as OpenAPIV3.SchemaObject | undefined;

	expect(modelSchema?.required).toContain('stringType');
	expect(modelSchema?.required).toContain('numberType');
	expect(modelSchema?.required).toContain('enumeratedLiterals');
	expect(modelSchema?.required).toContain('inferredType');
	expect(modelSchema?.required).toContain('indexedType');

	expect(modelSchema?.required).not.toContain('boolType');
	expect(modelSchema?.required).not.toContain('unionType');
});

test('String properties are of type string', async () => 
{
	const document = await documentPromise;
	const modelSchema = document?.components?.schemas?.['IBodyData'] as OpenAPIV3.SchemaObject | undefined;
	const propertySchema = modelSchema?.properties?.['stringType'] as OpenAPIV3.SchemaObject | undefined;

	expect(OpenApiUtil.isReferenceObject(propertySchema)).toBeFalsy();
	expect(propertySchema?.type).toBe('string');
	expect(propertySchema?.title).toContain('{TST2}');
});

test('Number properties are of type number', async () => 
{
	const document = await documentPromise;
	const modelSchema = document?.components?.schemas?.['IBodyData'] as OpenAPIV3.SchemaObject | undefined;
	const propertySchema = modelSchema?.properties?.['numberType'] as OpenAPIV3.SchemaObject | undefined;

	expect(OpenApiUtil.isReferenceObject(propertySchema)).toBeFalsy();
	expect(propertySchema?.type).toBe('number');
	expect(propertySchema?.title).toContain('{TST3}');
});

test('Bool properties are of type boolean', async () => 
{
	const document = await documentPromise;
	const modelSchema = document?.components?.schemas?.['IBodyData'] as OpenAPIV3.SchemaObject | undefined;
	const propertySchema = modelSchema?.properties?.['boolType'] as OpenAPIV3.SchemaObject | undefined;

	expect(OpenApiUtil.isReferenceObject(propertySchema)).toBeFalsy();
	expect(propertySchema?.type).toBe('boolean');
	expect(propertySchema?.title).toContain('{TST4}');
});

test('Enumerated literals are present', async () => 
{
	const document = await documentPromise;
	const modelSchema = document?.components?.schemas?.['IBodyData'] as OpenAPIV3.SchemaObject | undefined;
	const propertySchema = modelSchema?.properties?.['enumeratedLiterals'] as OpenAPIV3.SchemaObject | undefined;

	expect(OpenApiUtil.isReferenceObject(propertySchema)).toBeFalsy();
	expect(propertySchema?.oneOf).toBeTruthy();
	expect(propertySchema?.title).toContain('{TST5}');
});


test('Enumerations are set', async () => 
{
	const document = await documentPromise;
	const modelSchema = document?.components?.schemas?.['IBodyData'] as OpenAPIV3.SchemaObject | undefined;
	const propertySchema = modelSchema?.properties?.['enumeration'] as OpenAPIV3.SchemaObject | undefined;

	expect(OpenApiUtil.isReferenceObject(propertySchema)).toBeFalsy();
	expect(propertySchema?.type).toBe('number');
	expect(propertySchema?.enum?.length).toBe(4);
	expect(propertySchema?.enum).toContain(1);
	expect(propertySchema?.enum).toContain(2);
	expect(propertySchema?.enum).toContain(3);
	expect(propertySchema?.enum).toContain(4);
});

test('Inferred types have a schema and documentation', async () => 
{
	const document = await documentPromise;
	const modelSchema = document?.components?.schemas?.['IBodyData'] as OpenAPIV3.SchemaObject | undefined;
	const propertySchema = modelSchema?.properties?.['inferredType'] as OpenAPIV3.SchemaObject | undefined;

	expect(OpenApiUtil.isReferenceObject(propertySchema)).toBeFalsy();
	expect(propertySchema?.type).toBe('object');
	expect(propertySchema?.title).toContain('{TST6}');
});

test('Inferred type properties can be documented', async () => 
{
	const document = await documentPromise;
	const modelSchema = document?.components?.schemas?.['IBodyData'] as OpenAPIV3.SchemaObject | undefined;
	const parentSchema = modelSchema?.properties?.['inferredType'] as OpenAPIV3.SchemaObject | undefined;
	const propertySchema = parentSchema?.properties?.['subProperty2'] as OpenAPIV3.SchemaObject | undefined;

	expect(OpenApiUtil.isReferenceObject(propertySchema)).toBeFalsy();
	expect(propertySchema?.type).toBe('string');
	expect(propertySchema?.title).toContain('{TST7}');
});

test('Indexed types are exposed with additionalProperties', async () => 
{
	const document = await documentPromise;
	const modelSchema = document?.components?.schemas?.['IBodyData'] as OpenAPIV3.SchemaObject | undefined;
	const propertySchema = modelSchema?.properties?.['indexedType'] as OpenAPIV3.SchemaObject | undefined;

	expect(OpenApiUtil.isReferenceObject(propertySchema)).toBeFalsy();
	expect(propertySchema?.type).toBe('object');
	expect((propertySchema?.additionalProperties as OpenAPIV3.SchemaObject | undefined)?.type).toBe('number');
	expect(propertySchema?.title).toContain('{TST8}');
});

test('Union types are supported via oneOf', async () => 
{
	const document = await documentPromise;
	const modelSchema = document?.components?.schemas?.['IBodyData'] as OpenAPIV3.SchemaObject | undefined;
	const propertySchema = modelSchema?.properties?.['unionType'] as OpenAPIV3.SchemaObject | undefined;

	expect(OpenApiUtil.isReferenceObject(propertySchema)).toBeFalsy();
	expect(propertySchema?.oneOf).toBeTruthy();
	// TODO: we can test this a bit more rigourously
	expect(propertySchema?.oneOf?.find(one => (one as OpenAPIV3.SchemaObject).type === 'string')).toBeTruthy();
	expect(propertySchema?.title).toContain('{TST9}');
});

test('Response type comments are included', async () => 
{
	const document = await documentPromise;
	const modelSchema = document?.components?.schemas?.['IReturnData'] as OpenAPIV3.SchemaObject | undefined;
	expect(OpenApiUtil.isReferenceObject(modelSchema)).toBeFalsy();
	expect(modelSchema?.description ?? '').toContain('{TST10}');

	const responseObject = document?.paths['/post']?.post?.responses?.['200'] as OpenAPIV3.ResponseObject | undefined;
	const requestSchema = responseObject?.content?.['application/json'].schema as OpenAPIV3.ReferenceObject | undefined;
	expect(OpenApiUtil.isReferenceObject(requestSchema)).toBeTruthy();
	expect(requestSchema?.$ref).toBe('#/components/schemas/IReturnData');
});

test('Moment properties are of type string', async () => 
{
	const document = await documentPromise;
	const modelSchema = document?.components?.schemas?.['IReturnData'] as OpenAPIV3.SchemaObject | undefined;
	const propertySchema = modelSchema?.properties?.['timestamp'] as OpenAPIV3.SchemaObject | undefined;

	expect(OpenApiUtil.isReferenceObject(propertySchema)).toBeFalsy();
	expect(propertySchema?.type).toBe('string');
	expect(propertySchema?.format).toBe('date-time');
	expect(propertySchema?.title).toContain('{TST11}');
});

test('UUID are regular strings for now', async () => 
{
	const document = await documentPromise;
	const modelSchema = document?.components?.schemas?.['IReturnData'] as OpenAPIV3.SchemaObject | undefined;
	const propertySchema = modelSchema?.properties?.['uuid'] as OpenAPIV3.SchemaObject | undefined;

	expect(OpenApiUtil.isReferenceObject(propertySchema)).toBeFalsy();
	expect(propertySchema?.type).toBe('string');
	expect(propertySchema?.title).toContain('{TST12}');
});


test('Endpoints method comments are included', async () => 
{
	const document = await documentPromise;
	const postObject = document?.paths['/post']?.post;
	expect(postObject?.summary).toContain('{TST14}');
	// The long-form description should include both the summary and the details
	expect(postObject?.description).toContain('{TST14}');
	expect(postObject?.description).toContain('{TST15}');
});


test('Endpoints post body comments are included', async () => 
{
	const document = await documentPromise;
	const requestBody = document?.paths['/post']?.post?.requestBody as OpenAPIV3.RequestBodyObject | undefined;
	expect(requestBody?.description).toContain('{TST16}');
});


test('Endpoints post response comments are included', async () => 
{
	const document = await documentPromise;
	const responseObject = document?.paths['/post']?.post?.responses?.['200'] as OpenAPIV3.ResponseObject | undefined;
	expect(responseObject?.description).toContain('{TST17}');
});

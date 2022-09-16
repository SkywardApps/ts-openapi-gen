import yargs from 'yargs';
import * as TypeDoc from 'typedoc';
import fs from 'fs';
import { OpenAPIV3 } from 'openapi-types';
import { exit } from 'process';


const typeRegistry: { [key: string]: TypeDoc.DeclarationReflection } = {};
const shimRegistry: { [key: string]: (type: TypeDoc.ReferenceType) => OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject } = {};
const schemaRegistry: { [key: string]: OpenAPIV3.SchemaObject } = {};


const argv = yargs(process.argv.slice(2)).options({
	tsconfig: { type: 'string', default: './tsconfig.json' },
	entrypoint: { type: 'string', default: './src/controllers'},
	out: {type: 'string', default: './openapi.json'}
}).argv;

if(!argv.tsconfig)
{
	console.error('No tsconfig file provided.');
	process.exit(-1);
}

if(!argv.entrypoint)
{
	console.error('No entrypoint provided.');
	process.exit(-1);
}

if(!argv.out)
{
	console.error('No out file provided.');
	process.exit(-1);
}

async function main()
{
	// Add any specific type shims
	addShim('Promise', deriveFromPromiseOfContent);
	addShim('OkNegotiatedContentResult', deriveFromTypeArgument);
	addShim('Moment', () => ({type:'string', format:'date-time'}));


	const app = new TypeDoc.Application();
	// If you want TypeDoc to load tsconfig.json / typedoc.json files
	app.options.addReader(new TypeDoc.TSConfigReader());
	app.options.addReader(new TypeDoc.TypeDocReader());

	/*
		"typedocOptions": {
			"entryPoints": ["src/controllers"],
			"out": "docs",
			"json": "all.json",
			"entryPointStrategy": "expand",
			"pretty": true
		}
		*/
	app.bootstrap({
		// typedoc options here
		entryPoints: [argv.entrypoint],
		tsconfig: argv.tsconfig,
		json: argv.out,
		entryPointStrategy: 'Expand',
		pretty: true
	});

	const project = app.convert();

	if (!project || !project.children) 
	{
		return;
	}

	await app.generateJson(project, './documentation.json');

	const document: OpenAPIV3.Document = {
		info: {
			title: `OpenAPI schema for ${project.name}`,
			version: '1',
			description: '',
			/*
			contact: {
				email: '',
				name: '',
				url: ''
			},
			license: {
				name: '',
				url: ''
			},
			termsOfService: '',*/
		},
		openapi: '3.0.3',
		paths: {

		},
		components: {}
	};

	const referencedTypes = typedoc_find(project.children, (item) => 
	{
		return item.kindString === 'Interface' || item.kindString == 'Type alias' || item.kindString == 'Class';
	});

	for(const builtInType of referencedTypes)
	{
		registerType((builtInType as TypeDoc.DeclarationReflection).name, builtInType);
	}

	const controllers = typedoc_find(project.children, (item) => 
	{
		return item.kindString === 'Class' && !!item.decorators?.find(dec => dec.name === 'controller');
	} );

	const httpMethods = ['httpGet', 'httpPost', 'httpPut', 'httpDelete', 'httpPatch', 'httpHead'];
	for(const controller of controllers)
	{
		if(!controller.children)
		{
			continue;
		}

		const name = controller.name;
		const endpoints = typedoc_find(controller.children, (item) => 
		{
			return item.kindString === 'Method' 
				&& item.flags.isPublic
				&& !!item.decorators?.find(dec => httpMethods.indexOf(dec.name) >= 0);
		});

		for(const endpoint of endpoints)
		{
			const signature = endpoint.signatures?.[0];
			if(!signature)
			{
				continue;
			}

			const requestParameters = signature.parameters?.filter(p => p.kindString === 'Parameter'
				&& p.decorators?.find(dec => dec.name === 'requestParam'));

			const queryParameters = signature.parameters?.filter(p => p.kindString === 'Parameter'
				&& p.decorators?.find(dec => dec.name === 'queryParam'));

			const bodyParameter = signature.parameters?.find(p => p.kindString === 'Parameter'
				&& p.decorators?.find(dec => dec.name === 'requestBody'));

			const decorators = endpoint.decorators?.filter(dec => httpMethods.indexOf(dec.name) >= 0 && dec.arguments?.path) ?? [];
			for(const decorator of decorators)
			{
				//path
				let path = (decorator.arguments.path as string);
				path = convertPathParameters(stripQuotes(path));
				console.log(path);
				if(!document.paths![path])
				{
					// get the request parameters here
					const parameters: (OpenAPIV3.ReferenceObject | OpenAPIV3.ParameterObject)[] = [
						...requestParameters?.filter(rp => rp.type && rp.decorators?.find(dec => dec.name === 'requestParam'))
							.map<(OpenAPIV3.ReferenceObject | OpenAPIV3.ParameterObject)>(rp => ({
								name: stripQuotes(rp.decorators!.find(dec => dec.name === 'requestParam')!.arguments?.paramName),
								in: 'path',
								description: rp.comment?.shortText || '',
								required: true,
								schema: schemaFromType(rp.type!) as any,
								style: 'simple'
							})) ?? [],
						...queryParameters?.filter(rp => rp.type && rp.decorators?.find(dec => dec.name === 'queryParam'))
							.map<(OpenAPIV3.ReferenceObject | OpenAPIV3.ParameterObject)>(qp => ({
								name: stripQuotes(qp.decorators?.find(dec => dec.name === 'queryParam')?.arguments?.queryParamName),
								in: 'query',
								description: qp.comment?.shortText || '',
								required: false,
								schema: schemaFromType(qp.type!) as any,
								style: 'form'
							})) ?? []
					];
					
					document.paths![path!] = {
						parameters
					};
				}

				const endpointDocumentation = {
					tags: [
						name
					],
					summary: signature.comment?.shortText ?? signature.name,
					description: signature.comment?.text,
					requestBody: bodyParameter?.type ? {
						description: '',
						content: {
							'application/json': {
								schema: schemaFromType(bodyParameter.type)								
							}
						} ,
						requred: true
					} as OpenAPIV3.RequestBodyObject  : undefined,
					deprecated: !!signature.comment?.tags?.find(tag => tag.tagName === 'deprecated'),
					responses: {
						'200': {
							description: signature.comment?.returns ?? '',
							content: {
								'application/json': {
									schema: signature.type ? schemaFromType(signature.type) : {}
								}
							}
						}
					}
				};

				if(decorator.name === 'httpGet')
				{
					document.paths![path]!.get = endpointDocumentation as any;
				}

				if(decorator.name === 'httpHead')
				{
					document.paths![path]!.head = endpointDocumentation as any;
				}

				if(decorator.name === 'httpPost')
				{
					document.paths![path]!.post = endpointDocumentation as any;
				}

				if(decorator.name === 'httpPut')
				{
					document.paths![path]!.put = endpointDocumentation as any;
				}

				if(decorator.name === 'httpDelete')
				{
					document.paths![path]!.delete = endpointDocumentation as any;
				}

				if(decorator.name === 'httpPatch')
				{
					document.paths![path]!.patch = endpointDocumentation as any;
				}
			}
		}
	}

	document.components = exportReferencedSchemas();
	
	// write out this document
	fs.writeFileSync(argv.out, JSON.stringify(document, null, 2));
	console.log(`Wrote file to ${argv.out}`);
}

main()
	.catch((err) => { console.error(err); exit(-1); })
	.then(() => process.exit(0));


function typedoc_find(nodes: TypeDoc.DeclarationReflection[], matcher: (item: TypeDoc.DeclarationReflection, parents: TypeDoc.DeclarationReflection[] ) => boolean, recurse: number = -1, parents: TypeDoc.DeclarationReflection[] = []) 
{
	const matches: TypeDoc.DeclarationReflection[] = [];
	for(const item of nodes)
	{
		if(matcher(item, parents))
		{
			matches.push(item);
		}

		if((recurse != 0) && item.children && item.children.length)
		{
			matches.push(...typedoc_find(item.children, matcher, recurse-1, [...parents, item]));
		}
	}
	return matches;
}


function addShim(name: string, shim: (type: TypeDoc.ReferenceType) => OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject)
{
	if(shimRegistry[name])
	{
		console.warn(`Overwriting existing shim for ${name}`);
	}
	shimRegistry[name] = shim;
}

function registerType(name: string, typeNode: TypeDoc.DeclarationReflection) 
{
	if(shimRegistry[name])
	{
		// I think this is fine, this just means we got a real type for what was previously referenced?
		console.warn(`Overwriting existing type for ${name}`);
	}
	typeRegistry[name] = typeNode;
}

function referenceSchema(name: string) : OpenAPIV3.ReferenceObject
{
	if(!schemaRegistry[name])
	{
		if(!typeRegistry[name])
		{
			// For some reason we don't know what this type is, so we can't handle it.
			console.error(`referenceSchema was asked for ${name} which has not been located`);
			return {
				$ref: 'ERR'
			};
		}

		// put in a placeholder because we are evaluating this type and need to not cause an infinite loop!
		schemaRegistry[name] = {};

		const node = typeRegistry[name];
		// Descend from the type node into the relevant type.  THis should be any of interface, Type Alias, class
		if(node.kindString === 'Interface')
		{
			schemaRegistry[name] = schemaFromObject(node as any);
		}
		else if(node.kindString === 'Class')
		{
			schemaRegistry[name] = schemaFromObject(node as any);
		}
		else
		{	
			schemaRegistry[name] = schemaFromType(node.type as any) as OpenAPIV3.SchemaObject;
		}
	}
	return {
		$ref: `#/components/schemas/${name}`
	};
}

function exportReferencedSchemas() : OpenAPIV3.ComponentsObject
{
	const compiledSchemas : { [key: string] : OpenAPIV3.SchemaObject } = {};
	for(const schemaName of Object.keys(schemaRegistry))
	{
		if(!schemaRegistry[schemaName])
		{
			continue;
		}

		compiledSchemas[schemaName] = schemaRegistry[schemaName];
	}
	return {
		schemas: compiledSchemas
	};
}

function schemaFromType(type: TypeDoc.Type) : OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject
{
	if(type.type === 'literal')
	{
		const literalType = type as TypeDoc.LiteralType;
		return {
			type: 'string'
		};
	}

	if(type.type === 'reference')
	{
		const referenceType = type as TypeDoc.ReferenceType;
		
		// Apply any shims
		if(shimRegistry[referenceType.name])
		{
			return shimRegistry[referenceType.name](referenceType);
		}
		return referenceSchema(referenceType.name);
	}

	if(type.type === 'intrinsic')
	{
		const intrisicType = type as TypeDoc.IntrinsicType;
		switch(intrisicType.name)
		{
		case 'string':
			return {
				type: 'string'
			};
		case 'boolean':
			return {
				type: 'boolean'
			};
		case 'number':
			return {
				type: 'number'
			};
		case 'any':
			return {
				type: 'object'
			};
		case 'undefined':
			return {

			};
		case 'void':
			return {
			};
		default:
			throw new Error(`Unrecognized intrinsic type ${intrisicType.name}`);
		}
	}

	if(type.type === 'array')
	{
		const arrayType = type as TypeDoc.ArrayType;
		const typeSchema = schemaFromType(arrayType.elementType);
		return {
			type: 'array',
			items: typeSchema
		};
	}

	if(type.type === 'reflection')
	{
		const reflection = type as TypeDoc.ReflectionType;
		if(!reflection.declaration.children)
		{
			if(reflection.declaration.indexSignature?.type)
			{
				return {
					type: 'object',
					additionalProperties: schemaFromType(reflection.declaration.indexSignature.type)
				};
			}

			console.error('Got a reflection with no children.', reflection.declaration.sources);
			return {};
		}
		return schemaFromObject(reflection.declaration); // name = __type, originalName = __Type
	}

	if(type.type === 'intersection')
	{
		const intersectionType = type as TypeDoc.IntersectionType;
		const intersectionSchema: OpenAPIV3.SchemaObject = {
			allOf: []
		};

		for(const subtype of intersectionType.types)
		{
			intersectionSchema.allOf!.push(schemaFromType(subtype));
		}

		return intersectionSchema;
	}

	if(type.type === 'union')
	{
		const unionType = type as TypeDoc.UnionType;
		const unionSchema: OpenAPIV3.SchemaObject = {
			oneOf: []
		};

		for(const subtype of unionType.types)
		{
			unionSchema.oneOf!.push(schemaFromType(subtype));
		}
		
		return unionSchema;
	}

	if(type.type === 'tuple')
	{
		const tupleType = type as TypeDoc.TupleType;
		const schemas = tupleType.elements.map(schemaFromType);
		return {
			type: 'array',
			items: {
				oneOf: schemas
			}
		};
	}

	//throw new Error(`Not yet handled: type ${type.type}`);
	// Reaching this case means that we don't have a way to translate this to a meaningful schema
	console.error(`Not yet handled: type ${type.type}`, type);
	return {
		type: 'object'
	};
}

function stripQuotes(str: string) 
{
	try
	{
		return str.substring(1, str.length-1);
	}
	catch(err)
	{
		console.error(err);
		return '<ERROR>';
	}
} 

function convertPathParameters(str: string)
{
	try
	{
		return str.replace(/:([^/]+)/g, '{$1}');
	}
	catch(err)
	{
		console.error(err);
		return '<ERROR>';
	}
}

function schemaFromObject(obj: TypeDoc.DeclarationReflection): OpenAPIV3.SchemaObject 
{
	const schemaStart: OpenAPIV3.SchemaObject = {
		type: 'object'
	};

	// This could just be an index type { [key:type]: type } 
	if(obj.indexSignature?.type)
	{
		schemaStart.additionalProperties = schemaFromType(obj.indexSignature.type);
	}
	
	if(!obj.children?.filter(prop => prop.kindString === 'Property')?.length)
	{
		// If we have neither properties nor an index, then this is an empty object 
		// and that's rarely expected.
		if(!obj.indexSignature?.type)
		{
			console.warn(`Object ${obj.name} provided with no Children`, obj.sources);
		}
		return schemaStart;
	}

	schemaStart.properties = {};
	return obj.children.filter(prop => prop.kindString === 'Property')
		.reduce((collection, cursor) => 
		{
			if(cursor.type)
			{
					collection.properties![cursor.name] = schemaFromType(cursor.type);
			}
			return collection;
		}, schemaStart);
}

function deriveFromTypeArgument(type: TypeDoc.ReferenceType)
{
	return schemaFromType(type.typeArguments![0]);
}

function deriveFromPromiseOfContent(type: TypeDoc.ReferenceType)
{
	const typeArgument = type.typeArguments![0];
	if(typeArgument.type === 'union')
	{
		// Search through the unions, and if any are 'OkNegotiatedContentResult' only include those.
		const unionType = typeArgument as TypeDoc.UnionType;
		const okTypes = unionType.types.filter(t => t.type === 'reference' && (t as TypeDoc.ReferenceType).name === 'OkNegotiatedContentResult')
			.map(t => schemaFromType((t as TypeDoc.ReferenceType).typeArguments![0]));
		
		// If there are multiple potential results, return a union of them.
		if(okTypes.length > 1)
		{
			return schemaFromType({
				type: 'union',
				types: okTypes
			} as unknown as TypeDoc.UnionType);
		}

		// If there's only one match, we don't need to union
		if(okTypes.length == 1)
		{
			return okTypes[0];
		}

		// Try to eliminate all status code type results
		const statusReferences = unionType.types.filter(t => !(t.type === 'reference' 
			&& ((t as TypeDoc.ReferenceType).reflection as TypeDoc.DeclarationReflection)?.implementedTypes?.find(t => t.type === 'reference' && (t as TypeDoc.ReferenceType).name === 'IHttpActionResult' )));
		const statusTypes = statusReferences			
			.map(t => 
			{
				return schemaFromType(t);
			});
			
		// If there are multiple potential results, return a union of them.
		if(statusTypes.length > 1)
		{
			return schemaFromType({
				type: 'union',
				types: statusTypes
			} as unknown as TypeDoc.UnionType);
		}

		// If there's only one match, we don't need to union
		if(statusTypes.length == 1)
		{
			return statusTypes[0];
		}

		// This is probably fine?
		console.warn('Found a union of types but none were ok types', typeArgument);
	}
	return schemaFromType(type.typeArguments![0]);
}

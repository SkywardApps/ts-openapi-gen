import * as TypeDoc from 'typedoc';
import { OpenAPIV3 } from 'openapi-types';
import { OpenApiUtil } from './OpenApiUtil';
import { readFile } from 'fs/promises';
import { isTypeNode } from 'typescript';

export class OpenApiDocumentationGenerator 
{
	private readonly typeRegistry: { [key: string]: TypeDoc.DeclarationReflection; } = {};
	private readonly shimRegistry: { [key: string]: (type: TypeDoc.ReferenceType) => OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject; } = {};
	private readonly schemaRegistry: { [key: string]: OpenAPIV3.SchemaObject; } = {};
	private readonly typeAssignments: { [key: string]: OpenAPIV3.SchemaObject; } = {};

	private readonly entrypoint: string;
	private readonly description: string | undefined;

	/**
	 * Initialize with configuration for how this behaves.
	 * @param out 
	 * @param entrypoint 
	 */
	public constructor(entrypoint: string, description: string | undefined) 
	{
		this.entrypoint = entrypoint;
		this.description = description;
		
		// Add any specific type shims
		this.addDefaultShims();
	}

	public AddShim(name: string, shim: (type: TypeDoc.ReferenceType) => OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject) 
	{
		if (this.shimRegistry[name]) 
		{
			console.warn(`Overwriting existing shim for ${name}`);
		}
		this.shimRegistry[name] = shim;
	}

	public async GenerateOpenApiSchema() 
	{
		const fileData = await readFile(this.entrypoint, { encoding: 'utf-8' });
		const project = JSON.parse(fileData) as TypeDoc.ProjectReflection;
		if (!project || !project.children) 
		{
			return;
		}

		const document: OpenAPIV3.Document = {
			info: {
				title: `OpenAPI schema for ${project.name}`,
				version: '1',
				description: '',
				contact: {
					email: '',
					name: '',
					url: ''
				},
				license: {
					name: '',
					url: ''
				},
				termsOfService: '',
			},
			openapi: '3.1.0',
			paths: {},
			components: {},
			tags: []
		};

		const referencedTypes = this.findInTypeDoc(project.children, (item) => 
		{
			return item.kindString === 'Interface' || item.kindString == 'Type alias' || item.kindString == 'Class';
		});

		for (const builtInType of referencedTypes) 
		{
			this.registerType((builtInType as TypeDoc.DeclarationReflection).name, builtInType);
		}

		const controllers = this.findInTypeDoc(project.children, (item) => 
		{
			return item.kindString === 'Class' && !!item.decorators?.find(dec => dec.name === 'controller');
		});

		const httpMethods = ['httpGet', 'httpPost', 'httpPut', 'httpDelete', 'httpPatch', 'httpHead'];
		for (const controller of controllers) 
		{
			if (!controller.children) 
			{
				continue;
			}

			const name = controller.name;
			const path = controller.decorators!.find(dec => dec.name === 'controller')?.arguments?.path ?? '';
			document.tags!.push({
				name,
				description: controller.comment?.shortText
			});
			const endpoints = this.findInTypeDoc(controller.children, (item) => 
			{
				return item.kindString === 'Method'
					&& item.flags.isPublic
					&& !!item.decorators?.find(dec => httpMethods.indexOf(dec.name) >= 0);
			});

			for (const endpoint of endpoints) 
			{
				const signature = endpoint.signatures?.[0];
				if (!signature) 
				{
					continue;
				}

				this.addPathEndpointsAndDocumentation(signature, endpoint, httpMethods, document, name, path);
			}
		}

		document.components = this.exportReferencedSchemas();
		await this.configureDocumentDescription(document);

		return document;
	}


	private async configureDocumentDescription(document: OpenAPIV3.Document<{}>) 
	{
		if(this.description)
		{
			const descriptionData = await readFile(this.description, { encoding: 'utf-8' });
			const descriptionLines = descriptionData.split('\n');
			const remainingDescriptionLines = descriptionLines.filter((line) => 
			{
				if (line.startsWith('@')) 
				{
					const [_, keyDirty, valueDirty] = line.match(/\s*^(@[^:]+)\s*:\s*(.+)\s*$/) ?? [];
					console.error(`[${keyDirty}, ${valueDirty}] = ${line}`);
					const value = valueDirty.trim();
					const key = keyDirty.trim().toLowerCase();

					if (key.startsWith('@oauth2')) 
					{
						const [full, name, flow, prop] = key.match(/@oauth2\.([a-zA-z-_]+)\.([a-zA-z-_]+)\.(.+)/) ?? [];
						if (name && flow && prop) 
						{
							this.configureOauth2Credentials(document, name, flow, prop, value);
						}

						else 
						{
							console.error(`Unrecognized key ${key}`);
						}
						return false;
					}

					configureDocumentProperties(key, document, value);
					return false;
				}
				return true;
			});
			document.info.description = remainingDescriptionLines.join('\n');
		}
	}

	private configureOauth2Credentials(document: OpenAPIV3.Document<{}>, name: string, flow: string, prop: string, value: string) 
	{
		document.components = document.components ?? {};
		document.components.securitySchemes = document.components.securitySchemes ?? {};
		const securityScheme: OpenAPIV3.OAuth2SecurityScheme = (document.components.securitySchemes[name] ?? {
			type: 'oauth2',
			flows: {}
		}) as OpenAPIV3.OAuth2SecurityScheme;
		document.components.securitySchemes[name] = securityScheme;

		if (flow === 'password') 
		{
			this.configureOauth2PasswordFlow(securityScheme, prop, value, document, name);
		}
	}

	private configureOauth2PasswordFlow(securityScheme: OpenAPIV3.OAuth2SecurityScheme, prop: string, value: string, document: OpenAPIV3.Document<{}>, name: string) 
	{
		securityScheme.flows['password'] = securityScheme.flows['password'] ?? {
			scopes: {},
			tokenUrl: prop
		};

		if (prop.startsWith('scopes')) 
		{
			const [lead, scopeName] = prop.split('.');
			securityScheme.flows['password'].scopes[scopeName] = value;
			document.security = [{
				[name]: [scopeName]
			}];
		}
		else if (prop === 'tokenurl') 
		{
			securityScheme.flows['password'].tokenUrl = value;
		}
	}

	private addPathEndpointsAndDocumentation(signature: TypeDoc.SignatureReflection, endpoint: TypeDoc.DeclarationReflection, httpMethods: string[], document: OpenAPIV3.Document<{}>, name: string, root: string) 
	{
		const requestParameters = signature.parameters?.filter(p => p.kindString === 'Parameter'
			&& p.decorators?.find(dec => dec.name === 'requestParam'));

		const queryParameters = signature.parameters?.filter(p => p.kindString === 'Parameter'
			&& p.decorators?.find(dec => dec.name === 'queryParam'));

		const bodyParameter = signature.parameters?.find(p => p.kindString === 'Parameter'
			&& p.decorators?.find(dec => dec.name === 'requestBody'));

		const decorators = endpoint.decorators?.filter(dec => httpMethods.indexOf(dec.name) >= 0 && dec.arguments?.path) ?? [];
		for (const decorator of decorators) 
		{
			//path
			const { path, endpointDocumentation } = this.createEndpointDocumentation(decorator, document, requestParameters, queryParameters, name, signature, bodyParameter, root);
			this.addEndpointWithDocumentation(decorator, document, path, endpointDocumentation);
		}
	}

	private createEndpointDocumentation(decorator: TypeDoc.Decorator, document: OpenAPIV3.Document<{}>, requestParameters: TypeDoc.ParameterReflection[] | undefined, queryParameters: TypeDoc.ParameterReflection[] | undefined, name: string, signature: TypeDoc.SignatureReflection, bodyParameter: TypeDoc.ParameterReflection | undefined, root: string) 
	{
		const path = OpenApiUtil.convertPathParameters(OpenApiUtil.stripQuotes(root)) 
			+  OpenApiUtil.convertPathParameters(OpenApiUtil.stripQuotes((decorator.arguments.path as string)));

		console.log(path);
		if (!document.paths![path]) 
		{
			// get the request parameters here
			const parameters: (OpenAPIV3.ReferenceObject | OpenAPIV3.ParameterObject)[] = [
				...requestParameters?.filter(rp => rp.type && rp.decorators?.find(dec => dec.name === 'requestParam'))
					.map<(OpenAPIV3.ReferenceObject | OpenAPIV3.ParameterObject)>(rp => ({
						name: OpenApiUtil.stripQuotes(rp.decorators!.find(dec => dec.name === 'requestParam')!.arguments?.paramName),
						in: 'path',
						description: rp.comment?.shortText ?? '',
						required: true,
						schema: this.schemaFromType(rp.type!) as any,
						style: 'simple'
					})) ?? [],
				...queryParameters?.filter(rp => rp.type && rp.decorators?.find(dec => dec.name === 'queryParam'))
					.map<(OpenAPIV3.ReferenceObject | OpenAPIV3.ParameterObject)>(qp => ({
						name: OpenApiUtil.stripQuotes(qp.decorators?.find(dec => dec.name === 'queryParam')?.arguments?.queryParamName),
						in: 'query',
						description: qp.comment?.shortText ?? '',
						required: false,
						schema: this.schemaFromType(qp.type!) as any,
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
			description: OpenApiUtil.simpleComment(signature.comment),
			requestBody: bodyParameter?.type ? {
				description: OpenApiUtil.simpleComment(bodyParameter.comment),
				content: {
					'application/json': {
						schema: this.schemaFromType(bodyParameter.type)
					}
				},
				required: true
			} as OpenAPIV3.RequestBodyObject : undefined,
			deprecated: !!signature.comment?.tags?.find(tag => tag.tagName === 'deprecated'),
			responses: {
				'200': {
					description: signature.comment?.returns ?? '',
					content: {
						'application/json': {
							schema: signature.type ? this.schemaFromType(signature.type) : {}
						}
					}
				}
			}
		};
		return { path, endpointDocumentation };
	}

	private addEndpointWithDocumentation(decorator: TypeDoc.Decorator, document: OpenAPIV3.Document<{}>, path: string, endpointDocumentation: { tags: string[]; summary: string; description: string; requestBody: OpenAPIV3.RequestBodyObject | undefined; deprecated: boolean; responses: { '200': { description: string; content: { 'application/json': { schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject; }; }; }; }; }) 
	{
		if (decorator.name === 'httpGet') 
		{
			document.paths![path]!.get = endpointDocumentation as any;
		}

		if (decorator.name === 'httpHead') 
		{
			document.paths![path]!.head = endpointDocumentation as any;
		}

		if (decorator.name === 'httpPost') 
		{
			document.paths![path]!.post = endpointDocumentation as any;
		}

		if (decorator.name === 'httpPut') 
		{
			document.paths![path]!.put = endpointDocumentation as any;
		}

		if (decorator.name === 'httpDelete') 
		{
			document.paths![path]!.delete = endpointDocumentation as any;
		}

		if (decorator.name === 'httpPatch') 
		{
			document.paths![path]!.patch = endpointDocumentation as any;
		}
	}

	private addDefaultShims() 
	{
		this.AddShim('Promise', (type) => this.deriveFromPromiseOfContent(type));
		this.AddShim('IJsonData', (type) => this.deriveFromPromiseOfContent(type));
		this.AddShim('OkNegotiatedContentResult', (type) => this.deriveFromFirstTypeArgument(type));
		this.AddShim('Moment', () => ({ type: 'string', format: 'date-time' }));
		this.AddShim('Date', () => ({ type: 'string', format: 'date-time' }));
		this.AddShim('unknown', () => ({ type: 'object' }));
	}

	private findInTypeDoc(nodes: TypeDoc.DeclarationReflection[], matcher: (item: TypeDoc.DeclarationReflection, parents: TypeDoc.DeclarationReflection[]) => boolean, recurse: number = -1, parents: TypeDoc.DeclarationReflection[] = []) 
	{
		const matches: TypeDoc.DeclarationReflection[] = [];
		for (const item of nodes) 
		{
			if (matcher(item, parents)) 
			{
				matches.push(item);
			}

			if ((recurse != 0) && item.children && item.children.length) 
			{
				matches.push(...this.findInTypeDoc(item.children, matcher, recurse - 1, [...parents, item]));
			}
		}
		return matches;
	}

	private registerType(name: string, typeNode: TypeDoc.DeclarationReflection) 
	{
		if (this.shimRegistry[name]) 
		{
			// I think this is fine, this just means we got a real type for what was previously referenced?
			console.warn(`Overwriting existing type for ${name}`);
		}
		this.typeRegistry[name] = typeNode;
	}

	private referenceSchema(name: string, typeArguments?:TypeDoc.Type[] | undefined): OpenAPIV3.ReferenceObject 
	{
		const typeReferenceArguments = (typeArguments as TypeDoc.ReferenceType[]) ?? [];
		const finalName = [name, ...typeReferenceArguments.map(t => t.name)].join('_');
		if (!this.schemaRegistry[finalName]) 
		{
			if (!this.typeRegistry[name]) 
			{
				// For some reason we don't know what this type is, so we can't handle it.
				console.error(`referenceSchema was asked for ${name} which has not been located`);
				return {
					$ref: 'ERR'
				};
			}

			// put in a placeholder because we are evaluating this type and need to not cause an infinite loop!
			this.schemaRegistry[finalName] = {};

			const node = this.typeRegistry[name] as any;

			for(let i = 0; i < (node.typeParameter?.length ?? 0); i++)
			{
				const typeParam = node.typeParameter![i];
				const typeAssignment = typeReferenceArguments[i];
				this.typeAssignments[typeParam.name] = (typeAssignment as any).name;
			}

			// Descend from the type node into the relevant type.  THis should be any of interface, Type Alias, class
			if (node.kindString === 'Interface') 
			{
				this.schemaRegistry[finalName] = this.schemaFromObject(node as any);
			}
			else if (node.kindString === 'Class') 
			{
				this.schemaRegistry[finalName] = this.schemaFromObject(node as any);
			}

			else 
			{
				this.schemaRegistry[finalName] = this.schemaFromType(node.type as any) as OpenAPIV3.SchemaObject;
			}
		}

		return {
			$ref: `#/components/schemas/${finalName}`
		};
	}

	private exportReferencedSchemas(): OpenAPIV3.ComponentsObject 
	{
		const compiledSchemas: { [key: string]: OpenAPIV3.SchemaObject; } = {};
		for (const schemaName of Object.keys(this.schemaRegistry)) 
		{
			if (!this.schemaRegistry[schemaName]) 
			{
				continue;
			}

			compiledSchemas[schemaName] = this.schemaRegistry[schemaName];
		}
		return {
			schemas: compiledSchemas
		};
	}


	private schemaFromType(type: TypeDoc.Type): OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject 
	{
		if (type.type === 'literal') 
		{
			const literalType = type as TypeDoc.LiteralType;
			return {
				type: typeof(literalType.value) as 'string' | 'number' | 'boolean',
				enum: [literalType.value]
			};
		}

		if (type.type === 'reference') 
		{
			const referenceType = type as TypeDoc.ReferenceType;

			// Apply any shims
			if (this.shimRegistry[referenceType.name]) 
			{
				return this.shimRegistry[referenceType.name](referenceType);
			}

			if (referenceType.reflection?.kindString === 'Type alias' || referenceType.reflection?.kindString === 'Interface' || referenceType.reflection?.kindString === 'Class') 
			{
				return this.referenceSchema(referenceType.name);
			}
			else if (referenceType.reflection?.kindString === 'Type parameter') 
			{
				return this.typeAssignments[referenceType.name];
			}
			else if (referenceType.reflection?.kindString === 'Enumeration')
			{
				const enums = (referenceType.reflection as TypeDoc.ContainerReflection).children?.map(e => (e.type as TypeDoc.LiteralType));
				return {
					type: enums ? typeof(enums[0].value) as 'string' | 'number' | 'boolean' : 'string',
					enum: enums?.map(e => e.value) ?? []
				};			
			}
			if (this.typeRegistry[referenceType.name]) 
			{
				return this.referenceSchema(referenceType.name, referenceType.typeArguments);
			}
			else if(this.typeAssignments[referenceType.name])
			{
				return this.schemaFromType({ type: 'reference', name: this.typeAssignments[referenceType.name]} as TypeDoc.ReferenceType);
			}
			else 
			{
				throw new Error(`Unknown reference type: ${referenceType.name}`);
			}
		}

		if (type.type === 'intrinsic') 
		{
			const intrisicType = type as TypeDoc.IntrinsicType;
			switch (intrisicType.name) 
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
					type: 'null'
				} as any;
			case 'void':
				return {
					type: 'null'
				} as any;
			default:
				throw new Error(`Unrecognized intrinsic type ${intrisicType.name}`);
			}
		}

		if (type.type === 'array') 
		{
			const arrayType = type as TypeDoc.ArrayType;
			const typeSchema = this.schemaFromType(arrayType.elementType);
			return {
				type: 'array',
				items: typeSchema
			};
		}

		if (type.type === 'reflection') 
		{
			const reflection = type as TypeDoc.ReflectionType;
			if (!reflection.declaration.children) 
			{
				if (reflection.declaration.indexSignature?.type) 
				{
					return {
						type: 'object',
						additionalProperties: this.schemaFromType(reflection.declaration.indexSignature.type)
					};
				}

				console.error('Got a reflection with no children.', reflection.declaration.sources);
				return {};
			}
			return this.schemaFromObject(reflection.declaration); // name = __type, originalName = __Type
		}

		if (type.type === 'intersection') 
		{
			const intersectionType = type as TypeDoc.IntersectionType;
			const intersectionSchema: OpenAPIV3.SchemaObject = {
				allOf: []
			};

			for (const subtype of intersectionType.types) 
			{
				intersectionSchema.allOf!.push(this.schemaFromType(subtype));
			}

			return intersectionSchema;
		}

		if (type.type === 'union') 
		{
			const unionType = type as TypeDoc.UnionType;
			const unionSchema: OpenAPIV3.SchemaObject = {
				oneOf: []
			};

			// TODO:
			// Handle strictly literal unions as enumerations
			// Filter literal nulls and instead set the nullable property.
			for (const subtype of unionType.types) 
			{
				unionSchema.oneOf!.push(this.schemaFromType(subtype));
			}

			return unionSchema;
		}

		if (type.type === 'tuple') 
		{
			const tupleType = type as TypeDoc.TupleType;
			const schemas = tupleType.elements.map(this.schemaFromType);
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


	private schemaFromObject(obj: TypeDoc.DeclarationReflection): OpenAPIV3.SchemaObject 
	{
		const schemaStart: OpenAPIV3.SchemaObject = {
			type: 'object',
			description: OpenApiUtil.simpleComment(obj.comment)
		};

		// This could just be an index type { [key:type]: type } 
		if (obj.indexSignature?.type) 
		{
			schemaStart.additionalProperties = this.schemaFromType(obj.indexSignature.type);
		}

		if (!obj.children?.filter(prop => prop.kindString === 'Property')?.length) 
		{
			// If we have neither properties nor an index, then this is an empty object 
			// and that's rarely expected.
			if (!obj.indexSignature?.type) 
			{
				console.warn(`Object ${obj.name} provided with no Children`, obj.sources);
			}
			return schemaStart;
		}

		schemaStart.properties = {};
		schemaStart.required = [];
		return obj.children.filter(prop => prop.kindString === 'Property')
			.reduce((collection, cursor) => 
			{
				if (cursor.type) 
				{
					const schema = this.schemaFromType(cursor.type);
					collection.properties![cursor.name] = schema;
					if (!(OpenApiUtil.isReferenceObject(schema))) 
					{
						schema.title = schema.description = OpenApiUtil.simpleComment(cursor.comment);
					}
					if(!cursor.flags.isOptional)
					{
						collection.required?.push(cursor.name);
					}
				}
				return collection;
			}, schemaStart);
	}

	/**
	 * This shim can act to 'unwrap' a generic type that has a wrapper.  
	 * For example, Promise<T> or OkNegotiatedContentResult<T>
	 */
	private deriveFromFirstTypeArgument(type: TypeDoc.ReferenceType) 
	{
		return this.schemaFromType(type.typeArguments![0]);
	}

	/**
	 * This shim gets a first pass at a promise.  We need to special case promises that may be coming out of
	 * a controller response.
	 *
	 * Essentially, we process and remove any *Result that isn't an OK result.
	 * TODO: I think this ended up being more complex than it needs to be.  Instead of looking for Ok content first
	 * and then falling back on "Anything not ActionResult", we could probable combine into one case of 
	 * "Anything that is not ActionResult + Anything that is OkNegotiatedResult" in one filter.
	 */
	private deriveFromPromiseOfContent(type: TypeDoc.ReferenceType) 
	{
		const typeArgument = type.typeArguments![0];
		if (typeArgument.type === 'union') 
		{
			// Search through the unions, and if any are 'OkNegotiatedContentResult' only include those.
			const unionType = typeArgument as TypeDoc.UnionType;
			const okTypes = unionType.types.filter(t => t.type === 'reference' && (t as TypeDoc.ReferenceType).name === 'OkNegotiatedContentResult')
				.map(t => this.schemaFromType((t as TypeDoc.ReferenceType).typeArguments![0]));

			// If there are multiple potential results, return a union of them.
			if (okTypes.length > 1) 
			{
				return this.schemaFromType({
					type: 'union',
					types: okTypes
				} as unknown as TypeDoc.UnionType);
			}

			// If there's only one match, we don't need to union
			if (okTypes.length == 1) 
			{
				return okTypes[0];
			}

			// Try to eliminate all status code type results
			const statusReferences = unionType.types.filter(t => !(t.type === 'reference'
				&& ((t as TypeDoc.ReferenceType).reflection as TypeDoc.DeclarationReflection)?.implementedTypes?.find(t => t.type === 'reference' && (t as TypeDoc.ReferenceType).name === 'IHttpActionResult')));
			const statusTypes = statusReferences
				.map(t => 
				{
					return this.schemaFromType(t);
				});

			// If there are multiple potential results, return a union of them.
			if (statusTypes.length > 1) 
			{
				return this.schemaFromType({
					type: 'union',
					types: statusTypes
				} as unknown as TypeDoc.UnionType);
			}

			// If there's only one match, we don't need to union
			if (statusTypes.length == 1) 
			{
				return statusTypes[0];
			}

			// This is probably fine?
			console.warn('Found a union of types but none were ok types', typeArgument);
		}
		return this.schemaFromType(type.typeArguments![0]);
	}
}


function configureDocumentProperties(key: string, document: OpenAPIV3.Document<{}>, value: string) 
{
	switch (key) 
	{
	case '@title':
		document.info.title = value;
		break;
	case '@email':
			document.info.contact!.email = value;
		break;
	case '@version':
		document.info.version = value;
		break;
	case '@name':
			document.info.contact!.name = value;
		break;
	case '@url':
			document.info.contact!.url = value;
		break;
	case '@licence.name':
			document.info.license!.name = value;
		break;
	case '@license.url':
			document.info.license!.url = value;
		break;
	case '@termsofservice':
		document.info.termsOfService = value;
		break;
	default:
		console.error(`Unrecognized key ${key}`);
		break;
	}
}


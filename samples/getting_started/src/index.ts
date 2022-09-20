import 'reflect-metadata';
import express from 'express';
import { BaseHttpController, controller, httpPost, InversifyExpressServer, requestBody } from 'inversify-express-utils';
import { Container, inject } from 'inversify';
import { AddressInfo } from 'net';
import moment, { Moment } from 'moment';
import { randomUUID } from 'crypto';

const container = new Container();
const ILoggerRequestId = Symbol('ILoggerRequestId');

enum Direction {
	Up = 1,
	Down,
	Left,
	Right,
}

/**
 * You can add a comment above a type that you use for a request body
 * to document the expectations of the data submitted.
 * 
 * This is typrically exposed as a 'description' in the Schema for the generated model. {TST1}
 */
interface IBodyData
{
	/**
	 * All built-in native types are supported. {TST2}
	 */
	stringType: string;

	/**
	 * The type will be conveyed through the openApi schema as well. {TST3}
	 */
	numberType: number;

	/**
	 * Optional properties will be marked as such. {TST4}
	 */
	boolType?: boolean;

	/**
	 * Enumerations and unions of literals will hopefully be supported in
	 * an upcoming release. {TST5}
	 */
	enumeratedLiterals: 'one' | 'two' | 'three';

	/**
	 * Raw enumeration
	 */
	enumeration: Direction;

	/**
	 * If you declare an anonymous inline type, the shape of the data will still be
	 * discovered. {TST6}
	 */
	inferredType: {
		subProperty1: string;
		/**
		 * This comment will apply because it is part of the type. {TST7}
		 */
		subProperty2: 'string literal';
	};

	/**
	 * Indexes are discovered and associated with additionalProperty support. {TST8}
	 */
	indexedType: { [key: string]: number};

	/**
	 * Even advanced type math like unions and intersections are supported! {TST9}
	 */
	unionType?: string | { 
		typeOne: string;
	} |  {
		typeTwo: string;
	} | null;	
}

/**
 * All comment-parsing and type-determination is applied on the response
 * body as well. {TST10}
 */
interface IReturnData
{
	/**
	 * Moment is special-cased to handle its specific string formatting {TST11}
	 */
	timestamp: Moment;

	/**
	 * In a future release, we hope to add additional comment options
	 * like providing custom formats to mark things like uuids. {TST12}
	 */
	uuid: string;
}

/**
 * You need your controllers to be exported so the documentation system will pick them 
 * up. {TST13}
 */
@controller('/api')
export class ApiController extends BaseHttpController 
{
	private readonly _requestId: string;
	public constructor(@inject(ILoggerRequestId) requestId: string) 
	{
		super();
		this._requestId = requestId;
	}

	/**
	 * The first line of comments is used as the short comment shown inline. {TST14}
	 * 
	 * You can provide additional comments in subsequent sections, and they can be shown in the OpenApi documentation if the specific
	 * endpoint is expanded.
	 * Note that you _can_ use some markdown here, although the specific of what will be rendered may change
	 * depending on the [specific editor or visualizer](https://editor-next.swagger.io/) you use.
	 * 
	 * Check out the original project on [![GitHub](https://badgen.net/badge/icon/ts-openapi-gen?icon=github&label)](https://github.com/SkywardApps/ts-openapi-gen)
	 * 
	 * {TST15}
	 * 
	 * @param body This documentation will be applied to the post body (json payload) as comment ahead of the model. {TST16}
	 * @returns This can be used to describe the return in its context of this function.  The type's comments will be applied to the
	 * schema of the response body. {TST17}
	 */
	@httpPost('/post')
	public async acceptPostBody(@requestBody() body: IBodyData) : Promise<IReturnData>
	{
		return {
			timestamp: moment(),
			/**
			 * This inline comment won't appear in the documentation because it isn't part of the type. {TST18}
			 */
			uuid: this._requestId
		};
	}
}

// Build our services
// Create a unique request id that can be included in all logs to trace related statements.
container.bind<string>(ILoggerRequestId).toDynamicValue((context) => randomUUID()).inRequestScope();

const app = express();
const server = new InversifyExpressServer(container, null, { rootPath: '/' }, app);
const appConfigured = server.build();
const serve = appConfigured.listen(process.env.PORT || 3000, () => 
{ 
	console.log(`App running on ${(serve.address() as AddressInfo).port}`); 
});
import * as TypeDoc from 'typedoc';
import { OpenAPIV3 } from 'openapi-types';

export class OpenApiUtil 
{
	public static convertPathParameters(str: string) {
		try 
		{
			return str.replace(/:([^/]+)/g, '{$1}');
		}
		catch (err) 
		{
			console.error(err);
			return '<ERROR>';
		}
	}

	public static isReferenceObject(obj: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject): obj is OpenAPIV3.ReferenceObject {
		return !!(obj as OpenAPIV3.ReferenceObject).$ref;
	}

	public static simpleComment(comment: TypeDoc.Comment | undefined) {
		return [comment?.shortText, comment?.text].filter(text => text?.length).join('\n\n');
	}
	
	public static stripQuotes(str: string) 
	{
		try 
		{
			return str.substring(1, str.length - 1);
		}
		catch (err) 
		{
			console.error(err);
			return '<ERROR>';
		}
	}
}

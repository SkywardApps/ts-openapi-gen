#!/usr/bin/env node

import yargs from 'yargs';
import fs from 'fs';
import { exit } from 'process';
import { OpenApiDocumentationGenerator } from './OpenApiDocumentationGenerator';
import { isPromise } from 'util/types';

function main(args: {
    typedoc: string;
    out: string;
	description: string | undefined;
})
{	
	if(!args.typedoc.length)
	{
		console.error('No typedoc provided.');
		process.exit(-1);
	}
	
	if(!args.out.length)
	{
		console.error('No out file provided.');
		process.exit(-1);
	}

	const generator = new OpenApiDocumentationGenerator(args.typedoc, args.description);
	generator.GenerateOpenApiSchema()
		.catch((err) => { console.error(err); exit(-1); })
		.then((document) => 
		{
			// write out this document
			fs.writeFileSync(args.out, JSON.stringify(document, null, 2));
			console.log(`Wrote file to ${args.out}`);
			process.exit(0);
		});
}


const argv = yargs(process.argv.slice(2)).options({
	typedoc: { type: 'string', default: './typedoc.json', description: 'The generated typedoc json file.'},
	description: { type: 'string', description: 'A markdown file to add as an API description.'},
	out: {type: 'string', default: './openapi.json', description: 'The name of the file to write the schema to; defaults to `openapi.json` if not provided. ' }
})
	.help()
	.argv;


if(isPromise(argv))
{
	argv.then(main);
}
else
{
	main(argv);
}

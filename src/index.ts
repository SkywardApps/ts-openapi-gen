#!/usr/bin/env node

import yargs from 'yargs';
import fs from 'fs';
import { exit } from 'process';
import { OpenApiDocumentationGenerator } from './OpenApiDocumentationGenerator';
import { isPromise } from 'util/types';

function main(args: {
	tsconfig: string;
    typedoc: string;
    out: string;
})
{
	if(!args.tsconfig.length)
	{
		console.error('No tsconfig file provided.');
		process.exit(-1);
	}
	
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

	const generator = new OpenApiDocumentationGenerator(args.out, args.typedoc, args.tsconfig);
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
	tsconfig: { type: 'string', default: './tsconfig.json', description: 'Points to the tsconfig for your project; required to be able to interpret the types included and referenced.' },
	typedoc: { type: 'string', default: './typedoc.json', description: 'The generated typedoc json file.'},
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

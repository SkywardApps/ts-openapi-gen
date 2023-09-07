#!/usr/bin/env node

import yargs from 'yargs';
import fs from 'fs';
import { exit } from 'process';
import { OpenApiDocumentationGenerator } from './OpenApiDocumentationGenerator';
import { isPromise } from 'util/types';

function main(args: {
	tsconfig: string;
    entrypoint: string;
    out: string;
})
{
	if(!args.tsconfig)
	{
		console.error('No tsconfig file provided.');
		process.exit(-1);
	}
	
	if(!args.entrypoint)
	{
		console.error('No entrypoint provided.');
		process.exit(-1);
	}
	
	if(!args.out)
	{
		console.error('No out file provided.');
		process.exit(-1);
	}
	
	const generator = new OpenApiDocumentationGenerator(args.out, args.entrypoint, args.tsconfig);
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
	entrypoint: { type: 'string', default: './src/controllers', description: 'The path to search for entrypoints; in this case, the controllers annotated with `@controller` that provide the endpoints for your project.'},
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

import yargs from 'yargs';
import fs from 'fs';
import { exit } from 'process';
import { OpenApiDocumentationGenerator } from './OpenApiDocumentationGenerator';

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

const generator = new OpenApiDocumentationGenerator(argv.out, argv.entrypoint, argv.tsconfig);
generator.GenerateOpenApiSchema()
	.catch((err) => { console.error(err); exit(-1); })
	.then((document) => 
	{
		// write out this document
		fs.writeFileSync(argv.out, JSON.stringify(document, null, 2));
		console.log(`Wrote file to ${argv.out}`);
		process.exit(0);
	});

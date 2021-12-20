module.exports = {
	parser: '@typescript-eslint/parser',  // Specifies the ESLint parser
	env: {
		'node': true,
		'es6': true
	},
	extends: [
		'eslint:recommended',
		'plugin:@typescript-eslint/eslint-recommended'
	],
	plugins: [
		'@typescript-eslint'
	],
	parserOptions: {
		ecmaVersion: 2018,  // Allows for the parsing of modern ECMAScript features
		sourceType: 'module',  // Allows for the use of imports
		ecmaFeatures: {
			modules: true
		},
	},
	rules: {
		// Place to specify ESLint rules. Can be used to overwrite rules specified from the extended configs
		// e.g. '@typescript-eslint/explicit-function-return-type': 'off',
		'brace-style': ['error', 'allman', { 'allowSingleLine': true }],
		'@typescript-eslint/explicit-member-accessibility': ['error', { overrides: { parameterProperties: 'off' } }],
		'@typescript-eslint/no-parameter-properties': 'error',
		'@typescript-eslint/naming-convention': [
			'error',
			{
				'selector': 'interface',
				'format': ['PascalCase'],
				'custom': {
					'regex': '^I[A-Z]',
					'match': true
				}
			}
		],
		'indent': ['error', 'tab'],
		'no-mixed-spaces-and-tabs': 'error',
		'no-trailing-spaces': 'off',
		'no-unused-vars': 'off',
		'react/prop-types': 'off',
		'semi': ['error', 'always'],
		'no-extra-semi': 'off',
		'quotes': ['error', 'single'],
	},
	settings: {
		react: {
			version: 'detect',  // Tells eslint-plugin-react to automatically detect the version of React to use
		},
	},
};
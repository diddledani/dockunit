'use strict';

import * as fs from 'fs';
import minimist, { ParsedArgs } from 'minimist';
import { containers as Containers } from './containers';
import * as spawn from 'child_process';
// import * as packageObject from '../package.json';

let argv = minimist(process.argv.slice(2));

type Config = {
	path: string,
	verbose: boolean,
	help: boolean,
	version: boolean,
	container: boolean
}

type Args = {
	'du-verbose': boolean,
	'du-container': boolean,
	help: boolean,
	version: boolean,
};

/**
 * Supported dockunit arguments/options
 */
export const defaultArgs: Args = {
	'du-verbose': false,
	'du-container': false,
	help: false,
	version: false
};

/**
 * Process command line options and arguments
 */
function processArgs(args: ParsedArgs) {
	let testArgs = args;
	let config: Config = {
		path: '',
		verbose: false,
		help: false,
		version: false,
		container: false,
	};

	if (args['du-verbose']) {
		let verbose = parseInt(args['du-verbose']);

		if (isNaN(verbose)) {
			verbose = 1;
		}

		config.verbose = !!verbose;
	} else {
		config.verbose = false;
	}

	if (typeof args['du-container'] !== 'undefined' && parseInt(args['du-container']) >= 0) {
		config.container = !!parseInt(args['du-container']);
	}

	if (args.help) {
		config.help = true;
	}


	if (args.version) {
		config.version = true;
	}

	if (args._.length) {
		config.path = args._[0];

		// First argument is assumed to be the dockunit path
		testArgs._.shift();
	}

	for (var key in testArgs) {
		if (key !== '_' && typeof defaultArgs[key] !== 'undefined') {
			delete testArgs[key];
		}
	}
};

/**
 * Main script command
 */
export const execute = function() {
	let json: JSON;
	const {config, args} = processArgs(argv);

	if (global.config.help) {
		var help = '\nUsage:\n'.yellow +
			'  dockunit <path-to-project-directory> [options]\n' +
			'\n' +
			'\nOptions:'.yellow +
			'\n  --du-verbose'.green + ' Output various lines of status throughout testing' +
			'\n  --help'.green + ' Display this help text' +
			'\n  --version'.green + ' Display current version' +
			'\n';
		console.log(help);
		process.exit(0);
	}

	if (global.config.version) {
		console.log('\nDockunit ' + packageObject.version + ' by Taylor Lovett\n');
		process.exit(0);
	}

	var docker = spawn('docker', []);

	docker.on('error', function(error: Error) {
		console.error('\nDocker is not installed or configured properly'.red);
	});

	docker.on('exit', function(code: number) {
		try {
			json = JSON.parse(fs.readFileSync(global.config.path + '/Dockunit.json', 'utf8'));
		} catch (exception) {
			console.error('\nCould not parse Dockunit.json'.red);
			process.exit(255);
		}

		let containers = new Containers(json.containers);

		containers.run().then((returnCodes) => {
			let errors = 0;

			for (const code of returnCodes) {
				if (code !== 0) {
					errors++;
				}
			}

			if (!returnCodes.length) {
				console.log(('\nNo containers finished').bgYellow + '\n');
			} else {
				if (!errors) {
					console.log(('\n' + returnCodes.length + ' container(s) passed').bgGreen + '\n');
				} else {
					console.error(('\n' + (returnCodes.length - errors) + ' out of ' + returnCodes.length + ' container(s) passed').bgRed + '\n');
					process.exit(1);
				}
			}
		}, global.config.container);
	});
};
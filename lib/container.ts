'use strict';

import { spawn } from 'child_process';

export type ContainerDefinition = {
	image: string,
	testCommand: string,
	prettyName: string,
	beforeScripts: string[]
}

type Options = { stdio: string | string[] };

/**
 * Initialize a new container
 *
 * @param containerArray
 * @constructor
 */
export class Container {
	image: string;
	testCommand: string;
	prettyName: string;
	beforeScripts: string[];

	constructor(container: ContainerDefinition) {
		this.image = container.image;
		this.testCommand = container.testCommand;
		this.prettyName = container.prettyName;
		this.beforeScripts = container.beforeScripts;
	}
    /**
     * Pull docker image for current container
     */
	pullImage() {
		return new Promise((resolve, reject) => {
			if (global.config.verbose) {
				console.log(`Pulling docker image: ${this.image}`.green);
			}
			var pull = spawn('docker', ['pull', this.image]);
			pull.on('exit', (code) => {
				if (0 !== code) {
					console.error(`Could not pull Docker image: ${this.image}`.red);
					return reject();
				}
				resolve();
			});
		});
	}
    /**
     * Start and mount Docker container
     */
	startAndMountContainer() {
		return new Promise<string>((resolve, reject) => {
			console.log('Starting container...'.green);
			let containerId: string;
			const self = this, run = spawn('docker', ['run', '-d', '-v', `${global.config.path}:/app/test`, '-w', '/app/test', '-it', self.image, '/bin/bash']);
			// Dump errors to the stderr output so they can be seen.
			run.stderr.on('data', (data) => {
				console.error('ERROR: ', data.toString());
				console.error('COMMAND: ', 'docker', 'run', '-d', '-v', `${global.config.path}:/app/test`, '-w', '/app/test', '-it', self.image, '/bin/bash');
			});
			// Sanitize and store container ID
			run.stdout.on('data', (data) => {
				containerId = data.toString().trim().replace(/[^a-z0-9]/ig, '');
			});
			run.on('exit', (code) => {
				if (0 !== code || !containerId) {
					console.error('Failed to start and mount Docker container'.red);
					return reject();
				}
				resolve(containerId);
			});
		});
	}
    /**
     * Create a copy of mounted files for later
     *
     * @param containerId
     */
	backupFiles(containerId: string) {
		return new Promise<string>((resolve, reject) => {
			if (global.config.verbose) {
				console.log(`Backing up volume files on container ${this.prettyName}`.green);
			}
			var exec = spawn('sh', ['-c', `docker exec ${containerId} bash -c "source ~/.bashrc && cp -p -r /app/test /app/backup"`]);
			exec.on('exit', (code) => {
				if (code !== 0) {
					console.error('Failed to backup up files'.red);
					return reject();
				}
				resolve(containerId);
			});
		});
	}
    /**
     * Run specific before script
     *
     * @param containerId
     * @param script
     */
	runBeforeScript(containerId: string, script: string) {
		return new Promise<string>((resolve, reject) => {
			const opts: Options = { stdio: ['ignore', 'ignore', 'ignore'] };
			if (global.config.verbose > 1) {
				opts.stdio = 'inherit';
			}
			const before = spawn('sh', ['-c', `docker exec ${containerId} ${script}`], opts);
			before.on('exit', (code) => {
				if (0 !== code) {
					console.error(`Failed to run before script: ${script}`.red);
					return reject();
				}
				resolve(containerId);
			});
		});
	}
    /**
     * Run before scripts for container
     *
     * @param containerId
     */
	async runBeforeScripts(containerId: string) {
		if (this.beforeScripts && this.beforeScripts.length) {
			if (global.config.verbose) {
				console.log('Running before scripts'.green);
			}
			for (const s of self.beforeScripts) {
				await this.runBeforeScript(containerId, s);
			}
		}
		return containerId;
	}
    /**
     * Run unit tests for container
     *
     * @param containerId
     */
	runTests(containerId: string) {
		var testArgString = '';
		return new Promise<string>((resolve, reject) => {
			if (global.testArgs._ && global.testArgs._.length) {
				testArgString = global.testArgs._.join(' ');
			}
			for (var key in global.testArgs) {
				if ('_' !== key) {
					if (typeof global.testArgs[key] !== 'boolean') {
						testArgString += ` --${key}=${global.testArgs[key]}`;
					}
					else {
						if (global.testArgs[key]) {
							testArgString += ` --${key}`;
						}
					}
				}
			}
			if (global.config.verbose) {
				console.log(`Running "${this.testCommand} ${testArgString}" on container ${self.prettyName}`.green);
			}
			var exec = spawn('sh', ['-c', `docker exec ${containerId} bash -c "source ~/.bashrc && ${self.testCommand} ${testArgString}" 1>&2`], { stdio: 'inherit' });
			exec.on('exit', (code) => {
				if (code !== 0) {
					console.error('Failed to run test command'.red);
					return reject();
				}
				resolve({containerId, code});
			});
		});
	}
    /**
     * Clean up volume files in container
     *
     * @param containerId
     */
	cleanupFiles(containerId: string) {
		return new Promise<string>((resolve, reject) => {
			if (global.config.verbose) {
				console.log(`Restoring volume files on container ${this.prettyName}`.green);
			}
			var exec = spawn('sh', ['-c', `docker exec ${containerId} bash -c "source ~/.bashrc && rm -rf /app/test/* && cp -p -r /app/backup/* /app/test" 1>&2`], { stdio: 'inherit' });
			exec.on('exit', (code) => {
				if (code !== 0) {
					console.error('Failed to restore volume files'.red);
					return reject();
				}
				resolve(containerId);
			});
		});
	}
    /**
     * Stop Docker container
     *
     * @param containerId
     */
	stopContainer(containerId: string) {
		return new Promise<string>((resolve, reject) => {
			const stop = spawn('docker', ['stop', containerId]);
			stop.on('exit', (code) => {
				if (0 !== code) {
					console.error(`Could not stop container: ${containerId}`.red);
					return reject();
				}

				if (global.config.verbose) {
					console.log('Stopped container'.green);
				}
				resolve(containerId);
			});
		});
	}
    /**
     * Remove Docker container
     *
     * @param containerId
     */
	removeContainer(containerId: string) {
		return new Promise<string>((resolve, reject) => {
			const remove = spawn('docker', ['rm', '-v', containerId]);
			remove.on('exit', (code) => {
				if (0 !== code) {
					console.error(`Could not remove container: ${containerId}`.red);
					return reject();
				}
				
				if (global.config.verbose) {
					console.log('Removed container'.green);
				}
				resolve(containerId);
			});
		});
	}
    /**
     * Run tests on given container object
     *
     * @param finishedCallback
     */
	async run() {
		const self = this;
		console.log(`\nTesting on container ${self.prettyName}`.green);
		try {
			await this.pullImage();
			const containerID: string = await this.startAndMountContainer();

			try {
				await this.backupFiles(containerID);
				await this.runBeforeScripts(containerID);
				await this.runTests(containerID);
				await this.cleanupFiles(containerID);
			} catch {
				try {
					await this.stopContainer(containerID);
					await this.removeContainer(containerID);
				} finally {
					return 255;
				}
			}
		} catch {
			return 255;
		}

		return 0;
	}
}












export const container = Container;

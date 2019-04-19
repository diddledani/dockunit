'use strict';

import { Container, ContainerDefinition } from './container';

/**
 * Initialize new containers object
 *
 * @param containersArray
 * @constructor
 */
class Containers {
	containers: Container[] = [];

	constructor(containersArray: ContainerDefinition[]) {
		for (const def of containersArray) {
			this.containers.push(new Container(def));
		}
	}
    /**
     * Run all containers
     */
	async run(containerId: string): Promise<number[]> {
		let returnCodes: number[] = [];

		if (typeof containerId !== 'undefined' && null !== containerId) {
			const code = await this.containers[containerId].run();
			returnCodes.push(code);
			return returnCodes;
		}
		
		for (const container of this.containers) {
			returnCodes.push(await container.run());
		}
		return returnCodes;
	}
}



export const containers = Containers;
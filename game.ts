export interface Entity {
  id: string;
  entityId: string;
  tags: { [tagId: string]: boolean };
}

export interface ContainerContentRecord {
  entityId: string;
  instances: { [id: string]: true };
}

export interface Item extends Entity {
  stackable: boolean;
  dimensions: Dimensions;
  containerId?: string; // reference to the container it is in
}

/** ex. {
 *  apple: ['apple_1', 'apple_2'],
 *  coinstack: ['coinstack_3']
 * } 
 * 
 * Items are mapped entityId to string array of instance Ids
 * */
export interface ItemMap {
  [entityId: string]: string[];
}

/**
 * Container
 * Represents some sort of container that holds goods
 * Limits can be placed with at least one of slots, space, and capacity
 * Each item = 1 slot, each stack = 1 slot unless otherwise indicated
 * Capacity is weight, this is important for things like caravans and bags
 * Space is available physical space
 */
export interface Container extends Entity {

  limits: {
    // number of slots for goods
    slots: {
      used: number;
      max: number;
    };
    // space for goods
    space: {
      used: number;
      max: number;
    };
    // weight for goods
    weight: {
      used: number;
      max: number;
    };
  }
  contents: {
    [entityId: string]: ContainerContentRecord;
  };
}

export interface ContainerLimitConfig {
  slots?: number;
  weight?: number;
  space?: number
}

export interface Dimensions {
  slots: number;
  weight: number;
  space: number;
}

export interface EntityStore {
  ids: string[];
  instances: { [id: string]: Entity };
}

export interface State {
  nextId: number;
  tickCount: number;
  stepCount: number;
  config: {
    running: boolean;
    timeBetweenTicks: number;
  };
  entities: { [entityId: string]: EntityStore };
}

export interface Apple extends Item {
  spoilage: number;
}

/** An Item that represents a stack of some number of computationally identical things, i.e. money */
export interface Stack extends Item {
  units: number;
  unitDim: Dimensions; // tracks dimensions per unit
  itemId: string; // the stackable item it represents
}

export interface CoinStack extends Stack {
  itemId: 'coin';
}

/** Definitions
 * These things define the specs behind an item. weight, size, name, description
 */
export const Definitions = {
  apple: {
    name: 'Apple',
    description: 'Tasty'
  },
  coin: {
    name: 'Coin',
    description: 'Valuable piece of metal',
  }
}

/** Entities
  Entities are the instances of objects that can exist in the game, this is basically a hashmap of different entities and their helper functions
  Since we are using a functional programming paradigm, we need to define functions that apply to some objects as opposed to creating objects with functions (OOP)
  **/
export const Entities = {
  create: (state: State, entityId: string): Entity => {
    return {
      id: `${entityId}_${Util.State.getGuid(state)}`,
      entityId,
      tags: {}
    };
  },
  Container: {
    entityId: 'container',
    create: (state: State, limits: ContainerLimitConfig): Container => {
      const ret: Container = {
        ...Entities.create(state, Entities.Container.entityId),
        contents: {},
        limits: {
          space: {
            used: 0,
            max: 0
          },
          slots: {
            used: 0,
            max: 0
          },
          weight: {
            used: 0,
            max: 0
          }
        }
      };

      Object.keys(limits).forEach((limitId) => {
        ret.limits[limitId] = {
          used: 0,
          max: limits[limitId]
        };
      });

      Util.State.addEntity(state, ret);
      return ret;
    },
    getContentRecord: (
      container: Container,
      entityId: string
    ): ContainerContentRecord => {
      return container.contents[entityId];
    },
    listInstances: (container: Container, entityId: string): string[] => {
      if (!container.contents[entityId]) {
        return [];
      }
      return Object.keys(container.contents[entityId].instances);
    },
    countInstances: (container: Container, entityId: string): number => {
      const record = Entities.Container.getContentRecord(container, entityId);
      if (!record) {
        return 0;
      }
      return Entities.Container.listInstances(container, entityId).length;
    },
    getFirstStack: (state: State, container: Container, entityId: string): Stack => {
      let stack: Stack;
      const stacks = Entities.Container.listInstances(container, entityId);
      if (stacks.length === 0) {
        // create a new stack
        stack = Entities.Stack.create(state, entityId);
        // it's ok to directly add an empty stack because it doesn't take up any limits
        container.contents[entityId] = {
          entityId,
          instances: {}
        };
        container.contents[entityId].instances[stack.id] = true;

      } else {
        stack = <Stack>Util.State.getInstance(state, entityId, stacks[0]);
      }
      return stack;
    },
    /** Depositing an array of items **/
    deposit: (state: State, container: Container, things: ItemMap) => {
      Object.keys(things).forEach((entityId: string) => {
        let record: ContainerContentRecord = Entities.Container.getContentRecord(container, entityId);
        if (!record) {
          container.contents[entityId] = {
            entityId,
            instances: {}
          };
          record = container.contents[entityId];
        }
        const instanceIds = things[entityId];
        const instances: Item[] = instanceIds.map((instId: string) => {
          return <Item>Util.State.getInstance(state, entityId, instId);
        });

        instances.forEach((item: Item) => {
          item.containerId = container.id;
          if (item.stackable) {
            const stack = Entities.Container.getFirstStack(state, container, entityId);
            // merged
            Entities.Stack.merge(stack, <Stack>item);
          } else {
            record.instances[item.id] = true;
          }
        });
      });

      Entities.Container.updateLimitsUsed(state, container);
    },
    /** picks a set of ids for an entity based on sortFunction, if no sortFunction is supplied, returns set based on id**/
    pick: (
      state: State,
      container: Container,
      entityId: string,
      amount: number,
      sortFunction?: (a: Entity, b: Entity) => number
    ): string[] => {
      const store = Util.State.getStore(state, entityId);
      const set = Entities.Container
        .listInstances(container, entityId)
        .map((instId: string) => {
          return store.instances[instId];
        });
      if (sortFunction) {
        set.sort(sortFunction);
      }
      return set.slice(0, amount).map((e: Entity) => {
        return e.id;
      });
    },
    /** Assumes we can withdraw, that it was checked, then updates the state of the container by withdrawing the things */
    withdraw: (state: State, container: Container, things: ItemMap) => {
      Object.keys(things).forEach((entityId: string) => {
        const instanceIds: string[] = things[entityId];
        const record: ContainerContentRecord = Entities.Container.getContentRecord(
          container,
          entityId
        );

        instanceIds.forEach((instId: string) => {
          if (!record.instances[instId]) {
            return;
          }
          const inst: Item = <Item>Util.State.getInstance(state, entityId, instId);
          delete inst.containerId;
          if (inst.stackable) {
            const stack = Entities.Container.getFirstStack(state, container, entityId);
            Entities.Stack.merge(stack, <Stack>inst, -1);
            if (inst.containerId) {
              Entities.Container.updateLimitsUsed(state, <Container>Util.State.getInstance(state, 'container', inst.containerId))
            }
          } else {
            delete record.instances[instId];
          }
        });
      });

      Entities.Container.updateLimitsUsed(state, container);
    },
    /** Checks if container has everything requested in things */
    canWithdraw: (state: State, container: Container, things: ItemMap): boolean => {
      return Object.keys(things).every((entityId: string) => {
        const instanceIds = things[entityId];
        const record: ContainerContentRecord = Entities.Container.getContentRecord(
          container,
          entityId
        );

        if (!record) {
          return false;
        }

        return instanceIds.every((instId: string) => {
          const item = <Item>Util.State.getInstance(state, entityId, instId);
          if (item.stackable) {
            // stackable item, check if we have enough in the warehouse
            const stack = Entities.Container.getFirstStack(state, container, entityId);
            return (stack.units >= (<Stack>item).units)
          } else {
            return record.instances[instId];
          }
        });

      });
    },
    /** Returns whether or not the things we want to deposit will fit into the container's various limits */
    canDeposit: (state: State, container: Container, things: ItemMap): boolean => {
      const thingsDim: Dimensions = Util.Item.getDimensions(state, things);
      return Object.keys(thingsDim).every((f: string) => {
        const v = thingsDim[f];
        return container.limits[f].max >= container.limits[f].used + v;
      });
    },
    /** Returns the limits of a container is used, optionally by entityId */
    countLimitsUsed: (state: State, container: Container, entityId?: string): Dimensions => {
      let entityIds = Object.keys(container.contents);
      if (entityId) {
        entityIds = entityIds.filter(id => id === entityId);
      }
      return entityIds.reduce((tot: Dimensions, _entityId: string) => {
        const instIds = Object.keys(Entities.Container.getContentRecord(container, _entityId).instances);
        const entityDims = {
          slots: 0,
          weight: 0,
          space: 0
        };
        instIds.forEach((instId) => {
          const item: Item = <Item>Util.State.getInstance(state, entityId, instId);
          Util.Item.mergeDims(entityDims, item.dimensions);
        });
        return Util.Item.mergeDims(tot, entityDims);
      }, {
          slots: 0,
          space: 0,
          weight: 0
        });
    },
    updateLimitsUsed: (state: State, container: Container): Dimensions => {
      let used: Dimensions = {
        slots: 0,
        weight: 0,
        space: 0
      };

      Object.keys(container.contents).forEach((entityId: string) => {
        const record: ContainerContentRecord = Entities.Container.getContentRecord(container, entityId);
        Object.keys(record.instances).forEach((instId) => {
          const inst = <Item>Util.State.getInstance(state, entityId, instId);
          Util.Item.mergeDims(used, inst.dimensions);
        });
      });

      container.limits.slots.used = used.slots;
      container.limits.space.used = used.space;
      container.limits.weight.used = used.weight;

      return used;
    }
  },
  Apple: {
    entityId: 'apple',
    create: (state: State): Apple => {
      const ret: Apple = {
        ...Entities.create(state, Entities.Apple.entityId),
        spoilage: 0,
        stackable: false,
        dimensions: {
          space: 0.2,
          weight: 1,
          slots: 1
        },
        tags: {}
      };
      Util.State.addEntity(state, ret);
      return ret;
    },
    spoil: (apple: Apple, amount: number): Apple => {
      apple.spoilage += amount;
      if (apple.spoilage > 100) {
        apple.spoilage = 100;
      }
      if (apple.spoilage === 100) {
        apple.tags['spoiled'] = true;
      } else {
        delete apple.tags['spoiled'];
      }

      return apple;
    }
  },
  Coin: {
    create: (state: State, units: number): CoinStack => {
      const coinstack: CoinStack = {
        ...Entities.create(state, 'coinstack'),
        stackable: true,
        tags: {},
        itemId: 'coin',
        units: 0,
        dimensions: {
          slots: 0,
          space: 0,
          weight: 0
        },
        unitDim: {
          slots: 0,
          space: 0.05,
          weight: 0.1
        }
      };

      Entities.Stack.addUnits(coinstack, units);
      Util.State.addEntity(state, coinstack);
      return coinstack;
    }
  },
  Stack: {
    create: (state: State, entityId: string): Stack => {
      let stack: Stack;
      switch (entityId) {
        case 'coinstack':
          stack = Entities.Coin.create(state, 0);
          break;
      }

      Util.State.addEntity(state, stack);
      return stack;
    },
    addUnits: (stack: Stack, units: number): Stack => {
      stack.units += units;
      Object.keys(stack.unitDim).forEach((d) => {
        stack.dimensions[d] = stack.units * stack.unitDim[d];
      });
      return stack;
    },
    // Merges s2 into stack, then empty s2, returns stack
    merge: (stack: Stack, s2: Stack, modifier?: number): Stack => {
      if (stack.entityId !== s2.entityId) {
        return null;
      }
      stack.units += s2.units * (modifier || 1);

      s2.units = 0;
      s2.dimensions = {
        slots: 0,
        weight: 0,
        space: 0
      };

      Object.keys(stack.unitDim).forEach((d) => {
        stack.dimensions[d] = stack.units * stack.unitDim[d];
      });
      return stack;
    }
  }
};

export const Util = {
  Item: {
    /** Function turns an array of Items into an ItemMap that can be used in a Container */
    creatItemMapFromInstances: (instances: Item[]): ItemMap => {
      const map: ItemMap = {};
      instances.forEach((inst: Item) => {
        if (!map[inst.entityId]) {
          map[inst.entityId] = []
        }

        map[inst.entityId].push(inst.id);
      });
      return map;
    },
    mergeDims: (dim: Dimensions, d2: Dimensions): Dimensions => {
      Object.keys(d2).forEach((f) => {
        dim[f] += d2[f];
      });
      return dim;
    },
    getDimensions: (state: State, things: ItemMap): Dimensions => {
      const dim: Dimensions = {
        slots: 0,
        weight: 0,
        space: 0
      };

      Object.keys(things).forEach((entityId: string) => {
        const instanceIds: string[] = things[entityId];
        if (instanceIds.length > 0) {
          instanceIds.forEach((instId: string) => {
            const inst: Item = <Item>Util.State.getInstance(state, entityId, instId);
            Util.Item.mergeDims(dim, inst.dimensions);
          });
        }
      });
      return dim;
    }
  }, State: {
    create: (): State => {
      return {
        nextId: 1,
        tickCount: 0,
        stepCount: 0,
        config: {
          running: true,
          timeBetweenTicks: 1000
        },
        entities: {}
      };
    },
    getGuid: (state: State): number => {
      if (!state) {
        return null;
      }
      return ++state.nextId;
    },
    getStore: (state: State, entityId: string): EntityStore => {
      return state.entities[entityId];
    },
    /** Adds the entity, then returns the store **/
    addEntity: (state: State, entity: Entity): EntityStore => {
      if (!Util.State.getStore(state, entity.entityId)) {
        // add the store
        state.entities[entity.entityId] = {
          ids: [],
          instances: {}
        };
      }
      const store = state.entities[entity.entityId];

      store.ids = [...store.ids, entity.id];
      store.instances[entity.id] = entity;
      return store;
    },
    /** Removes the entity, then returns a reference to the entity*/
    removeEntity: (state: State, entity: Entity): Entity => {
      if (!entity) {
        return null;
      }
      if (!Util.State.getStore(state, entity.entityId)) {
        return null;
      }
      const store = state.entities[entity.entityId];

      store.ids = store.ids.filter(id => id !== entity.id);

      const reference = store.instances[entity.id];
      delete store.instances[entity.id];
      return reference;
    },
    getInstance: (state: State, entityId: string, id: string): Entity => {
      if (!Util.State.getStore(state, entityId)) {
        return null;
      }
      return state.entities[entityId].instances[id];
    },
    listInstances: (state: State, entityId: string): Entity[] => {
      if (!Util.State.getStore(state, entityId)) {
        return [];
      }
      return state.entities[entityId].ids.map(id => {
        return state.entities[entityId].instances[id];
      });
    }
  }
}

/** Engine object that coordinates running the game **/
export const Engine = {
  tick: (state: State) => {
    state.tickCount++;

    // Note that things happening depends on the state.config.running to be truthy, otherwise the engine runs but no processing is done
    if (state.config.running) {
      state.stepCount++;

      /** Do stuff**/
    }

    setTimeout(() => {
      Engine.tick(state);
    }, state.config.timeBetweenTicks);
  },
  export: (state: State): string => {
    return JSON.stringify(state);
  },
  import: (str: string): State => {
    return <State>JSON.parse(str);
  }
};
import { expect } from 'chai';
import 'mocha';

import { Entities, State, Container, Apple, ItemMap, Util } from './game';
// testing
let state: State;
let container: Container;
describe('Create State', () => {
    it('should create a state object', () => {
        const _state = Util.State.create();
        state = _state;
        expect(_state).to.be.ok;
    });
})

describe('Create Container', () => {
    it('should add a container to the state entities list', () => {
        const numExistingContainers = Util.State.listInstances(state, 'container').length;
        container = Entities.Container.create(state, { slots: 100, weight: 400, space: 600 });

        expect(container.limits.slots.max).to.equal(100);
        expect(state.entities['container'].ids.includes(container.id)).to.be.true;
        expect(state.entities['container'].instances[container.id] === container).to.be.true;
        expect(Util.State.listInstances(state, 'container').length, 'Should have added one more').to.equal(numExistingContainers + 1)
    });
})

describe('Apples', () => {
    it('should create an item map with 1 apple', () => {
        const _apple: Apple = Entities.Apple.create(state);
        Util.State.addEntity(state, _apple);
        const map: ItemMap = Util.Item.creatItemMapFromInstances([_apple]);
        expect(map['apple'].length).to.equal(1);
    });

    it('should add 100 apples to the container', () => {
        const apples: Apple[] = [];
        for (let i = 0; i < 100; i++) {
            const apple: Apple = Entities.Apple.create(state);
            apple.spoilage = i;
            apples.push(apple);
        }

        const things: ItemMap = Util.Item.creatItemMapFromInstances(apples);
        Entities.Container.deposit(state, container, things);

        expect(container.limits.slots.used, 'capacity not updated?').to.equal(100);
        expect(Object.keys(container.contents['apple'].instances).length, 'actual instances count not correct!').to.equal(100);

    });
    it('should not add the 101st apple to the container', () => {
        const things: ItemMap = Util.Item.creatItemMapFromInstances([Entities.Apple.create(state)])
        expect(Entities.Container.canDeposit(state, container, things)).to.be.false;
    });
});


# inventory-system

This is a work in progress system for managing the state of a game. At its core is an Entities system that manages the creation, tracking, and destruction of Entities.

A key component of this system is the Container entity, it can keep other entities in its contents. Containers are configured to have Dimensions which describes the limits of what can be kept in the container. Weight, Slots, and space are the three configured here, developers are encouraged to add/remove as necessary.

These Dimensions are properties of every Item. Items are by default unique, but they can be fungible. Fungible items "stack" - for example, a "stack" of coins, vs an instance of an Apple. The idea here is that sometimes items are identical, so we don't keep track of them, but a stack could be unique (a stack of 100 coins). Each instance of an Apple on the other hand could have different dimensions and other properties

To install, use
`npm install`

To run the tests, use
`npm run test`

Enjoy!
dSolver

// test.js
import 'dotenv/config';
import { ChannelType, Client, GatewayIntentBits, Guild, User } from 'discord.js';
import * as fs from 'fs';
import { action, startGame, nextStep, died, cancelGame, client, sendCandleStatus, playRecordings } from './index.js'; // Import the functions from index.js, and the client

// Replace with your actual IDs
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GM_USER_ID = '583340515869589522'; // @GavinTheGM
const TEST_SERVER_ID = '888119534375030815'; // Balsamic Moon Games server ID
const TEST_CHANNEL_ID = '973337999985217537'; // #dice-rolling
const TEST_PLAYER_ID_1 = '877545709644173372'; // @wyldwoodwitch
const TEST_PLAYER_ID_2 = '1348988696669458523'; // @balsamicgames

let mockMembers = {};
let mockGameData = {};
let mockGuild;
let mockChannel;
let mockUser;
let mockPlayer1;
let mockPlayer2;
let mockMessage;

// Create mock user objects
class MockUser {
    constructor(client, data) {
        this.id = data.id;
        this.username = data.username;
        this.send = data.send;
        this.createDM = data.createDM;
        this.awaitMessages = data.awaitMessages; // Add awaitMessages
    }
}
//Create the mock guild
class MockGuild extends Guild {
    constructor(client, data) { //Added the memberManager here.
        super(client, data);
        this.name = "Balsamic Moon Games";
    }
}

//Create the guild data.
const mockGuildData = {
    id: TEST_SERVER_ID,
    name: "Balsamic Moon Games",
};
client.users.cache.get = (userId) => {
    if (userId === GM_USER_ID) return mockUser;
    if (userId === TEST_PLAYER_ID_1) return mockPlayer1;
    if (userId === TEST_PLAYER_ID_2) return mockPlayer2;
    return null;
};

//Mock functions
const mockSaveGameData = () => {
    console.log('Mock saveGameData called.');
    // Optionally, you can do something with mockGameData here
    fs.writeFileSync('mockGameData.json', JSON.stringify(mockGameData));
    console.log('Mock game data saved successfully.');
};
const mockLoadGameData = () => {
    try {
        const data = fs.readFileSync('mockGameData.json', 'utf8');
        mockGameData = JSON.parse(data);
        console.log('Mock game data loaded successfully.');
    } catch (err) {
        console.error('Error loading mock game data:', err);
        mockGameData = {};
        console.log('Mock game data initialized.');
        // Create an empty mockGameData.json file.
        try {
            fs.writeFileSync('mockGameData.json', JSON.stringify(mockGameData));
            console.log('Empty mockGameData.json created successfully.');
        } catch (createError) {
            console.error('Error creating empty mockGameData.json:', createError);
        }
    }
};
const mockPrintActiveGames = () => {
    if (Object.keys(mockGameData).length === 0) {
        console.log('-- No Active Games --');
    } else {
        console.log('--- Active Games ---');
        for (const channelId in mockGameData) {
            console.log(`Channel ID: ${channelId}`);
        }
    }
};

//modify the existing client
client.gameData = mockGameData; //assign gameData to client.
client.saveGameData = mockSaveGameData;
client.loadGameData = mockLoadGameData;
client.printActiveGames = mockPrintActiveGames;

mockLoadGameData();

//mock client fetch
client.channels.fetch = (channelId) => {
    if (channelId === TEST_CHANNEL_ID) return Promise.resolve(mockChannel);
    return Promise.reject(new Error('Channel not found'));
};

// Run the tests
async function runTests() {
    try {
        console.log('Starting tests...');

        // Test 1: Start Game
        mockMessage.content = `.startgame <@${GM_USER_ID}> <@${TEST_PLAYER_ID_1}> <@${TEST_PLAYER_ID_2}>`;
        await startGame(mockMessage);
        console.log('Start game test finished.');

        // Test 2: Check game has started
        client.printActiveGames();

        // Test 3: Test Action
        mockMessage.content = `.action`;
        mockMessage.author = mockUser;
        await action(mockMessage, []);
        console.log('Action test finished.');

        // Test 4: Test Died (Martyr)
        mockMessage.content = `.died <@${TEST_PLAYER_ID_1}> -martyr`;
        mockMessage.author = mockUser;
        await died(mockMessage, [`<@${TEST_PLAYER_ID_1}>`, `-martyr`]);
        console.log('Died (martyr) test finished.');

        // Test 8: Test Play Recordings
        mockMessage.content = `.playrecordings`;
        mockMessage.author = mockUser;
        await playRecordings(mockMessage);
        console.log('Play Recordings test finished.');

        // Test 5: Test Cancel Game
        mockMessage.content = `.cancelgame`;
        mockMessage.author = mockUser;
        await cancelGame(mockMessage);
        console.log('Cancel game test finished.');

        // Test 6: Check no game active
        client.printActiveGames();

        // Test 7: Test Candle Count
        await sendCandleStatus(mockMessage, 1);
        console.log('Candle count test finished.');

        // Test 9: Test Candle Count 0
        await sendCandleStatus(mockMessage, 0);
        console.log('Candle count 0 test finished.');

        // Test 10: Test Candle Count 2
        await sendCandleStatus(mockMessage, 2);
        console.log('Candle count 2 test finished.');

        // Test 11: Test Candle Count 6
        await sendCandleStatus(mockMessage, 6);
        console.log('Candle count 6 test finished.');

        // Test 12: Test Candle Count 10
        await sendCandleStatus(mockMessage, 10);
        console.log('Candle count 10 test finished.');

        // Test 13: GM Declines Consent
        await cancelExistingGame(mockMessage, 'GM Declines Consent');

        mockUser.awaitMessages = () => { // Add awaitMessages
            return new Promise((resolve) => {
                setTimeout(() => {
                    // Simulate a response
                    const mockMessage = { content: 'n', author: mockUser }; //create a mock message.
                    const map = new Map([['1', mockMessage]]);
                    map.first = () => mockMessage; // Add first() function to the map.
                    resolve(map); // Resolve with a map
                }, 100); //100ms
            });
        };
        mockMessage.content = `.startgame <@${GM_USER_ID}> <@${TEST_PLAYER_ID_1}> <@${TEST_PLAYER_ID_2}>`;
        await startGame(mockMessage);
        console.log('GM Declines Consent test finished.');

        // Test 14: Player Declines Consent
        await cancelExistingGame(mockMessage, 'Player Declines Consent');

        mockPlayer1.awaitMessages = () => { // Add awaitMessages
            return new Promise((resolve) => {
                setTimeout(() => {
                    // Simulate a response
                    const mockMessage = { content: 'n', author: mockPlayer1 }; //create a mock message.
                    const map = new Map([['1', mockMessage]]);
                    map.first = () => mockMessage; // Add first() function to the map.
                    resolve(map); // Resolve with a map
                }, 100); //100ms
            });
        };
        mockMessage.content = `.startgame <@${GM_USER_ID}> <@${TEST_PLAYER_ID_1}> <@${TEST_PLAYER_ID_2}>`;
        await startGame(mockMessage);
        console.log('Player Declines Consent test finished.');
        //Set it back to normal, for future tests.
        mockPlayer1.awaitMessages = () => { // Add awaitMessages
            return new Promise((resolve) => {
                setTimeout(() => {
                    // Simulate a response
                    const mockMessage = { content: 'y', author: mockPlayer1 }; //create a mock message.
                    const map = new Map([['1', mockMessage]]);
                    map.first = () => mockMessage; // Add first() function to the map.
                    resolve(map); // Resolve with a map
                }, 100); //100ms
            });
        };

        //Test 15: GM Timeout
        await cancelExistingGame(mockMessage, 'GM Timeout');

        mockUser.awaitMessages = () => { // Add awaitMessages
            return new Promise((resolve, reject) => {
                //No set timeout, so it should time out.
            });
        };
        mockMessage.content = `.startgame <@${GM_USER_ID}> <@${TEST_PLAYER_ID_1}> <@${TEST_PLAYER_ID_2}>`;
        await startGame(mockMessage);
        console.log('GM Timeout test finished.');
        //Reset the user.
        mockUser.awaitMessages = () => { // Add awaitMessages
            return new Promise((resolve) => {
                setTimeout(() => {
                    // Simulate a response
                    const mockMessage = { content: 'y', author: mockUser }; //create a mock message.
                    const map = new Map([['1', mockMessage]]);
                    map.first = () => mockMessage; // Add first() function to the map.
                    resolve(map); // Resolve with a map
                }, 100); //100ms
            });
        };

        // Test 16: Player Timeout
        await cancelExistingGame(mockMessage, 'Player Timeout');
        
        mockPlayer1.awaitMessages = () => { // Add awaitMessages
            return new Promise((resolve, reject) => {
                //No timeout.
            });
        };
        mockMessage.content = `.startgame <@${GM_USER_ID}> <@${TEST_PLAYER_ID_1}> <@${TEST_PLAYER_ID_2}>`;
        await startGame(mockMessage);
        console.log('Player Timeout test finished.');
        //Reset the user.
        mockPlayer1.awaitMessages = () => { // Add awaitMessages
            return new Promise((resolve) => {
                setTimeout(() => {
                    // Simulate a response
                    const mockMessage = { content: 'y', author: mockPlayer1 }; //create a mock message.
                    const map = new Map([['1', mockMessage]]);
                    map.first = () => mockMessage; // Add first() function to the map.
                    resolve(map); // Resolve with a map
                }, 100); //100ms
            });
        };

        // Test 17: Duplicate Players
        await cancelExistingGame(mockMessage, 'Duplicate Players');

        mockMessage.content = `.startgame <@${GM_USER_ID}> <@${TEST_PLAYER_ID_1}> <@${TEST_PLAYER_ID_1}>`;
        await startGame(mockMessage);
        console.log('Duplicate Players test finished.');

        // Test 18: GM as Player
        await cancelExistingGame(mockMessage, 'GM as Player');

        mockMessage.content = `.startgame <@${GM_USER_ID}> <@${TEST_PLAYER_ID_1}> <@${GM_USER_ID}>`;
        await startGame(mockMessage);
        console.log('GM as Player test finished.');

        // Test 19: Offline GM
        // Create a mock offline GM
        await cancelExistingGame(mockMessage, 'Offline GM');

        const mockOfflineGM = {
            id: GM_USER_ID,
            presence: { status: 'offline' },
            user: { username: "GavinTheGM" },
        };
        // Override the get function for this test
        client.users.cache.get = (userId) => {
            if (userId === GM_USER_ID) return mockOfflineGM;
            if (userId === TEST_PLAYER_ID_1) return mockPlayer1;
            if (userId === TEST_PLAYER_ID_2) return mockPlayer2;
            return null;
        };
        mockMessage.content = `.startgame <@${GM_USER_ID}> <@${TEST_PLAYER_ID_1}> <@${TEST_PLAYER_ID_2}>`;
        await startGame(mockMessage);
        console.log('Offline GM test finished.');
        // Set the users back to normal.
        client.users.cache.get = (userId) => {
            if (userId === GM_USER_ID) return mockUser;
            if (userId === TEST_PLAYER_ID_1) return mockPlayer1;
            if (userId === TEST_PLAYER_ID_2) return mockPlayer2;
            return null;
        };

        // Test 20: Offline Players
        // Create a mock offline player
        await cancelExistingGame(mockMessage, 'Offline Players');

        const mockOfflinePlayer1 = {
            id: TEST_PLAYER_ID_1,
            presence: { status: 'offline' },
            user: { username: "PlayerOne" },
        };
        // Override the get function for this test
        client.users.cache.get = (userId) => {
            if (userId === GM_USER_ID) return mockUser;
            if (userId === TEST_PLAYER_ID_1) return mockOfflinePlayer1;
            if (userId === TEST_PLAYER_ID_2) return mockPlayer2;
            return null;
        };
        mockMessage.content = `.startgame <@${GM_USER_ID}> <@${TEST_PLAYER_ID_1}> <@${TEST_PLAYER_ID_2}>`;
        await startGame(mockMessage);
        console.log('Offline Players test finished.');
        // Set the users back to normal.
        client.users.cache.get = (userId) => {
            if (userId === GM_USER_ID) return mockUser;
            if (userId === TEST_PLAYER_ID_1) return mockPlayer1;
            if (userId === TEST_PLAYER_ID_2) return mockPlayer2;
            return null;
        };

        // Test 21: Zero Players
        await cancelExistingGame(mockMessage, 'Zero Players');

        mockMessage.content = `.startgame <@${GM_USER_ID}>`;
        await startGame(mockMessage);
        console.log('Zero Players test finished.');

        //Test 22: More Than 10 Players
        //Create 10 new mock users
        await cancelExistingGame(mockMessage, 'More Than 10 Players');

        let mockPlayers = [];
        for (let i = 3; i <= 13; i++) {
            let mockPlayer = new MockUser(client, {
                id: `TEST_PLAYER_ID_${i}`,
                username: `Player${i}`,
                send: (content) => {
                    console.log(`[Mock User TEST_PLAYER_ID_${i}] Sending DM:`, content);
                    return Promise.resolve();
                },
                createDM: () => {
                    return Promise.resolve(mockChannel);
                },
                awaitMessages: () => {
                    return new Promise((resolve) => {
                        setTimeout(() => {
                            const mockMessage = { content: 'y', author: mockPlayer };
                            const map = new Map([['1', mockMessage]]);
                            map.first = () => mockMessage;
                            resolve(map);
                        }, 100);
                    });
                }
            });
            mockPlayers.push(mockPlayer);
        }
        // Add the members.
        for (let i = 0; i < mockPlayers.length; i++) {
            let mockPlayer = mockPlayers[i];
            mockMembers[mockPlayer.id] = { user: mockPlayer, id: mockPlayer.id }
            client.users.cache.get = (userId) => {
                if (userId === GM_USER_ID) return mockUser;
                if (userId === TEST_PLAYER_ID_1) return mockPlayer1;
                if (userId === TEST_PLAYER_ID_2) return mockPlayer2;
                for (let i = 0; i < mockPlayers.length; i++) {
                    if (userId === mockPlayers[i].id) return mockPlayers[i];
                }
                return null;
            };
        }
        mockMessage.content = `.startgame <@${GM_USER_ID}> <@${TEST_PLAYER_ID_1}> <@${TEST_PLAYER_ID_2}> ${mockPlayers.map(p => `<@${p.id}>`).join(' ')}`;
        await startGame(mockMessage);
        console.log('More Than 10 Players test finished.');

    } catch (error) {
        console.error('Test error:', error);
    } finally {
        console.log('All tests finished.');
    }
}

//Run the tests when the bot is ready.
client.once('ready', () => {
    // Create the mock channel, before the users.
    mockChannel = {
        id: TEST_CHANNEL_ID,
        type: ChannelType.GuildText,
        send: (content) => {
            console.log(`[Mock Channel] Sending:`, content);
            return Promise.resolve();
        },
        name: "dice-rolling",
        guild: mockGuild, // Assign guild property
        awaitMessages: () => { // Add awaitMessages
            return new Promise((resolve) => {
                setTimeout(() => {
                    // Simulate a response
                    const mockMessage = { content: 'y', author: mockUser }; //create a mock message.
                    const map = new Map([['1', mockMessage]]);
                    map.first = () => mockMessage; // Add first() function to the map.
                    resolve(map); // Resolve with a map
                }, 100); //100ms
            });
        }
    };

    mockUser = new MockUser(client, {
        id: GM_USER_ID,
        username: "GavinTheGM",
        send: (content) => {
            console.log(`[Mock User ${GM_USER_ID}] Sending DM:`, content);
            return Promise.resolve();
        },
        createDM: () => {
            return Promise.resolve(mockChannel); //Corrected mockChannel
        },
        awaitMessages: () => { // Add awaitMessages
            return new Promise((resolve) => {
                setTimeout(() => {
                    // Simulate a response
                    const mockMessage = { content: 'y', author: mockUser }; //create a mock message.
                    const map = new Map([['1', mockMessage]]);
                    map.first = () => mockMessage; // Add first() function to the map.
                    resolve(map); // Resolve with a map
                }, 100); //100ms
            });
        }
    });

    mockPlayer1 = new MockUser(client, {
        id: TEST_PLAYER_ID_1,
        username: "PlayerOne",
        send: (content) => {
            console.log(`[Mock User ${TEST_PLAYER_ID_1}] Sending DM:`, content);
            return Promise.resolve();
        },
        createDM: () => {
            return Promise.resolve(mockChannel); //Corrected mockChannel
        },
        awaitMessages: () => { // Add awaitMessages
            return new Promise((resolve) => {
                setTimeout(() => {
                    // Simulate a response
                    const mockMessage = { content: 'y', author: mockPlayer1 }; //create a mock message.
                    const map = new Map([['1', mockMessage]]);
                    map.first = () => mockMessage; // Add first() function to the map.
                    resolve(map); // Resolve with a map
                }, 100); //100ms
            });
        }
    });

    mockPlayer2 = new MockUser(client, {
        id: TEST_PLAYER_ID_2,
        username: "PlayerTwo",
        send: (content) => {
            console.log(`[Mock User ${TEST_PLAYER_ID_2}] Sending DM:`, content);
            return Promise.resolve();
        },
        createDM: () => {
            return Promise.resolve(mockChannel); //Corrected mockChannel
        },
        awaitMessages: () => { // Add awaitMessages
            return new Promise((resolve) => {
                setTimeout(() => {
                    // Simulate a response
                    const mockMessage = { content: 'y', author: mockPlayer2 }; //create a mock message.
                    const map = new Map([['1', mockMessage]]);
                    map.first = () => mockMessage; // Add first() function to the map.
                    resolve(map); // Resolve with a map
                }, 100); //100ms
            });
        }
    });

    // Create the mock guild and the mock member manager.
    mockGuild = new MockGuild(client, mockGuildData); // Create the guild, and pass it the manager.

    // Add the members to mockMembers.
    mockMembers[mockUser.id] = { user: mockUser, id: mockUser.id };
    mockMembers[mockPlayer1.id] = { user: mockPlayer1, id: mockPlayer1.id };
    mockMembers[mockPlayer2.id] = { user: mockPlayer2, id: mockPlayer2.id };

    //mock fetch
    const mockFetch = (memberId) => {
        return new Promise((resolve, reject) => {
            const member = mockMembers[memberId];
            if (member) {
                resolve(member);
            } else {
                reject(new Error(`Member with ID ${memberId} not found.`));
            }
        });
    };

    mockGuild.members = {
        cache: {
            get: (id) => mockMembers[id],
        },
        fetch: mockFetch,
    };

    // Create a mock message object with the required properties and methods
    mockMessage = {
        channel: mockChannel,
        author: mockUser,
        member: { // Manually create a member.
            user: mockUser,
            id: mockUser.id
        }, // Create a proper member object
        guild: mockGuild,
        content: '',
        reply: (content) => {
            console.log(`[Mock Message] Replying:`, content);
            return Promise.resolve();
        },
        delete: () => {
            console.log(`[Mock Message] Deleting:`);
            return Promise.resolve();
        },
    };
    runTests();
});

async function cancelExistingGame(mockMessage, testName) {
    // Clear any game that may be active.
    mockMessage.content = `.cancelgame`;
    mockMessage.author = mockUser;
    await cancelGame(mockMessage);
    console.log(`Canceling any existing game before ${testName} test.`);
}

//Instantiate the client related objects after login.
client.login(DISCORD_TOKEN);

import 'dotenv/config';
import { ChannelType, Client, GatewayIntentBits, Collection } from 'discord.js'; //Import the collection.
import * as fs from 'fs';
import { client, gameData, blocklist } from './index.js';
import { startGame } from './commands/startgame.js';
import { loadGameData } from './utils.js';

// Replace with your actual IDs
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GM_USER_ID = '583340515869589522'; // @GavinTheGM
const TEST_SERVER_ID = '888119534375030815'; // Balsamic Moon Games server ID
const TEST_CHANNEL_ID = '973337999985217537'; // #dice-rolling
const TEST_PLAYER_ID_1 = '877545709644173372'; // @wyldwoodwitch
const TEST_PLAYER_ID_2 = '1348988696669458523'; // @balsamicgames

let mockMembers = {};
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
class MockGuild extends Client {
    constructor(client, data) { //Added the memberManager here.
        super({ //Add intents.
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildMembers,
                GatewayIntentBits.DirectMessages,
                GatewayIntentBits.DirectMessageReactions,
                GatewayIntentBits.DirectMessageTyping,
                GatewayIntentBits.GuildPresences
            ],
        });
        this.name = "Balsamic Moon Games";
        this.members = {
            cache: new Collection(), // Initialize cache as a Collection
            fetch: (userId) => {
                return new Promise((resolve, reject) => {
                    const member = mockMembers[userId];
                    if (member) {
                        resolve(member);
                    } else {
                        reject(new Error(`Member with ID ${userId} not found.`));
                    }
                });
            }
        };
    }
}

//Create the guild data.
const mockGuildData = {
    id: TEST_SERVER_ID,
    name: "Balsamic Moon Games",
};

//Mock functions
const mockSaveGameData = () => {
    console.log('Mock saveGameData called.');
    // Optionally, you can do something with mockGameData here
    fs.writeFileSync('gameData.json', JSON.stringify(gameData));
    console.log('Mock game data saved successfully.');
};

const mockLoadGameData = () => {
    try { //load the game data.
        const data = fs.readFileSync('gameData.json', 'utf8'); //Read the game data.
        if (data.trim().length > 0) { //Check that there is data.
            const parsedData = JSON.parse(data); //parse the data.
            // Check if parsedData is an object and not null or undefined
            if (typeof parsedData === 'object' && parsedData !== null) { //check that the data is correct.
                // Copy the parsed data into the existing gameData object
                Object.assign(gameData, parsedData); //assign the parsed data.
            } else {
                throw new Error('Parsed data is not an object.');
            }
            console.log('Game data loaded successfully.');
        } else {
            console.log('gameData.json is empty. No data loaded.');
            // Clear the existing gameData object
            Object.keys(gameData).forEach(key => delete gameData[key]); //clear gamedata.
            console.log('Game data initialized.');
        }
        mockPrintActiveGames();
    } catch (err) { //If there is an error.
        console.error('Error loading game data:', err);
        // Clear the existing gameData object
        Object.keys(gameData).forEach(key => delete gameData[key]); //clear gamedata.
        console.log('Game data initialized.');
    }
};

const mockPrintActiveGames = () => {
    if (Object.keys(gameData).length === 0) {
        console.log('-- No Active Games --');
    } else {
        console.log('--- Active Games ---');
        for (const channelId in gameData) {
            console.log(`Channel ID: ${channelId}`);
        }
    }
};

const mockLoadBlocklist = () => { //Load the blocklist here.
    try {
        const data = fs.readFileSync('blocklist.json', 'utf8');
        const parsedBlocklist = JSON.parse(data);
        // Copy the parsed data into the existing blocklist object
        Object.assign(blocklist, parsedBlocklist);
        console.log('Blocklist loaded successfully.');
    } catch (err) {
        console.error('Error loading blocklist:', err);
        // Clear the existing blocklist object
        Object.keys(blocklist).forEach(key => delete blocklist[key]);
        console.log('Blocklist initialized.');
    }
};

//modify the existing client
client.saveGameData = mockSaveGameData;

//mock client fetch
client.channels.fetch = (channelId) => {
    if (channelId === TEST_CHANNEL_ID) return Promise.resolve(mockChannel);
    return Promise.reject(new Error('Channel not found'));
};

client.users.cache.get = (userId) => {
    if (userId === GM_USER_ID) return mockUser;
    if (userId === TEST_PLAYER_ID_1) return mockPlayer1;
    if (userId === TEST_PLAYER_ID_2) return mockPlayer2;
    return null;
};

async function runGameDataTest() {
    console.log('Starting game data save/load test...');

    try {
        // 0. Load gamedata and blocklist.
        loadGameData();
        mockLoadBlocklist();

        // 1. Start a game
        mockMessage.content = `.startgame <@${GM_USER_ID}> <@${TEST_PLAYER_ID_1}> <@${TEST_PLAYER_ID_2}>`;
        await startGame(mockMessage, gameData);

        // 2. Simulate saving gameData
        client.saveGameData();
        console.log('gameData after save:', gameData);

        // 3. Clear gameData
        const initialGameData = { ...gameData }; //Save initial game data.
        Object.keys(gameData).forEach(key => delete gameData[key]); //clear gameData.
        console.log('gameData cleared:', gameData); //Log cleared.

        // 4. Load gameData
        loadGameData();
        console.log('gameData after load:', gameData);

        // 5. Verify gameData
        const channelId = TEST_CHANNEL_ID;
        const gameExists = gameData[channelId] !== undefined;
        const hasPlayers = gameData[channelId]?.players !== undefined;
        const hasGm = gameData[channelId]?.gmId !== undefined;
        const hasPlayerOrder = gameData[channelId]?.playerOrder !== undefined;

        console.log("does the game exist in gamedata? ", gameExists);
        console.log("does the game have players? ", hasPlayers);
        console.log("does the game have a GM? ", hasGm);
        console.log("does the game have a playerOrder? ", hasPlayerOrder);

        // 6. Check if the loaded data matches the initial data
        if (gameExists && hasPlayers && hasGm && hasPlayerOrder) {
            console.log('Game data was saved and loaded successfully!');
        } else {
            console.error('Game data was NOT saved and loaded correctly!');
        }
    } catch (error) {
        console.error('Game data test error:', error);
    } finally {
        console.log('Game data test finished.');
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
    mockMembers[mockUser.id] = { user: mockUser, id: mockUser.id, guild:mockGuild }; //Added the guild object.
    mockMembers[mockPlayer1.id] = { user: mockPlayer1, id: mockPlayer1.id, guild:mockGuild  }; //Added the guild object.
    mockMembers[mockPlayer2.id] = { user: mockPlayer2, id: mockPlayer2.id, guild:mockGuild  }; //Added the guild object.

    //Add the members to the guild cache
    mockGuild.members.cache.set(mockUser.id, mockMembers[mockUser.id]); //Set the user.
    mockGuild.members.cache.set(mockPlayer1.id, mockMembers[mockPlayer1.id]); //Set the user.
    mockGuild.members.cache.set(mockPlayer2.id, mockMembers[mockPlayer2.id]); //Set the user.

    // Create a mock message object with the required properties and methods
    mockMessage = {
        channel: mockChannel,
        author: mockUser,
        member: mockMembers[mockUser.id],
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

    // Run the game data test
    runGameDataTest();
});
client.login(DISCORD_TOKEN);

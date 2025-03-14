import 'dotenv/config';
import fs from 'fs';
import { gameData, loadGameData, loadBlocklist, blocklist } from './utils.js';

// Create a mock member for each player
const mockGuild = {
    members: {
        cache: {
            get: (userId) => ({
                user: {
                    send: (message) => {
                        console.log(`[DM to ${userId}]:`, message);
                        return Promise.resolve(); // Simulate sending a DM
                    }
                }
            })
        },
        fetch: async (userId) => { //Add the fetch function.
          return Promise.resolve({ //Return the promise!
            user: {
                send: (message) => {
                    console.log(`[DM to ${userId}]:`, message);
                    return Promise.resolve(); // Simulate sending a DM
                }
            }
          })
        }
    }
};

// Create a mock client object
const client = {
    guilds: {
        cache: {
            get: (guildId) => {
                if (guildId === gameData['testChannel'].guildId) {
                    return mockGuild; //THIS IS NOW CORRECT!
                } else {
                    return null;
                }
            }
        },
        fetch: async (userId) => Promise.resolve(mockGuild) //This allows members.fetch() to work.
    }
};

//Now we can import swapTraits and swapBrinks.
import { swapTraits, swapBrinks } from './chargen.js';

export async function validateGameSetup(message) {
    const channelId = message.channel.id;
    const userId = message.author.id;
    const mentions = message.mentions;
    const guild = message.guild;

    if (blocklist[userId]) {
        return { valid: false, reason: `You are blocked from using the \`.startgame\` command. Reason: ${blocklist[userId]}` };
    }

    // Prevent duplicate games in the same channel.
    if (gameData[channelId]) {
        return { valid: false, reason: 'A **Ten Candles** game is already in progress here.' };
    }

    // Check if the user is a player or the GM of another game.
    for (const gameChannelId in gameData) {
        const game = gameData[gameChannelId];
        if (game.gmId === userId || game.players[userId]) {
            return { valid: false, reason: 'You are already in a game. You must cancel your current game before starting a new one.' };
        }
    }

    return { valid: true, reason: null }; //everything is good.
}

// New test functions
async function testSwapTraits() {
    console.log('Starting testSwapTraits test...');

    try {
        // 1. Clear any existing game data.
        Object.keys(gameData).forEach(key => delete gameData[key]);
        console.log('gameData cleared:', gameData);

        // 2. Create some sample game data.
        gameData['testChannel'] = {
            gmId: '123456789012345678', //Updated
            players: {
                '987654321098765432': { playerUsername: 'PlayerOne', virtue: 'Virtue1', vice: 'Vice1' }, //Updated
                '101112131415161718': { playerUsername: 'PlayerTwo', virtue: 'Virtue2', vice: 'Vice2' }, //Updated
            },
            playerOrder: ['987654321098765432', '101112131415161718'], //Updated
            guildId: "111213141516171819", //Updated
        };
        gameData['testChannel'].playerOrder = ['987654321098765432', '101112131415161718']; //Updated
        console.log('gameData initialized:', gameData);

        // 3. Call swapTraits
        const players = gameData['testChannel'].players;
        const game = gameData['testChannel']; //Now use the entire game object.
        const swappedPlayers = await swapTraits(client, players, game, gameData['testChannel'].guildId); //Now passes game.

        // 4. Check the result
        if (swappedPlayers['987654321098765432'].virtue === 'Virtue2' && swappedPlayers['987654321098765432'].vice === 'Vice2' && //Updated
            swappedPlayers['101112131415161718'].virtue === 'Virtue1' && swappedPlayers['101112131415161718'].vice === 'Vice1') { //Updated
            console.log('swapTraits test: SUCCESS');
        } else {
            console.error('swapTraits test: FAILED');
            console.log('player1SwappedVirtue:', swappedPlayers['987654321098765432'].virtue); //Updated
            console.log('player1SwappedVice:', swappedPlayers['987654321098765432'].vice); //Updated
            console.log('player2SwappedVirtue:', swappedPlayers['101112131415161718'].virtue); //Updated
            console.log('player2SwappedVice:', swappedPlayers['101112131415161718'].vice); //Updated
        }
    } catch (error) {
        console.error('swapTraits test: ERROR', error);
    } finally {
        console.log('swapTraits test finished.');
    }
}

async function testSwapBrinks() {
    console.log('Starting testSwapBrinks test...');
    try {
        // 1. Clear any existing game data.
        //Object.keys(gameData).forEach(key => delete gameData[key]); //No longer needed, because swapTraits already clears it.
        //console.log('gameData cleared:', gameData); //No longer needed.

        // 2. Create some sample game data.
        gameData['testChannel'] = {
            gmId: '123456789012345678', //Updated
            players: {
                '987654321098765432': { playerUsername: 'PlayerOne', brink: 'Brink1' }, //Updated
                '101112131415161718': { playerUsername: 'PlayerTwo', brink: 'Brink2' }, //Updated
                '123456789012345678': {playerUsername: "testGM", brink: "BrinkGM"}, //Add the GM here.
            },
            playerOrder: ['987654321098765432', '101112131415161718'], //Updated
            guildId: "111213141516171819", //Updated
        };
        gameData['testChannel'].playerOrder = ['987654321098765432', '101112131415161718']; //Updated
        console.log('gameData initialized:', gameData);

        // 3. Call swapBrinks
        const players = gameData['testChannel'].players;
        const playerOrder = gameData['testChannel'].playerOrder;
        const gmId = gameData['testChannel'].gmId;
        const swappedBrinks = swapBrinks(players, playerOrder, gmId); //Now passes game.

        // 4. Check the result
        if (swappedBrinks['987654321098765432'].brink === 'Brink2' && swappedBrinks['101112131415161718'].brink === 'Brink1' && swappedBrinks['123456789012345678'].brink === 'Brink1') { //Updated
            console.log('swapBrinks test: SUCCESS');
        } else {
            console.error('swapBrinks test: FAILED');
            console.log('player1SwappedBrink:', swappedBrinks['987654321098765432'].brink); //Updated
            console.log('player2SwappedBrink:', swappedBrinks['101112131415161718'].brink); //Updated
            console.log('gmBrink:', swappedBrinks['123456789012345678'].brink);
        }
    } catch (error) {
        console.error('swapBrinks test: ERROR', error);
    } finally {
        console.log('swapBrinks test finished.');
    }
}
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
async function runSwapTests() {
    console.log('Starting swapTraits test...');
    await testSwapTraits();
    console.log('swapTraits test finished.');
    console.log('Starting swapBrinks test...');
    await testSwapBrinks();
    console.log('swapBrinks test finished.');
}

loadGameData();
mockLoadBlocklist();
runSwapTests();

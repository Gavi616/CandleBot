import 'dotenv/config';
import fs from 'fs';
import { gameData, loadGameData, loadBlocklist, blocklist, sanitizeString, numberToWords, getVirtualTableOrder, askForTraits, countdown } from './utils.js';
import { swapTraits, swapBrinks } from './chargen.js';
import { TRAIT_TIMEOUT, TIME_INTERVAL } from './config.js';
import { assert } from 'chai';
import { Client, Collection, GatewayIntentBits } from 'discord.js';
import { findGameByUserId } from './index.js';
import sinon from 'sinon';

class MockClient extends Client {
    constructor() {
        super({
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
        this.channels = { cache: new Collection() };
        this.users = { cache: new Collection() };
        this.guilds = { cache: new Collection() };
    }
}
const client = new MockClient();

const mockUser = {
    id: '1234567890',
    username: 'TestUser',
    createDM: async () => {
        return {
            awaitMessages: async () => {
                return new Collection();
            },
            send: async (message) => {
                return { edit: async () => { } };
            },
            createMessageComponentCollector: () => {
                return {
                    on: () => { },
                    stop: () => { },
                };
            },
        };
    },
    send: async (message) => {
        return { edit: async () => { } };
    },
};

const mockMember = {
    id: '1234567890',
    user: mockUser,
};

const mockChannel = {
    id: '9876543210',
    name: 'test-channel',
    guild: {
        id: "111111111111111111",
        members: {
            cache: new Collection([[mockMember.id, mockMember]]),
        },
        voiceAdapterCreator: {},
    },
    messages: {
        fetch: async () => {
            return new Collection();
        },
    },
    send: async (message) => {
        return message;
    },
    createMessageComponentCollector: () => {
        return {
            on: () => { },
            stop: () => { },
        };
    },
};

client.channels.cache.set(mockChannel.id, mockChannel);

client.users.cache.set(mockUser.id, mockUser);
client.users.fetch = async () => mockUser;

const mockGuild = {
    id: '111111111111111111',
    name: 'TestGuild',
    channels: {
        cache: new Collection([[mockChannel.id, mockChannel]]),
    },
    members: {
        cache: new Collection([[mockMember.id, mockMember]]),
        fetch: async () => mockMember,
    },
};

client.guilds.cache.set(mockGuild.id, mockGuild);

const mockMessage = {
    channel: mockChannel,
    guild: mockGuild,
    author: mockUser,
    content: '',
    reply: async (message) => { return message },
    delete: async () => { },
    member: mockMember,
    mentions: {
        users: new Collection(),
    },
};

import { describe, it, beforeEach, afterEach } from 'mocha';
describe('Unit Tests', () => {
    describe('sanitizeString', () => {
        it('should remove control characters', () => {
            const result = sanitizeString('Test\x00String\x7F');
            assert.equal(result, 'TestString');
        });

        it('should escape double quotes', () => {
            const result = sanitizeString('Test"String');
            assert.equal(result, 'Test\\"String');
        });

        it('should escape backslashes', () => {
            const result = sanitizeString('Test\\String');
            assert.equal(result, 'Test\\\\String');
        });
        it('should return an empty string if the parameter is not a string', () => {
            const result = sanitizeString(123);
            assert.equal(result, '');
        });
    });
    describe('numberToWords', () => {
        it('should return the word for numbers between 0 and 10', () => {
            assert.equal(numberToWords(5), "five");
        });
        it('should return the number as a string for numbers outside 0 and 10', () => {
            assert.equal(numberToWords(11), "11");
        });
    });
    describe('findGameByUserId', () => {
        beforeEach(() => {
            Object.keys(gameData).forEach(key => delete gameData[key]);
            gameData['9876543210'] = {
                gmId: '1234567890',
                players: {
                    '0987654321': {
                        consent: true,
                    }
                },
            };
        });
        it('should find a game by GM ID', () => {
            const game = findGameByUserId('1234567890');
            assert.exists(game);
            assert.equal(game.gmId, '1234567890');
        });

        it('should find a game by player ID', () => {
            const game = findGameByUserId('0987654321');
            assert.exists(game);
            assert.deepEqual(game.players['0987654321'], {
                consent: true,
            });
        });

        it('should return undefined if no game is found', () => {
            const game = findGameByUserId('9999999999');
            assert.isUndefined(game);
        });
    });

    describe('getVirtualTableOrder', () => {
        beforeEach(() => {
            Object.keys(gameData).forEach(key => delete gameData[key]);
            gameData['9876543210'] = {
                gmId: '1234567890',
                players: {
                    '0987654321': {
                        consent: true,
                    },
                    '2345678901': {
                        consent: true,
                    }
                },
                playerOrder: ['0987654321', '2345678901'],
            };
        });
        it('should return the correct virtual table order', () => {
            const game = gameData['9876543210'];
            assert.deepEqual(getVirtualTableOrder(game), ['0987654321', '2345678901', '1234567890']);
        });

        it('should return the correct virtual table order without GM', () => {
            const game = gameData['9876543210'];
            assert.deepEqual(getVirtualTableOrder(game, false), ['0987654321', '2345678901']);
        });
    });
    describe('askForTraits', () => {
        beforeEach(() => {
            Object.keys(gameData).forEach(key => delete gameData[key]);
            gameData['9876543210'] = {
                gmId: '1234567890',
                players: {
                    '0987654321': {
                        consent: true,
                    }
                },
                playerOrder: ['0987654321'],
                textChannelId: '9876543210',
            };
        });
        it('should send a DM to a player asking for traits', async () => {
            const game = gameData['9876543210'];
            const playerId = '0987654321';

            const sendSpy = sinon.spy(mockUser, 'send');

            await askForTraits(mockMessage, mockChannel, game, playerId);

            assert.isTrue(sendSpy.called);

            sendSpy.restore();
        });
    });

});

describe('Integration Tests', () => {

    describe('swapTraits and swapBrinks', () => {
        it('should correctly swap traits and brinks', async () => {
            Object.keys(gameData).forEach(key => delete gameData[key]);

            gameData['testChannel'] = {
                gmId: '123456789012345678',
                players: {
                    '987654321098765432': { playerUsername: 'PlayerOne', virtue: 'Virtue1', vice: 'Vice1', brink: 'Brink1' },
                    '101112131415161718': { playerUsername: 'PlayerTwo', virtue: 'Virtue2', vice: 'Vice2', brink: 'Brink2' },
                    '123456789012345678': { playerUsername: "testGM", brink: "BrinkGM" },
                },
                playerOrder: ['987654321098765432', '101112131415161718'],
                guildId: "111111111111111111",
            };
            gameData['testChannel'].playerOrder = ['987654321098765432', '101112131415161718'];

            const players = gameData['testChannel'].players;
            const game = gameData['testChannel'];
            const swappedTraits = await swapTraits(client, players, game, game.guildId);

            assert.equal(swappedTraits['987654321098765432'].virtue, 'Virtue2');
            assert.equal(swappedTraits['987654321098765432'].vice, 'Vice2');
            assert.equal(swappedTraits['101112131415161718'].virtue, 'Virtue1');
            assert.equal(swappedTraits['101112131415161718'].vice, 'Vice1');

            const playerOrder = gameData['testChannel'].playerOrder;
            const gmId = gameData['testChannel'].gmId;
            const swappedBrinks = swapBrinks(players, playerOrder, gmId);

            assert.equal(swappedBrinks['987654321098765432'].brink, 'Brink2');
            assert.equal(swappedBrinks['101112131415161718'].brink, 'Brink1');
            assert.equal(swappedBrinks['123456789012345678'].brink, 'Brink1');
        });
    });
});

describe('Countdown Tests (DM)', () => {
    let clock;
    let sendSpy;
    let editSpy;
    const realDiscordId = '583340515869589522';

    beforeEach(async () => {
        clock = sinon.useFakeTimers();
        editSpy = sinon.spy();
        const realUser = await client.users.fetch(realDiscordId);

        sendSpy = sinon.spy(realUser, 'send');
        
        realUser.send = async () => {
            return { edit: editSpy }
        };
    });

    afterEach(() => {
        clock.restore();
        sendSpy.restore();
        editSpy.resetHistory();
    });

    it('should send countdown messages and final message via DM', async () => {
        const initialTime = 60000;
        const interval = TIME_INTERVAL;

        const realUser = await client.users.fetch(realDiscordId);

        const initialMessage = await realUser.send('This is a test');
        await countdown(realUser, initialTime, initialMessage);

        clock.tick(interval);
        assert.isTrue(editSpy.calledWith(`*(Time remaining: 0 minutes and 45 seconds)*`));

        clock.tick(interval);
        assert.isTrue(editSpy.calledWith(`*(Time remaining: 0 minutes and 30 seconds)*`));
        
        clock.tick(initialTime + 1);
        assert.isTrue(editSpy.calledWith('Time\'s up! Random selections will now be made.'));

    });
});

const mockLoadBlocklist = () => {
    try {
        const data = fs.readFileSync('blocklist.json', 'utf8');
        const parsedBlocklist = JSON.parse(data);
        Object.assign(blocklist, parsedBlocklist);
        console.log('Blocklist loaded successfully.');
    } catch (err) {
        console.error('Error loading blocklist:', err);
        Object.keys(blocklist).forEach(key => delete blocklist[key]);
        console.log('Blocklist initialized.');
    }
};
loadGameData();
mockLoadBlocklist();

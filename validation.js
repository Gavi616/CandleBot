import { ChannelType } from 'discord.js';

export const gameDataSchema = {
  channelId: { type: 'string', required: true },
  gmId: { type: 'string', required: true },
  players: {
    type: 'object',
    required: true,
    properties: {
      playerId: {
        type: 'object',
        required: true,
        properties: {
          playerUsername: { type: 'string', required: true },
          consent: { type: 'boolean', required: true },
          brink: { type: 'string', required: true },
          moment: { type: 'string', required: true },
          virtue: { type: 'string', required: true },
          vice: { type: 'string', required: true },
          name: { type: 'string', required: true },
          look: { type: 'string', required: true },
          concept: { type: 'string', required: true },
          recordings: { type: 'string', required: true },
          hopeDice: { type: 'number', required: true },
          virtueBurned: { type: 'boolean', required: true },
          viceBurned: { type: 'boolean', required: true },
          momentBurned: { type: 'boolean', required: true },
          isDead: { type: 'boolean', required: true },
        },
      },
    },
  },
  playerOrder: { type: 'array', required: true, items: { type: 'string' } },
  characterGenStep: { type: 'number', required: true },
  traitsRequested: { type: 'boolean', required: true },
  textChannelId: { type: 'string', required: true },
  guildId: { type: 'string', required: true },
  voiceChannelId: { type: 'string', required: false },
  gameMode: { type: 'string', required: true },
  gm: {
    type: 'object',
    required: true,
    properties: {
      consent: { type: 'boolean', required: true },
      brink: { type: 'string', required: true },
    },
  },
  inLastStand: { type: 'boolean', required: false },
  scene: { type: 'number', required: false },
  dicePool: { type: 'number', required: false },
  diceLost: { type: 'number', required: false },
  lastSaved: { type: 'string', required: true },
};

export function validateGameData(gameData, schema) {
  for (const channelId in gameData) {
    const game = gameData[channelId];

    // Check for required properties at the top level
    for (const key in schema) {
      if (schema[key].required && !game[key]) {
        console.error(`Validation Error: Missing required property '${key}' in game data for channel ${channelId}.`);
        return false;
      }
    }

    // Check the types of the properties at the top level
    for (const key in game) {
      if (schema[key]) {
        if (schema[key].type === 'string' && typeof game[key] !== 'string') {
          console.error(`Validation Error: Property '${key}' in game data for channel ${channelId} should be a string.`);
          return false;
        } else if (schema[key].type === 'number' && typeof game[key] !== 'number') {
          console.error(`Validation Error: Property '${key}' in game data for channel ${channelId} should be a number.`);
          return false;
        } else if (schema[key].type === 'boolean' && typeof game[key] !== 'boolean') {
          console.error(`Validation Error: Property '${key}' in game data for channel ${channelId} should be a boolean.`);
          return false;
        } else if (schema[key].type === 'array' && Array.isArray(game[key])) {
          for (const item of game[key]) {
            if (typeof item !== schema[key].items.type) {
              console.error(`Validation Error: Item in array '${key}' should be a ${schema[key].items.type}.`);
              return false;
            }
          }
        } else if (schema[key].type === 'object' && typeof game[key] === 'object') {
          // ... check properties of the object ...
        } else if (schema[key].type === 'array' && !Array.isArray(game[key])) {
          console.error(`Validation Error: Property '${key}' in game data for channel ${channelId} should be an array.`);
          return false;
        } else if (schema[key].type === 'object' && typeof game[key] !== 'object') {
          console.error(`Validation Error: Property '${key}' in game data for channel ${channelId} should be an object.`);
          return false;
        }
      }
    }

    // Check the players object
    if (game.players) {
      for (const playerId in game.players) {
        const player = game.players[playerId];
        const playerSchema = schema.players.properties.playerId.properties;

        // Check for required properties in the player object
        for (const key in playerSchema) {
          if (playerSchema[key].required && !player[key]) {
            console.error(`Validation Error: Missing required property '${key}' in player data for player ${playerId} in channel ${channelId}.`);
            return false;
          }
        }

        // Check the types of the properties in the player object
        for (const key in player) {
          if (playerSchema[key]) {
            if (playerSchema[key].type === 'string' && typeof player[key] !== 'string') {
              console.error(`Validation Error: Property '${key}' in player data for player ${playerId} in channel ${channelId} should be a string.`);
              return false;
            } else if (playerSchema[key].type === 'number' && typeof player[key] !== 'number') {
              console.error(`Validation Error: Property '${key}' in player data for player ${playerId} in channel ${channelId} should be a number.`);
              return false;
            } else if (playerSchema[key].type === 'boolean' && typeof player[key] !== 'boolean') {
              console.error(`Validation Error: Property '${key}' in player data for player ${playerId} in channel ${channelId} should be a boolean.`);
              return false;
            }
          }
        }
      }
    }

    // Check the gm object
    if (game.gm) {
      const gmSchema = schema.gm.properties;

      // Check for required properties in the gm object
      for (const key in gmSchema) {
        if (gmSchema[key].required && !game.gm[key]) {
          console.error(`Validation Error: Missing required property '${key}' in GM data for channel ${channelId}.`);
          return false;
        }
      }

      // Check the types of the properties in the gm object
      for (const key in game.gm) {
        if (gmSchema[key]) {
          if (gmSchema[key].type === 'string' && typeof game.gm[key] !== 'string') {
            console.error(`Validation Error: Property '${key}' in GM data for channel ${channelId} should be a string.`);
            return false;
          } else if (gmSchema[key].type === 'boolean' && typeof game.gm[key] !== 'boolean') {
            console.error(`Validation Error: Property '${key}' in GM data for channel ${channelId} should be a boolean.`);
            return false;
          }
        }
      }
    }
  }
  return true;
}

export async function validateGameSetup(message) {
  const channelId = message.channel.id;
  const userId = message.author.id;
  const mentions = message.mentions;
  const mentionedUsers = Array.from(mentions.users.values());
  const guild = message.guild;
  const { gameData, blocklist } = await import('./utils.js'); // Correct import here.

  if (blocklist[userId]) {
    return { valid: false, reason: `You are blocked from using the \`.startgame\` command. Reason: ${blocklist[userId]}` };
  }

  // Check if the user is a player or the GM of another game.
  for (const gameChannelId in gameData) {
    const game = gameData[gameChannelId];
    if (gameChannelId === channelId) {
      return { valid: false, reason: 'A **Ten Candles** game is already in progress here.' };
    }
    if (game.gmId === userId || game.players[userId]) {
      return { valid: false, reason: 'You are already in a game. You must cancel your current game before starting a new one.' };
    }
  }

  if (mentionedUsers.length < 3) { // GM + at least 2 players
    return { valid: false, reason: 'A **Ten Candles** game requires a GM and at least 2 unique players. No game was started.' };
  }

  //Extract the GM
  const gmId = mentionedUsers[0].id; // Get the GM's ID.

  //Get the players
  const playerIds = mentionedUsers.slice(1).map(user => user.id); // Get the ids of all remaining users.

  // Basic checks to ensure all mentioned users are unique and that the GM isn't a player.
  if (new Set(playerIds).size !== playerIds.length) {
    return { valid: false, reason: 'Duplicate players found. Each player must be a unique user. No game was started.' };
  }

  if (playerIds.includes(gmId)) {
    return { valid: false, reason: 'The GM cannot also be a player. No game was started.' };
  }

  // Check if the number of players is within the allowed range.
  if (playerIds.length < 2 || playerIds.length > 10) {
    return { valid: false, reason: 'A **Ten Candles** game requires a GM and at least 2 players (max 10 players). No game was started.' };
  }

  // Check if the GM exists in the server.
  const gm = guild.members.cache.get(gmId);
  if (!gm || gm === null) {
    return { valid: false, reason: 'Invalid GM ID. Please mention a valid user in this server. No game was started.' };
  }

  // Check if all players are in the server.
  if (playerIds && Array.isArray(playerIds)) {
    for (const playerId of playerIds) {
      const player = guild.members.cache.get(playerId);
      if (!player || player === null) {
        return { valid: false, reason: `Invalid Player ID: <@${playerId}>. Please mention at least 2 valid users in this server. No game was started.` };
      }
    }
  }

  return { valid: true, reason: null, gmId: gmId, playerIds: playerIds };
}

export function validateBlocklist(blocklist) {
  for (const userId in blocklist) {
    if (typeof userId !== 'string' || typeof blocklist[userId] !== 'string') {
      console.error(`Validation Error: Invalid blocklist entry. userId: ${userId}, reason: ${blocklist[userId]}`);
      return false;
    }
  }
  return true;
}

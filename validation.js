import { gameData, blocklist } from './utils.js'; // Correct import here.
import { ChannelType } from 'discord.js';

export async function validateGameSetup(message) {
  const channelId = message.channel.id;
  const userId = message.author.id;
  const mentions = message.mentions;
  const mentionedUsers = Array.from(mentions.users.values());
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
  if (!gm) {
    return { valid: false, reason: 'Invalid GM ID. Please mention a valid user in this server. No game was started.' };
  }

  // Check if all players are in the server.
  if (playerIds) {
    for (const playerId of playerIds) {
      const player = guild.members.cache.get(playerId);
      if (!player) {
        return { valid: false, reason: `Invalid Player ID: <@${playerId}>. Please mention at least 2 valid users in this server. No game was started.` };
      }
    }
  }

  return { valid: true, reason: null, gmId: gmId, playerIds: playerIds}; //everything is good. Also return the gmId and playerIds.
}

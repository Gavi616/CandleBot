import { gameData, blocklist } from './index.js'; //added blocklist.
export async function validateGameSetup(message, args, isTesting) {
    if (isTesting) {
      const gmId = args[0].replace(/<@!?(\d+)>/, '$1');
      const playerIds = args.slice(1).map(id => id.replace(/<@!?(\d+)>/, '$1'));
  
      // Basic checks (only if args were passed, to ensure gmID and playerIDs are available)
      if (args.length >= 1) {
        const gm = message.guild.members.cache.get(gmId);
        if (!gm) {
          return { valid: false, reason: 'Testing Mode: Invalid GM ID. Please mention a valid user in this server. No game was started.' };
        }
      }
  
      if (args.length >= 2) {
        if (playerIds.length < 1 || playerIds.length > 10) {
          return { valid: false, reason: 'Testing Mode: A **Ten Candles** game requires at least 1 player (max 10 players). No game was started.' };
        }
      }
  
      return { valid: true, gmId, playerIds };
    }
  
    const channelId = message.channel.id;
    const userId = message.author.id;
  
    if (blocklist[userId]) {
      return { valid: false, reason: `You are blocked from using the \`.startgame\` command. Reason: ${blocklist[userId]}` };
    }
  
    // Check if the user is a player or the GM of another game.
    let userIsParticipant = false;
    for (const gameChannelId in gameData) {
      const game = gameData[gameChannelId];
      if (game.gmId === userId || game.players[userId]) {
        userIsParticipant = true;
        break;
      }
    }
  
    //Allow users to use startgame if they are a participant in any game.
    if (!userIsParticipant) {
      return { valid: false, reason: 'You must be a current player or GM to start a game.' };
    }
  
    if (gameData[channelId]) {
      return { valid: false, reason: 'A **Ten Candles** game is already in progress here.' };
    }
  
    if (args.length < 3) {
      return { valid: false, reason: 'A **Ten Candles** game requires a GM and at least 2 players. Usage: `.startgame <GM ID> <Player IDs (space-separated)>`' };
    }
  
    const gmId = args[0].replace(/<@!?(\d+)>/, '$1');
    const playerIds = args.slice(1).map(id => id.replace(/<@!?(\d+)>/, '$1'));
  
    if (playerIds.length < 2 || playerIds.length > 10) {
      return { valid: false, reason: 'A **Ten Candles** game requires a GM and at least 2 players (to a maximum of 10 players). No game was started.' };
    }
  
    const gm = message.guild.members.cache.get(gmId);
    if (!gm) {
      return { valid: false, reason: 'Invalid GM ID. Please mention a valid user in this server. No game was started.' };
    }
  
    if (new Set(playerIds).size !== playerIds.length) {
      return { valid: false, reason: 'Duplicate players found. Each player must be a unique user. No game was started.' };
    }
  
    if (playerIds.includes(gmId)) {
      return { valid: false, reason: 'The GM cannot also be a player. No game was started.' };
    }
  
    for (const playerId of playerIds) {
      const player = message.guild.members.cache.get(playerId);
      if (!player) {
        return { valid: false, reason: `Invalid Player ID: <@${playerId}>. Please mention a valid user in this server. No game was started.` };
      }
    }
  
    if (gm.presence?.status === 'offline') {
      return { valid: false, reason: 'The GM must be online to start a game. No game was started.' };
    }
  
    // Check if all players are in the server and online
    const playerFetchPromises = playerIds.map(async playerId => {
      try {
        const member = await message.guild.members.fetch(playerId);
        return { playerId, isOnline: member.presence?.status !== 'offline', isPresent: true };
      } catch (error) {
        // Handle the case where the member is not found in the guild
        console.error(`Failed to fetch member ${playerId}:`, error);
        return { playerId, isOnline: false, isPresent: false };
      }
    });
  
    const playerStatuses = await Promise.all(playerFetchPromises);
    const problemPlayers = playerStatuses.filter(status => !status.isPresent || !status.isOnline);
  
    if (problemPlayers.length > 0) {
      const problemPlayerMentions = problemPlayers.map(status => `<@${status.playerId}>`).join(', ');
      return { valid: false, reason: `Unable to start game due to issues with the following player(s): ${problemPlayerMentions}. Please ensure they are valid users in this server and are online.` };
    }
  
    return { valid: true, gmId, playerIds };
  }

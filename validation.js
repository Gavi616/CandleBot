import { gameData, blocklist } from './index.js';
import { ChannelType } from 'discord.js';

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

import { gameData, sanitizeString, saveGameData } from '../utils.js';

export async function removePlayer(message, args) {
  const channelId = message.channel.id;
  const game = gameData[channelId];

  if (!game) {
    message.channel.send('No game is in progress in this channel.');
    return;
  }

  if (message.author.id !== game.gmId) {
    try {
      await message.author.send({ content: 'Only the GM can use this command.' }); // Changed to message.author.send()
      await message.delete();
    } catch (error) {
      console.error(`Failed to delete message in <#${channelId}>: ${error.message}`);
    }
    return;
  }

  if (args.length < 1) {
    message.channel.send('Usage: .removeplayer <Player ID> [Reason]');
    return;
  }

  const playerIdToRemove = args[0].replace(/<@!?(\d+)>/, '$1'); // Extract player ID from mention

  if (!game.players[playerIdToRemove]) {
    message.channel.send('Invalid Player ID. Please mention a valid player in this game.');
    return;
  }

  let reason = args.slice(1).join(' '); // Extract the reason (if any)

  delete game.players[playerIdToRemove];
  game.playerOrder = game.playerOrder.filter(id => id !== playerIdToRemove);
  saveGameData();

  if (reason) {
    message.channel.send(`<@${playerIdToRemove}> has been removed from the game. Reason: ${reason}`);
  } else {
    message.channel.send(`<@${playerIdToRemove}> has been removed from the game.`);
  }
  
  saveGameData();
}

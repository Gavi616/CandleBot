import { getGameData, saveGameData, sendDM } from '../utils.js';

export async function died(message, args) {
  const channelId = message.channel.id;
  const game = getGameData(channelId);

  if (!game) {
    message.channel.send('No game in progress.');
    return;
  }

  if (game.characterGenStep < 9) {
    message.channel.send("This command can only be used after character generation is complete (this isn't **Traveller**).");
    return;
  }

  if (game.gmId !== message.author.id) {
    try {
      await message.author.send({ content: 'Only the GM can use this command.' });
      await message.delete();
    } catch (error) {
      console.error(`Failed to delete message in <#${channelId}>: ${error.message}`);
    }
    return;
  }

  if (args.length < 1) {
    message.reply('Usage: .died <Player ID> [Reason]');
    return;
  }

  const playerIdToKill = args[0].replace(/<@!?(\d+)>/, '$1');

  if (!/^\d+$/.test(playerIdToKill)) { // Check if playerIdToKill is a number
    message.reply('Invalid Player ID. Please mention a valid player in this game.');
    return;
  }

  if (!game.players[playerIdToKill]) {
    message.reply('Invalid Player ID. Please mention a valid player in this game.');
    return;
  }

  let reason = args.slice(1).join(' ');
  game.players[playerIdToKill].isDead = true;
  saveGameData();

  if (reason) {
    message.channel.send(`<@${playerIdToKill}> has died. Reason: ${reason}`);
  } else {
    message.channel.send(`<@${playerIdToKill}> has died.`);
  }
}

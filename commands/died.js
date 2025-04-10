import { getGameData, saveGameData, sendDM } from '../utils.js';
import { playRecordings } from '../index.js';

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
    message.reply(`Usage: \`${prefix}died <Player ID> [Reason]\``);
    return;
  }

  const playerIdToKill = args[0].replace(/<@!?(\d+)>/, '$1');

  if (!/^\d+$/.test(playerIdToKill)) {
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

  const allPlayersDead = Object.values(game.players).every(player => player.isDead);

  if (allPlayersDead) {
    await playRecordings(message);
  }

  if (reason) {
    message.channel.send(`<@${playerIdToKill}> has died from/by ${reason}`);
  } else {
    message.channel.send(`<@${playerIdToKill}> has died.`);
  }

  saveGameData();
}

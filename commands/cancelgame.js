import { gameData, saveGameData } from '../utils.js';

export async function cancelGame(message) {
  const channelId = message.channel.id;
  if (!gameData[channelId]) {
    message.reply('No game is in progress in this channel.');
    return;
  }
  const gmId = gameData[channelId].gmId;

  try {
    const gm = message.guild.members.cache.get(gmId);
    const dmChannel = await gm.user.createDM();
    await gm.user.send(`Are you sure you want to cancel the game in #${message.channel.name}? (y/n) You have 60 seconds to respond.`);

    const filter = m => m.author.id === gmId && (m.content.toLowerCase().startsWith('y') || m.content.toLowerCase().startsWith('n'));
    const collected = await dmChannel.awaitMessages({ filter, max: 1, time: 60000, errors: ['time'] });

    if (collected.size > 0 && collected.first().content.toLowerCase().startsWith('y')) {
      delete gameData[channelId];
      message.channel.send(`Game in #${message.channel.name} has been cancelled by the GM.`);
      saveGameData();
    } else {
      message.channel.send('Game cancellation was aborted by GM.');
    }
  } catch (error) {
    console.error('Error requesting GM confirmation to cancel game:', error);
    message.channel.send('Failed to request GM confirmation. Game not cancelled.');
  }
}

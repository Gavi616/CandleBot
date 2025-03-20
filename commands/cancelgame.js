import { gameData, saveGameData } from '../utils.js';
import { CANCEL_TIMEOUT } from '../config.js';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export async function cancelGame(message) {
  const channelId = message.channel.id;
  if (!gameData[channelId]) {
    message.channel.send('No game is in progress in this channel.');
    return;
  }
  const gmId = gameData[channelId].gmId;

  if (message.author.id !== gmId) {
    try {
      await message.author.send({ content: 'Only the GM can use this command.' });
      await message.delete();
    } catch (error) {
      console.error(`Failed to delete message in <#${channelId}>: ${error.message}`);
    }
    return;
  }

  try {
    const gm = message.guild.members.cache.get(gmId);
    const dmChannel = await gm.user.createDM();

    const consentEmbed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle('Cancel Game Confirmation')
      .setDescription(`Are you sure you want to cancel the game in #${message.channel.name}?`);

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('cancel_game_yes')
          .setLabel('Yes')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('cancel_game_no')
          .setLabel('No')
          .setStyle(ButtonStyle.Secondary)
      );

    const initialMessage = await gm.user.send({
      embeds: [consentEmbed],
      components: [row],
    });

    const filter = (interaction) =>
      interaction.user.id === gmId && interaction.message.id === initialMessage.id;

    const collector = dmChannel.createMessageComponentCollector({
      filter: filter,
      time: CANCEL_TIMEOUT,
    });

    collector.on('collect', async (interaction) => {
      await interaction.deferUpdate();
      if (interaction.customId === 'cancel_game_yes') {
        delete gameData[channelId];
        message.channel.send(`Game in #${message.channel.name} has been cancelled by the GM.`);
        saveGameData();
        await interaction.editReply({ content: 'Game cancelled.', embeds: [], components: [] });
      } else if (interaction.customId === 'cancel_game_no') {
        message.channel.send('Game cancellation was aborted by GM.');
        await interaction.editReply({ content: 'Game cancellation aborted.', embeds: [], components: [] });
      }
      collector.stop();
    });

    collector.on('end', async (collected, reason) => {
      if (reason === 'time') {
        await gm.user.send('Cancellation confirmation timed out.');
        message.channel.send('Game cancellation confirmation timed out.');
      }
    });
  } catch (error) {
    console.error('Error requesting GM confirmation to cancel game:', error);
    message.channel.send('Failed to request GM confirmation. Game not cancelled.');
  }
}

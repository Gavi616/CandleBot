import { gameData, getGameData, saveGameData, sendDM } from '../utils.js';
import { CONSENT_TIMEOUT } from '../config.js';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { client } from '../index.js';

export async function cancelGame(message) {
  const channelId = message.channel.id;
  const game = getGameData(channelId);

  if (!game) {
    message.channel.send('No game in progress.');
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

  const initiator = await message.guild.members.fetch(game.initiatorId);
  const dmChannel = await initiator.user.createDM();

  const dataEmbed = new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle('Game Data Management')
    .setDescription(`Your Ten Candles session in <#${channelId}> has been cancelled. Are you ready to delete all session data?`);

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('delete_data')
        .setLabel('Yes, delete')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('send_data')
        .setLabel('Send it to me, then delete')
        .setStyle(ButtonStyle.Primary),
    );

  const dataMessage = await dmChannel.send({ embeds: [dataEmbed], components: [row] });

  const dataFilter = (interaction) => interaction.user.id === game.initiatorId && interaction.message.id === dataMessage.id;
  const dataCollector = dmChannel.createMessageComponentCollector({ filter: dataFilter, time: CANCEL_TIMEOUT });

  dataCollector.on('collect', async (interaction) => {
    await interaction.deferUpdate();
    if (interaction.customId === 'delete_data') {
      delete gameData[channelId];
      saveGameData();
      await interaction.editReply({ content: 'Game data has been deleted.', embeds: [], components: [] });
    } else if (interaction.customId === 'send_data') {
      const gameDataString = JSON.stringify(gameData[channelId], null, 2);
      const buffer = Buffer.from(gameDataString, 'utf-8');
      const attachment = new AttachmentBuilder(buffer, { name: `gameData-${channelId}-${new Date().toISOString()}.json` });
      delete gameData[channelId];
      saveGameData();
      await interaction.editReply({ content: `Game data has been sent to you as a JSON file.`, embeds: [], components: [] });
      await dmChannel.send({ content: `Please save the attached file to your computer.`, files: [attachment] });
    }
    dataCollector.stop();
  });

  dataCollector.on('end', async (collected, reason) => {
    if (reason === 'time') {
      delete gameData[channelId];
      saveGameData();
      await dataMessage.edit({ content: 'No response was recorded, Game data has been removed.', embeds: [], components: [] });
    }
  });
}
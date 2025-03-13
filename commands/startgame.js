import { validateGameSetup } from '../validation.js';
import { sendCharacterGenStep } from '../chargen.js';
import { saveGameData } from '../utils.js';
import { client } from '../index.js';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } from 'discord.js';
import { CONSENT_TIMEOUT } from '../config.js';

export async function startGame(message, gameData) {
  const channelId = message.channel.id;
  const initiatorId = message.author.id; // Get the ID of the user who initiated the command
  const initiatorUsername = message.author.username;
  console.log('channelId:', channelId);
  const guildId = message.guild.id;
  const args = message.content.slice(1).trim().split(/ +/);
  let voiceChannelId = null; // Initialize voiceChannelId to null
  let gameMode = null; // Initialize gameMode to null

  if (message.channel.type === ChannelType.GuildVoice) {
    gameMode = "voice-plus-text"; // If the message is sent from a voice channel set it to voice mode.
    voiceChannelId = channelId;
  } else {
    gameMode = "text-only"; // Otherwise it is text-only.
  }

  // Use validateGameSetup to handle multi argument only.
  const validationResult = await validateGameSetup(message, args);

  const { valid, reason, gmId, playerIds } = validationResult;
  console.log('args:', args);
  if (!valid) {
    message.reply(reason);
    return;
  }

  gameData[channelId] = {
    gmId: gmId,
    players: {},
    playerOrder: playerIds,
    characterGenStep: 1,
    traitsRequested: false,
    textChannelId: channelId,
    guildId: guildId,
    voiceChannelId: voiceChannelId,
    gameMode: gameMode,
    gm: {}, // Initialize gm as an empty object
  };

  for (const playerId of playerIds) {
    gameData[channelId].players[playerId] = {
      playerUsername: client.users.cache.get(playerId).username
    };
  }
  saveGameData();

  console.log("gameData after initialization (Normal Mode):", gameData);

  // GM Consent
  try {
    const gm = message.guild.members.cache.get(gameData[channelId].gmId);
    const dmChannel = await gm.user.createDM();

    // Construct the GM notification message
    const playerMentions = playerIds.map(id => `<@${id}>`).join(', ');
    const gmNotification = `You have been designated as the GM for a new Ten Candles game by <@${initiatorId}>. \n\nOther players in the game are: ${playerMentions}`;

    // Send the notification DM to the GM
    await gm.user.send(gmNotification);

    const consentEmbed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle('GM Consent Required')
      .setDescription(
        `You have been designated as the GM role for a **Ten Candles** game in #${message.guild.name}. Do you consent to participate?`
      );

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('gm_consent_yes')
          .setLabel('Yes')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('gm_consent_no')
          .setLabel('No')
          .setStyle(ButtonStyle.Danger)
      );

    const consentMessage = await gm.user.send({
      embeds: [consentEmbed],
      components: [row],
    });

    message.channel.send('A new **Ten Candles** game is being started in this channel!');

    const gmFilter = (interaction) =>
      interaction.user.id === gameData[channelId].gmId && interaction.message.id === consentMessage.id;
    const collector = dmChannel.createMessageComponentCollector({
      filter: gmFilter,
      time: CONSENT_TIMEOUT,
    });

    collector.on('collect', async (interaction) => {
      await interaction.deferUpdate(); // Make sure the interaction isn't shown as failed
      if (interaction.customId === 'gm_consent_yes') {
        gameData[channelId].gm.consent = true;
        await interaction.editReply({
          content: 'You have consented to be the GM.',
          embeds: [],
          components: [],
        });
      } else if (interaction.customId === 'gm_consent_no') {
        gameData[channelId].gm.consent = false;
        await interaction.editReply({
          content: 'You have declined to be the GM.',
          embeds: [],
          components: [],
        });
      }
      collector.stop(); // Stop collecting responses after a button is clicked
    });

    collector.on('end', async (collected, reason) => {
      if (reason === 'time') {
        await consentMessage.edit({
          content: 'GM consent timed out.',
          embeds: [],
          components: [],
        });
      }
      if (!gameData[channelId].gm.consent) { //Changed from optional chaining, to checking for null.
        message.channel.send('The GM did not consent. Game cancelled.');
        delete gameData[channelId];
        saveGameData();
      }
    });
  } catch (error) {
    console.error('Error requesting GM consent:', error);
    message.channel.send(
      'GM consent failed. Please check the console for details. Game cancelled.'
    );
    delete gameData[channelId];
    saveGameData();
    return;
  }

  //Check for bots
  for (const playerId of playerIds) {
    const player = message.guild.members.cache.get(playerId);
    if (player.user.bot) {
      message.channel.send(`Player <@${playerId}> is a bot and cannot be a player. Game cancelled.`);
      delete gameData[channelId];
      saveGameData();
      return;
    }
  }

  // Player Consents (Concurrent)
  const playerConsentPromises = playerIds.map(async (playerId) => {
    try {
      const player = await message.guild.members.fetch(playerId);
      const user = player.user;
      const dmChannel = await user.createDM();

      const consentEmbed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('Player Consent Required')
        .setDescription(`You have been added as a player to a **Ten Candles** game in #${message.guild.name}. Do you consent to participate?`);

      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('player_consent_yes')
            .setLabel('Yes')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('player_consent_no')
            .setLabel('No')
            .setStyle(ButtonStyle.Danger)
        );

      const consentMessage = await user.send({ embeds: [consentEmbed], components: [row] });

      const playerFilter = (interaction) =>
        interaction.user.id === playerId && interaction.message.id === consentMessage.id;
      const collector = dmChannel.createMessageComponentCollector({
        filter: playerFilter,
        time: CONSENT_TIMEOUT,
      });

      return new Promise((resolve) => {
        collector.on('collect', async (interaction) => {
          await interaction.deferUpdate();
          if (interaction.customId === 'player_consent_yes') {
            gameData[channelId].players[playerId].consent = true;
            await interaction.editReply({ content: 'You have consented to play.', embeds: [], components: [] });
          } else if (interaction.customId === 'player_consent_no') {
            gameData[channelId].players[playerId].consent = false;
            await interaction.editReply({ content: 'You have declined to play.', embeds: [], components: [] });
          }
          collector.stop();
        });

        collector.on('end', async (collected, reason) => {
          if (reason === 'time') {
            await consentMessage.edit({ content: 'Consent timed out.', embeds: [], components: [] });
          }
          resolve(gameData[channelId].players[playerId].consent);
        });
      });
    } catch (error) {
      console.error(`Error requesting player ${playerId} consent:`, error);
      message.channel.send(`Player <@${playerId}> consent failed. Please check the console for details. Game cancelled.`);
      delete gameData[channelId];
      saveGameData();
      return false; // Indicate failure
    }
  });

  const playerConsentResults = await Promise.all(playerConsentPromises);
  if (playerConsentResults.includes(false) || !gameData[channelId].gm.consent) {
    const nonConsentPlayers = [];
    for (let i = 0; i < playerConsentResults.length; i++) {
      if (playerConsentResults[i] === false) {
        nonConsentPlayers.push(`<@${playerIds[i]}>`);
      }
    }
    if (!gameData[channelId].gm.consent) {
      nonConsentPlayers.push(`<@${gmId}>`); //add the gm if the gm did not consent.
    }
    // Send a DM to the GM with the list of non-consenting players
    const nonConsentList = nonConsentPlayers.join(", ");
    const gm = message.guild.members.cache.get(gameData[channelId].gmId);
    await gm.user.send(`The following players did not consent or timed out: ${nonConsentList}`);
    message.channel.send(`One or more players and/or the GM's consent check failed. Game cancelled.`);
    delete gameData[channelId];
    saveGameData();
    return;
  }

  let confirmationMessage = '**The World of Ten Candles**\n';
  confirmationMessage += 'Your characters will face unimaginable terrors in the dying of the light.\n\n';
  confirmationMessage += '**Though you know your characters will die, you must have hope that they will survive.**\n\n';
  confirmationMessage += '**Ten Candles** focuses around shared narrative control.\n';
  confirmationMessage += 'Everyone will share the mantle of storyteller and have an equal hand in telling this dark story.\n\n';
  confirmationMessage += 'Let\'s begin character generation.\nUse the `.nextstep` command to proceed.';

  if (gameMode === 'voice-plus-text') {
    confirmationMessage += `\n\n**Voice Channel:** This channel has been set up for audio playback.`;
  } else {
    confirmationMessage += '\n\n**Text-Only Mode:** Audio playback is not supported in this channel. Final recordings will be text-only.';
  }
  message.channel.send(confirmationMessage)
    .then(() => {
      sendCharacterGenStep(message, channelId);
    })
    .catch((error) => {
      console.error('Error sending initial message:', error);
      message.channel.send('Failed to send initial message. Check the console for details. Game cancelled.');
      delete gameData[channelId];
      saveGameData();
    });
}

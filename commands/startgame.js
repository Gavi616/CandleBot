import { validateGameSetup } from '../validation.js';
import { sendCharacterGenStep } from '../chargen.js';
import { saveGameData } from '../utils.js';
import { client } from '../index.js';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export async function startGame(message, gameData) {
  const channelId = message.channel.id;
  console.log('channelId:', channelId);
  const guildId = message.guild.id;
  const args = message.content.slice(1).trim().split(/ +/);
  let voiceChannelId = null; // Initialize voiceChannelId to null
  let gameMode = null; // Initialize gameMode to null

  if (args.length === 1) {
    const { valid, reason, gmId, playerIds } = await validateGameSetup(message, args, true);
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
      gm: {}, // Initialize gm as an empty object
    };

    for (const playerId of playerIds) {
      gameData[channelId].players[playerId] = {
        playerUsername: client.users.cache.get(playerId).username
      };
    }

    saveGameData();
    console.log("gameData after initialization (Testing Mode):", gameData); //Print the gameData.

    // GM Consent (Modified)
    try {
        const gm = message.guild.members.cache.get(gameData[channelId].gmId);
        const dmChannel = await gm.user.createDM();

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
            time: 60000,
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

    sendCharacterGenStep(message, channelId);
    return;
  } else { //Check if the game has additional arguments.
    const { valid, reason, gmId, playerIds } = await validateGameSetup(message, args, false);
    console.log('args:', args);
    if (!valid) {
      message.reply(reason);
      return;
    }
    //If there are enough arguments, check for gameMode and voice channel.
    if (args.length >= 4) { //Check if there are at least 4 arguments.
      gameMode = args.at(-2).toLowerCase(); //Get the second to last argument and save it as gameMode.
      if (gameMode === 'voice-plus-text') {
        voiceChannelId = args.at(-1).replace(/<#|>/g, ''); //Get the last argument, and clean it, and save it as voiceChannelId.
      } else {
        gameMode = "text-only"; //If the mode is not voice, set it to text-only.
      }
    } else {
      gameMode = "text-only"; //If there are not enough arguments, set to text only.
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
  }

  saveGameData();
  console.log("gameData after initialization (Normal Mode):", gameData); //Print the gameData.

  // GM Consent
  try {
    const gm = message.guild.members.cache.get(gameData[channelId].gmId);
    const dmChannel = await gm.user.createDM();

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

    message.channel.send('A new **Ten Candles** game has been started in this channel!'); //The GM message.

    const gmFilter = (interaction) =>
      interaction.user.id === gameData[channelId].gmId && interaction.message.id === consentMessage.id;
    const collector = dmChannel.createMessageComponentCollector({
      filter: gmFilter,
      time: 60000,
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

  // Player Consents (Concurrent)
  const playerConsentPromises = gameData[channelId].playerOrder.map(async (playerId) => {
    try {
      const player = await message.guild.members.fetch(playerId);
      const user = player.user;

      if (user.bot) {
        message.channel.send(`Player <@${playerId}> is a bot and cannot be a player. Game cancelled.`);
        delete gameData[channelId];
        saveGameData();
        return false; // Indicate failure
      }
      try {
          const dmChannel = await user.createDM();
          await user.send(`You have been added as a player to a **Ten Candles** game in #${message.guild.name}. Do you consent to participate? (y/n) You have 60 seconds to respond.`); //Player Message.
      } catch (error) {
            message.channel.send(`Could not send DM to Player: <@${playerId}>. Game cancelled.`);
            delete gameData[channelId];
            saveGameData();
        return false; // Indicate failure
      }

      const filter = m => m.author.id === playerId && (m.content.toLowerCase().startsWith('y') || m.content.toLowerCase().startsWith('n'));
      const collected = await dmChannel.awaitMessages({ filter, max: 1, time: 60000, errors: ['time'] });

      gameData[channelId].players[playerId].consent = collected.size > 0 && collected.first().content.toLowerCase().startsWith('y');

      if (!gameData[channelId].players[playerId].consent) {
        message.channel.send(`Player <@${playerId}> did not consent. Game cancelled.`);
        delete gameData[channelId];
        saveGameData();
        return false; // Indicate failure
      }
      return true; // Indicate success
    } catch (error) {
      console.error(`Error requesting player ${playerId} consent:`, error);
      if (error.message === 'time') {
        message.channel.send(`Player <@${playerId}> consent timed out. Game cancelled.`);
      } else {
        message.channel.send(`Player <@${playerId}> consent failed. Please check the console for details. Game cancelled.`);
      }
      delete gameData[channelId];
      saveGameData();
      return false; // Indicate failure
    }
  });

  const playerConsentResults = await Promise.all(playerConsentPromises);

  if (playerConsentResults.includes(false) || !gameData[channelId].gm.consent) {
    // A player did not consent or an error occurred
    return; // Stop the startGame function
  }

  let confirmationMessage = '**The World of Ten Candles**\n';
  confirmationMessage += 'Your characters will face unimaginable terrors in the dying of the light.\n\n';
  confirmationMessage += '**Though you know your characters will die, you must have hope that they will survive.**\n\n';
  confirmationMessage += '**Ten Candles** focuses around shared narrative control.\n';
  confirmationMessage += 'Everyone will share the mantle of storyteller and have an equal hand in telling this dark story.\n\n';
  confirmationMessage += 'Let\'s begin character generation.\nUse the `.nextstep` command to proceed.';

  if (gameMode === 'voice-plus-text') {
    confirmationMessage += `\n\n**Voice Channel:** <#${voiceChannelId}> has been set up for audio playback.`;
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
  } else {
    confirmationMessage += '\n\n**Text-Only Mode:** Audio playback is not supported in this channel. Final recordings will be text-only.';
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
}

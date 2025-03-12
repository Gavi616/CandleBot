import { validateGameSetup } from '../validation.js';
import { saveGameData } from '../utils.js';
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { sendCharacterGenStep } from '../chargen.js';

export async function startGame(message, gameData) {
  const channelId = message.channel.id;
  const args = message.content.split(' ').slice(1);

  const validationResult = await validateGameSetup(message, args, false);
  if (!validationResult.valid) {
    message.reply(validationResult.reason);
    return;
  }

  const { gmId, playerIds } = validationResult;

  // Detect if the command is used in a voice channel
  const voiceChannel = message.member.voice.channel;
  const gameMode = voiceChannel ? 'voice-plus-text' : 'text-only';
  const voiceChannelId = voiceChannel ? voiceChannel.id : null;

  gameData[channelId] = {
    dicePool: -1,
    scene: 0,
    characterGenStep: 1,
    players: {},
    diceLost: 0,
    traitsRequested: false,
    playerOrder: playerIds,
    gmId: gmId,
    gameMode: gameMode,
    voiceChannelId: voiceChannelId,
    textChannelId: channelId,
    brinkResponses: {},
    gm: {
      consent: false,
      gmUsername: message.guild.members.cache.get(gmId).user.username,
      brink: '',
    },
  };

  for (const playerId of playerIds) {
    gameData[channelId].players[playerId] = {
      consent: false,
      playerUsername: message.guild.members.cache.get(playerId)?.user.username || 'Unknown Player',
      virtue: '',
      virtueBurned: false,
      vice: '',
      viceBurned: false,
      moment: '',
      momentBurned: false,
      brink: '',
      name: '',
      look: '',
      concept: '',
      recording: '',
      hopeDice: 0,
      isDead: false,
    };
  }

  saveGameData();

  // GM Consent (Modified)
  try {
    const gm = message.guild.members.cache.get(gmId);
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

    const gmFilter = (interaction) =>
      interaction.user.id === gmId && interaction.message.id === consentMessage.id;
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
      if (!gameData[channelId]?.gm?.consent) {
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
  const playerConsentPromises = playerIds.map(async (playerId) => {
    try {
      const player = await message.guild.members.fetch(playerId);
      const user = player.user;

      if (user.bot) {
        message.channel.send(`Player <@${playerId}> is a bot and cannot be a player. Game cancelled.`);
        delete gameData[channelId];
        saveGameData();
        return false; // Indicate failure
      }

      const dmChannel = await user.createDM();
      await user.send(`You have been added as a player to a **Ten Candles** game in #${message.guild.name}. Do you consent to participate? (y/n) You have 60 seconds to respond.`);

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

  if (playerConsentResults.includes(false)) {
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

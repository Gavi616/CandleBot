import 'dotenv/config';
import {
  Client, EmbedBuilder, ChannelType, GatewayIntentBits, MessageMentions,
  PermissionsBitField, AttachmentBuilder, MessageFlags, ButtonStyle,
  StringSelectMenuBuilder, ActionRowBuilder, ButtonBuilder, ComponentType
} from 'discord.js';
import fs from 'fs';
import { getHelpEmbed } from './embed.js';
import { TEST_USER_ID, finalRecordingsMessage, languageOptions } from './config.js';
import {
  sanitizeString, loadGameData, saveGameData, getGameData, printActiveGames, getAudioDuration,
  loadBlocklist, saveBlocklist, gameData, blocklist, handleGearCommand, sendTestDM, deleteGameData,
  playAudioFromUrl, playRandomConflictSound, speakInChannel, requestConsent
} from './utils.js';
import { sendCharacterGenStep } from './chargen.js';
import { prevStep } from './steps.js';
import { startGame } from './commands/startgame.js';
import { conflict } from './commands/conflict.js';
import { gameStatus } from './commands/gamestatus.js';
import { removePlayer } from './commands/removeplayer.js';
import { leaveGame } from './commands/leavegame.js';
import { cancelGame } from './commands/cancelgame.js';
import { died } from './commands/died.js';
import { getVoiceConnection, joinVoiceChannel } from '@discordjs/voice';

export const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers, GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.GuildVoiceStates] });

const prefix = '.';
const version = '0.9.939a';
const botName = 'Ten Candles Bot';
export const isTesting = false;
let botRestarted = false;

client.once('ready', async () => {
  const startupTimestamp = new Date().toLocaleString();
  console.log(`${botName} (v${version}) is ready @ ${startupTimestamp}`);
  console.log(`Logged in as ${client.user.tag} (${client.user.id})`);

  const serverIds = client.guilds.cache.map(guild => guild.id).join(', ');
  console.log(`${botName} is in ${client.guilds.cache.size} server${client.guilds.cache.size === 1 ? '' : 's'} (${serverIds}).`)

  console.log(`Command prefix is ${prefix}`);
  console.log(`Use ${prefix}help for a list of commands.`);

  if (!fs.existsSync('config.js')) {
    console.error('Configuration file not found. Please create a config.js file or copy one from https://github.com/Gavi616/CandleBot');
    return;
  }

  if (isTesting) {
    console.log('-- Testing Mode Engaged! --');
    await sendTestDM(client, 'Listening for test commands.');
    return;
  }

  loadBlocklist();
  loadGameData();
  printActiveGames();

  if (!isTesting) {
    if (Object.keys(gameData).length > 0) {
      botRestarted = true;
      for (const channelId in gameData) {
        const game = gameData[channelId];
        const channel = client.channels.cache.get(channelId);
        if (channel) {
          await channel.send(`**${botName}** has restarted and found one or more games in-progress.`);
          if (game.characterGenStep < 9) {
            await channel.send("Character generation was in progress.\nRestarting character generation from last successful step.\n*If this occurrs repeatedly, contact the developer and/or consider using `.cancelgame`*");
            await sendCharacterGenStep(channel, game);
          } else if (game.inLastStand) {
            if (Object.values(game.players).every(player => player.isDead)) {
              if (game.endGame) {
                await channel.send("The game has ended. Restarting **Session Data Management** processes.");
                await cancelGame(channel);
              } else {
                await channel.send("All characters are dead. Restarting the **Final Recordings**.");
                await playRecordings(channel);
              }
            } else {
              await gameStatus(channel);
              await channel.send("We are in **The Last Stand**. GM continues narration until all characters have `.died @PlayerId [cause]`");
            }
          } else if (game.inLastStand) {
            if (Object.values(game.players).every(player => player.isDead)) {
              if (game.endGame) {
                await channel.send("The game has ended. Restarting **Session Data Management** processes.");
                await cancelGame(channel);
              } else {
                await channel.send("All characters are dead. Restarting the **Final Recordings**.");
                await playRecordings(channel);
              }
            } else {
              await gameStatus(channel);
              await channel.send("We are in **The Last Stand**. GM continues narration until all characters have `.died @PlayerId [cause]`");
            }
          } else {
            await gameStatus(channel);
            await channel.send("GM continues narration until a Player uses `.conflict` to move the story forward.");
          }
        }
      }
      botRestarted = false;
    }
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

  if (interaction.message.embeds.length > 0 && interaction.message.embeds[0].title === 'Test Google Cloud TTS') {
    // Handle testTTS interactions here
    if (interaction.customId === 'preview_voice') {
      // Handle preview_voice button click
      return;
    } else if (interaction.customId === 'language_select' || interaction.customId === 'voice_select') {
      return;
    }
  }

  const game = findGameByUserId(interaction.user.id);
  if (!game) {
    console.error("Game not found for interaction.", interaction);
    return;
  }

  // Disable buttons after interaction
  if (interaction.isButton()) {
    const row = ActionRowBuilder.from(interaction.message.components[0]);
    row.components.forEach(component => component.setDisabled(true));
    await interaction.update({ components: [row] });
  }

  if (interaction.customId.startsWith('final_recording_')) {
    // Handle final recording confirmation
    if (interaction.customId === 'final_recording_yes') {
      interaction.editReply({ content: 'Your final recording has been received.' });
    } else if (interaction.customId === 'final_recording_no') {
      interaction.editReply({ content: 'Your recording has been saved, but you can send another one if you wish.' });
    }
  } else if (interaction.customId.startsWith('tts_consent_')) {
    // Handle TTS consent
    if (interaction.customId === 'tts_consent_yes') {
      interaction.editReply({ content: 'You have consented to use Text-to-Speech.' });
    } else if (interaction.customId === 'tts_consent_no') {
      interaction.editReply({ content: 'You have declined to use Text-to-Speech.' });
    }
  } else if (interaction.customId.startsWith('language_select') || interaction.customId.startsWith('voice_select') || interaction.customId.startsWith('preview_voice') || interaction.customId.startsWith('use_voice')) {
    // Handle voice preference
    await handleVoicePreferenceInteraction(interaction, game);
  } else if (interaction.customId === 'sacrifice_yes' || interaction.customId === 'sacrifice_no') {
    if (interaction.customId === 'sacrifice_yes') {
      await interaction.editReply({ content: 'You have chosen to sacrifice your character for narration rights!' });
    } else {
      await interaction.editReply({ content: 'You chose not to sacrifice your character.' });
    }
  } else if (interaction.customId === 'brink_yes' || interaction.customId === 'brink_no') {
    if (interaction.customId === 'brink_yes') {
      await interaction.editReply({ content: 'You embraced your Brink!' });
    } else {
      await interaction.editReply({ content: 'You chose not to embrace your Brink, for now.' });
    }
  } else if (interaction.customId === 'cancel_game_yes' || interaction.customId === 'cancel_game_no') {
    if (interaction.customId === 'cancel_game_yes') {
      await interaction.editReply({ content: 'Game cancelled.' });
    } else {
      await interaction.editReply({ content: 'Game cancellation aborted.' });
    }
  } else if (interaction.customId === 'input_yes' || interaction.customId === 'input_no') {
    return;
  } else if (interaction.customId.startsWith('player_consent_') || interaction.customId.startsWith('gm_consent_')) {
    if (interaction.customId === 'player_consent_yes') {
      interaction.editReply({ content: 'You have consented to play.' });
    } else if (interaction.customId === 'player_consent_no') {
      interaction.editReply({ content: 'You have declined to play.' });
    } else if (interaction.customId === 'gm_consent_yes') {
      interaction.editReply({ content: 'You have consented to GM.' });
    } else if (interaction.customId === 'gm_consent_no') {
      interaction.editReply({ content: 'You have declined to GM.' });
    }
  } else if (interaction.customId === 'moment') {
    return;
  } else {
    console.warn(`Unhandled interaction: ${interaction.customId}`);
  }
});

export function findGameByUserId(userId) {
  return Object.values(gameData).find(game =>
    game.gmId === userId || (game.players && game.players[userId])
  );
}

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const channelId = message.channel.id;
  const userId = message.author.id;
  const userName = message.author.username;

  const args = message.content.slice(prefix.length).split(/ +/);
  const command = args.shift().toLowerCase();

  if (message.channel.type === ChannelType.DM) {
    if (message.content.startsWith(prefix)) {
      console.log('Command:', message.content, 'from', userName, 'in a Direct Message.');
    }

    if (isTesting && command.startsWith('test')) {
      if (command === 'testrecording') {
        await testRecordingCommand(message, args);
      } else if (command === 'testdicesounds') {
        await testDiceSounds(message, args);
      } else if (command === 'testtts') {
        await testTTS(message, args);
      } else {
        await message.author.send(`Test command: \`.${command}\` not implemented.`);
      }
    }

    const game = findGameByUserId(userId);
    if (!game) {
      try {
        await message.author.send(`You are not currently in a game in any channel.`);
      } catch (error) {
        console.error('Could not send DM to user:', error);
      }
      return;
    }

    if (message.content.toLowerCase() === '.x') {
      const gameChannelId = Object.keys(gameData).find(key => gameData[key] === game);
      if (gameChannelId) {
        const gameChannel = client.channels.cache.get(gameChannelId);
        if (gameChannel) {
          gameChannel.send(`One or more players and/or the GM have asked the acting player or GM to please quickly move on from the current action or scene.`);
        }
      }
    } else if (message.content.toLowerCase() === '.me') {
      me(message);
    } else if (message.content.toLowerCase().startsWith('.gear')) {
      const args = message.content.slice(prefix.length).split(/ +/);
      const command = args.shift().toLowerCase();
      const player = game.players[userId];
      if (game.characterGenStep === 7 || (game.characterGenStep > 7 && !game.inLastStand)) {
        await handleGearCommand(message.author, game, userId, args);
      } else {
        await message.author.send(`The \`.gear\` command can only be used during Character Generation Step 7 or during a scene.`);
      }
    } else if (game.characterGenStep === 8) {
      await handleFinalRecording(message);
    }
  }

  if (message.channel.type !== ChannelType.DM) {
    if (message.content.startsWith(prefix)) {
      const args = message.content.slice(prefix.length).split(/ +/);
      const command = args.shift().toLowerCase();
      console.log('Command:', message.content, 'from', userName, 'in ' + message.channel.name);

      if (blocklist[userId] && command === 'startgame') {
        await message.author.send(`Message removed. You are blocked from using the \`.startgame\` command.`);
        try {
          await message.delete();
        } catch (deleteError) {
          console.error(`Failed to delete message in <#${channelId}>: ${deleteError.message}`);
        }
        return;
      }

      const game = gameData[channelId];
      const gameRequiredCommands = ['conflict', 'nextstep', 'gamestatus', 'removeplayer', 'leavegame', 'cancelgame', 'died', 'me', 'x', 'theme'];
      if (gameRequiredCommands.includes(command)) {
        if (!game) {
          await message.author.send({ content: `Message removed. There is no **Ten Candles** game in progress in <#${channelId}>.` });
          try {
            await message.delete();
          } catch (deleteError) {
            console.error(`Failed to delete message in <#${channelId}>: ${deleteError.message}`);
          }
          return;
        }
        if (!game.players[userId] && game.gmId !== userId) {
          await message.author.send({ content: `Message removed. You are not a participant in the **Ten Candles** game in <#${channelId}>.` });
          try {
            await message.delete();
          } catch (deleteError) {
            console.error(`Failed to delete message in <#${channelId}>: ${deleteError.message}`);
          }
          return;
        }
      }

      // Channel command handling
      if (command === 'help') {
        const isAdmin = message.member.permissions.has('Administrator');
        const helpEmbed = getHelpEmbed(isAdmin, message);
        await message.channel.send({ embeds: [helpEmbed.help] });
      } else if (command === 'startgame') {
        await startGame(message, gameData);
      } else if (command === 'conflict' || command === 'c') {
        await conflict(message, args, gameData);
      } else if (command === 'theme') {
        await setTheme(message, args);
      } else if (command === 'nextstep') {
        await nextStep(message);
      } else if (command === 'prevstep') {
        await prevStep(message);
      } else if (command === 'gamestatus') {
        await gameStatus(message);
      } else if (command === 'removeplayer') {
        await removePlayer(message, args);
      } else if (command === 'leavegame') {
        await leaveGame(message, args);
      } else if (command === 'cancelgame') {
        await cancelGame(message);
      } else if (command === 'died') {
        await died(message, args);
      } else if (command === 'block') {
        await blockUser(message, args);
      } else if (command === 'unblock') {
        await unblockUser(message, args);
      }
    }
  }
});

async function me(message) {
  const playerId = message.author.id;
  const game = findGameByUserId(playerId);
  const channelId = message.channel.id;

  if (message.channel.type !== ChannelType.DM) {
    try {
      await message.delete();
      await message.author.send({ content: 'The `.me` command can only be used in a direct message.' });
    } catch (error) {
      console.error('Could not send DM to user:', error);
    }
    return;
  }

  if (!game) {
    await message.author.send(`You are not currently in a game in any channel.`);
    return;
  }
  const player = game.players[playerId];
  const gameChannelId = Object.keys(gameData).find(key => gameData[key] === game);

  const characterEmbed = new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle(`Character Sheet: ${player ? player.name || message.author.username : message.author.username}`)
    .addFields(
      { name: 'Virtue', value: player ? player.virtue || 'Not set' : 'Not set', inline: true },
      { name: 'Vice', value: player ? player.vice || 'Not set' : 'Not set', inline: true },
      { name: 'Moment', value: player ? player.moment || 'Not set' : 'Not set' },
      { name: 'Brink', value: player ? player.brink || 'Not set' : 'Not set' },
      { name: 'Hope Dice', value: player ? player.hopeDice.toString() || '0' : '0' },
      { name: 'Recordings', value: player ? player.recordings || 'Not set' : 'Not set' },
      { name: 'Is Dead', value: player ? player.isDead ? 'Yes' : 'No' : 'No' },
      { name: 'Virtue Burned', value: player ? player.virtueBurned ? 'Yes' : 'No' : 'No', inline: true },
      { name: 'Vice Burned', value: player ? player.viceBurned ? 'Yes' : 'No' : 'No', inline: true },
      { name: 'Moment Burned', value: player ? player.momentBurned ? 'Yes' : 'No' : 'No' },
      { name: 'Gear', value: player && player.gear ? player.gear.join(', ') : 'No Gear' },
      { name: 'Active Game Channel:', value: `<#${gameChannelId}>` },
    )
    .setTimestamp();

  try {
    await message.author.send({ embeds: [characterEmbed] });
  } catch (error) {
    console.error('Could not send character sheet DM: ', error.message);
  }
}

export async function startTruthsSystem(client, message, channelId) {
  const game = gameData[channelId];
  const playerOrder = game.playerOrder;
  const gmId = game.gmId;
  const litCandles = 11 - game.scene;

  let truthSpeakerIndex = 0;
  if (game.diceLost > 0) {
    truthSpeakerIndex = playerOrder.indexOf(message.author.id);
  } else {
    truthSpeakerIndex = playerOrder.indexOf(gmId);
  }

  let truthOrderMessage = "";
  for (let i = 0; i < litCandles; i++) {
    const speakerId = playerOrder[truthSpeakerIndex];
    const player = game.players[speakerId];
    if (player) {
      truthOrderMessage += `Truth ${i + 1}>: <@${speakerId}>${player.isDead ? " (Ghost)" : ""}\n`;
    }
    truthSpeakerIndex = (truthSpeakerIndex + 1) % playerOrder.length;
  }

  const livingPlayers = playerOrder.filter(playerId => game.players[playerId] && !game.players[playerId].isDead);
  let finalTruthMessage = "";
  if (livingPlayers.length > 0) {
    finalTruthMessage = "*(Living characters only)* All together: **And we are alive.**";
  }

  let fullMessage = `GM only: **These things are true. The world is dark.**\n\n`;

  if (truthOrderMessage) {
    fullMessage += `Establishing Truths order:\n${truthOrderMessage}\n\n`;
  }

  fullMessage += `${finalTruthMessage}`;

  message.channel.send(fullMessage);

  game.diceLost = 0;

  saveGameData();
}

function blockUser(message, args) {
  if (!message.member.permissions.has('Administrator') && !message.member.permissions.has('KickMembers')) {
    message.channel.send('Only administrators or users with the `Kick Members` permission can use this command.');
    return;
  }

  const userId = args[0];
  const reason = args.slice(1).join(' ') || 'No reason provided.';
  if (!blocklist[userId]) {
    blocklist[userId] = sanitizeString(reason);
    saveBlocklist();
    if (message) {
      message.channel.send(`${userId} has been added to the blocklist. Reason: ${reason}`);
    }
  } else {
    if (message) {
      message.channel.send(`${userId} is already on the blocklist. Reason: ${blocklist[userId]}`);
    }
  }

  saveGameData();
}

function unblockUser(message, args) {
  if (!message.member.permissions.has('Administrator') && !message.member.permissions.has('KickMembers')) {
    message.channel.send('Only administrators or users with the `Kick Members` permission can use this command.');
    return;
  }

  const userId = args[0];
  if (blocklist[userId]) {
    delete blocklist[userId];
    saveBlocklist();
    if (message)
      message.channel.send(`${userId} has been removed from the blocklist.`);
  } else {
    if (message)
      message.channel.send(`${userId} is not on the blocklist.`);
  }

  saveGameData();
}

export async function setTheme(message, args) {
  const channelId = message.channel.id;
  const game = gameData[channelId];

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

    saveGameData();
    return;
  }

  const themeDescription = args.join(' ').trim();

  if (themeDescription) { game.theme = themeDescription; }

  if (game.characterGenStep === 2) {
    game.characterGenStep++;
    saveGameData();
    const gameChannel = message.guild.channels.cache.get(game.textChannelId);
    sendCharacterGenStep(gameChannel, game);
  }
}

async function handleFinalRecording(message) {
  const userId = message.author.id;
  const game = findGameByUserId(userId);

  if (!game) return;
  if (game.characterGenStep !== 8) return;
  if (!game.players[userId]) return;

  const player = game.players[userId];

  if (message.attachments.size > 0) {
    const attachment = message.attachments.first();
    if (attachment.contentType.startsWith('audio/')) {
      player.recording = attachment.url;
    }
  } else {
    player.recording = message.content;
  }

  const isFinal = await requestConsent(message.author, 'Are you happy with this recording?', 'final_recording_yes', 'final_recording_no', 60000, 'Final Recording Confirmation');

  if (isFinal) {
    await message.author.send('Your final recording has been received.');
    const allPlayersHaveRecordings = Object.values(game.players).every(player => player.recording);
    if (allPlayersHaveRecordings) {
      await playRecordings(message);
    }
  } else {
    await message.author.send('Your recording has been saved, but you can send another one if you wish.');
  }
}

export async function playRecordings(message) {
  const channelId = message.channel.id;
  const game = gameData[channelId];
  const players = game.players;

  message.channel.send(finalRecordingsMessage);
  message.channel.send(finalRecordingsMessage);

  // Total of 13 second 'moment of silence'
  await new Promise(resolve => setTimeout(resolve, 10000));
  let delay = 3000;

  const playerIds = Object.keys(players);

  async function playNextRecording(index) {
    if (index >= playerIds.length) {
      await cancelGame(message);
      return;
    }

    const userId = playerIds[index];

    setTimeout(async () => {
      if (players[userId].recording) {
        if (game.gameMode === 'voice-plus-text') {
          const voiceChannelId = game.voiceChannelId;
          const voiceChannel = client.channels.cache.get(voiceChannelId);

          // Voice Channel Connection Check
          const existingConnection = getVoiceConnection(message.guild.id);
          if (!existingConnection) {
            if (voiceChannel && voiceChannel.type === ChannelType.GuildVoice) {
              try {
                joinVoiceChannel({
                  channelId: voiceChannelId,
                  guildId: message.guild.id,
                  adapterCreator: message.guild.voiceAdapterCreator,
                });
                console.log(`Joined voice channel: ${voiceChannel.name}`);
              } catch (error) {
                console.error('Failed to join voice channel:', error);
                message.channel.send('Failed to join voice channel. Playing back in text only.');
                game.gameMode = "text-only";
              }
            } else {
              console.error(`Voice channel ${voiceChannelId} not found.`);
              message.channel.send('Voice channel not found. Playing back in text only.');
              game.gameMode = "text-only";
            }
          }

          if (players[userId].recording.startsWith('http')) {
            try {
              message.channel.send(`Playing *${players[userId].name}'s final message...*`);
              await playAudioFromUrl(players[userId].recording, voiceChannel);
            } catch (error) {
              console.error(`Error playing audio recording for ${userId}:`, error);
              message.channel.send(`Error playing recording for <@${userId}>. Check console for details.`);
            }
          } else {
            if (players[userId].language && players[userId].voice) {
              const verbiage = players[userId].recording;
              await message.channel.send(`Playing *${players[userId].name}'s final message...*`);
              await speakInChannel(verbiage, voiceChannel, players[userId].voice);
            } else {
              message.channel.send(`Playing *${players[userId].name}'s final message...*`);
              message.channel.send(players[userId].recording);
            }
          }
        } else {
          if (players[userId].recording.startsWith('http')) {
            const duration = await getAudioDuration(players[userId].recording);
            message.channel.send(`Click the link to listen to ${players[userId].name}'s final message: ${players[userId].recording}`);
            if (duration) {
              await new Promise(resolve => setTimeout(resolve, duration));
            }
          } else {
            message.channel.send(`Playing *${players[userId].name}'s final message...*`);
            message.channel.send(players[userId].recording);
          }
        }
      } else {
        message.channel.send(`No playable recording found for <@${userId}> / ${players[userId].name}.`);
      }

      await playNextRecording(index + 1);
    }, delay);
  }

  await playNextRecording(0);
  saveGameData();
}

export async function testRecordingCommand(message, args) {
  const targetChannelId = args[0];
  const targetChannel = client.channels.cache.get(targetChannelId);

  if (!targetChannel) {
    await message.channel.send(`Could not find channel with ID: ${targetChannelId}`);
    return;
  }

  if (targetChannel.type !== ChannelType.GuildText && targetChannel.type !== ChannelType.GuildVoice) {
    await message.channel.send(`Channel ${targetChannel.name} is not a valid text or voice channel.`);
    return;
  }

  if (targetChannel.type === ChannelType.GuildVoice) {
    const existingConnection = getVoiceConnection(targetChannel.guild.id);
    if (!existingConnection) {
      joinVoiceChannel({
        channelId: targetChannelId,
        guildId: targetChannel.guild.id,
        adapterCreator: targetChannel.guild.voiceAdapterCreator,
      });
      console.log(`Joined voice channel: ${targetChannel.name}`);
    }
  }
}

async function testDiceSounds(message, args) {
  try {
    const channelId = args[0];

    let voiceChannel = client.channels.cache.get(channelId);

    if (!voiceChannel) {
      try {
        voiceChannel = await client.channels.fetch(channelId);
      } catch (error) {
        await message.channel.send(`Voice channel with ID ${channelId} not found.`);
        return;
      }
    }

    if (!voiceChannel) {
      await message.channel.send(`Voice channel with ID ${channelId} not found.`);
      return;
    }

    const guildId = voiceChannel.guildId;

    if (!guildId) {
      await message.channel.send(`Could not determine guild ID from channel ID ${channelId}.`);
      return;
    }

    const guild = client.guilds.cache.get(guildId);

    if (!guild) {
      await message.channel.send(`Guild with ID ${guildId} not found.`);
      return;
    }

    if (voiceChannel.type !== ChannelType.GuildVoice) {
      await message.channel.send(`Channel ${channelId} is not a voice channel.`);
      return;
    }

    const existingConnection = getVoiceConnection(guildId);
    if (!existingConnection) {
      joinVoiceChannel({
        channelId: channelId,
        guildId: guildId,
        adapterCreator: guild.voiceAdapterCreator,
      });
    }

    await playRandomConflictSound(voiceChannel);
    await message.channel.send('Sending the playRandomConflictSound() call.');
  } catch (error) {
    await message.channel.send('An error occurred while testing dice sounds.');
  }
}

export async function testTTS(message, args) {
  const voiceChannelId = args[0];

  if (!voiceChannelId) {
    message.reply('Usage: .testtts <voiceChannelID>');
    return;
  }

  const voiceChannel = client.channels.cache.get(voiceChannelId);

  if (!voiceChannel || voiceChannel.type !== ChannelType.GuildVoice) {
    message.reply('Invalid voice channel ID.');
    return;
  }

  buttonCollector.on('collect', async (interaction) => {
    await interaction.deferUpdate();

    if (interaction.customId === 'preview_voice') {
      if (!selectedLanguage || !selectedVoice) {
        await interaction.followUp({ content: 'Please select a language and voice first.', ephemeral: true });
        return;
      }

      const existingConnection = getVoiceConnection(voiceChannel.guild.id);
      if (!existingConnection) {
        joinVoiceChannel({
          channelId: voiceChannelId,
          guildId: voiceChannel.guild.id,
          adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        });
      }

      const languageVerbiage = {
        'en-US': `This is a voice preview for <@${message.author.username}> in ${languageOptions['en-US'].name} using Google Cloud Text-To-Speech.`,
        'en-GB': `This is a voice preview for <@${message.author.username}> in ${languageOptions['en-GB'].name} using Google Cloud Text-To-Speech.`,
        'es-ES': `Esta es una vista previa de voz para <@${message.author.username}> en ${languageOptions['es-ES'].name} usando Google Cloud Text-To-Speech.`,
        'fr-FR': `Ceci est un aperçu vocal pour <@${message.author.username}> en ${languageOptions['fr-FR'].name} utilisant Google Cloud Text-To-Speech.`,
        'de-DE': `Dies ist eine Sprachvorschau für <@${message.author.username}> in ${languageOptions['de-DE'].name} mit Google Cloud Text-To-Speech.`,
      };

      const verbiage = languageVerbiage[selectedLanguage];
      await message.channel.send(`Previewing TTS voice ${selectedVoice} in <#${voiceChannelId}>.`);
      await speakInChannel(verbiage, voiceChannel, selectedVoice);
    }
  });

  collector.on('end', async (collected, reason) => {
    if (reason === 'time') {
      await embedMessage.edit({ content: 'Test command timed out.', components: [] });
    }
  });
}

client.login(process.env.DISCORD_TOKEN);
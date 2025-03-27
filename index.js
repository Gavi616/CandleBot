import 'dotenv/config';
import { Client, EmbedBuilder, ChannelType, GatewayIntentBits, PermissionsBitField, AttachmentBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import fs from 'fs';
import { getHelpEmbed } from './embed.js';
import { finalRecordingsMessage } from './config.js';
import {
  sanitizeString, loadGameData, saveGameData, getGameData, printActiveGames,
  loadBlocklist, saveBlocklist, gameData, blocklist, handleGearCommand, slowType
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
import { createAudioPlayer, createAudioResource, getVoiceConnection, joinVoiceChannel, AudioPlayerStatus } from '@discordjs/voice';

export const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers, GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.GuildVoiceStates] });

const prefix = '.';
const version = '0.9.933a';
const botName = 'Ten Candles Bot';
const isTesting = false;
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
    return;
  }

  loadBlocklist();
  loadGameData();
  printActiveGames();

  // Check for a restart
  if (!isTesting) {
    if (Object.keys(gameData).length > 0) {
      botRestarted = true;
      for (const channelId in gameData) {
        const game = gameData[channelId];
        const channel = client.channels.cache.get(channelId);
        if (channel) {
          await channel.send(`**${botName}** has restarted and found one or more games in-progress.`);
          if (game.characterGenStep < 9) {
            await channel.send("Character generation was in progress.\nRestarting character generation from last successful step.\n*If this occurrs multiple times in a row, contact the developer.*");
            await sendCharacterGenStep(channel, game);
          } else {
            await gameStatus(channel);
            await channel.send("Players can use `.conflict` to take action to move the game forward.");
          }
        }
      }
      botRestarted = false;
    }
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const game = findGameByUserId(interaction.user.id);
  if (!game) {
    console.error("Game not found for interaction.", interaction);
    if (!interaction.replied) {
      await interaction.reply({ content: 'No game found.', ephemeral: true });
    }
    return;
  }

  if (interaction.customId === 'gm_consent_yes' || interaction.customId === 'gm_consent_no' || interaction.customId === 'player_consent_yes' || interaction.customId === 'player_consent_no' || interaction.customId === 'input_yes' || interaction.customId === 'input_no') {
    return;
  }

  const row = ActionRowBuilder.from(interaction.message.components[0]);
  row.components.forEach(component => component.setDisabled(true));
  await interaction.update({ components: [row] });

  if (interaction.customId === 'sacrifice_yes' || interaction.customId === 'sacrifice_no') {
    if (interaction.customId === 'sacrifice_yes') {
      await interaction.editReply({ content: 'You have chosen to sacrifice your character for narration rights!' });
    } else {
      await interaction.editReply({ content: 'You chose not to sacrifice your character.' });
    }
    return;
  }

  if (interaction.customId === 'brink_yes' || interaction.customId === 'brink_no') {
    if (interaction.customId === 'brink_yes') {
      await interaction.editReply({ content: 'You embraced your Brink!' });
    } else {
      await interaction.editReply({ content: 'You chose not to embrace your Brink, for now.' });
    }
    return;
  }

  if (interaction.customId === 'cancel_game_yes' || interaction.customId === 'cancel_game_no') {
    if (interaction.customId === 'cancel_game_yes') {
      await interaction.editReply({ content: 'Game cancelled.' });
    } else {
      await interaction.editReply({ content: 'Game cancellation aborted.' });
    }
    return;
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

  if (message.channel.type === ChannelType.DM) {
    if (message.content.startsWith(prefix))
      console.log('Command:', message.content, 'from', userName, 'in a Direct Message.');

    if (message.content.toLowerCase() === '.x') {
      const game = getGameData(channelId);
      if (!game) {
        try {
          await message.author.send(`You are not currently in a game in any channel.`);
        } catch (error) {
          console.error('Could not send DM to user:', error);
        }
      } else {
        const gameChannelId = Object.keys(gameData).find(key => gameData[key] === game);
        if (gameChannelId) {
          const gameChannel = client.channels.cache.get(gameChannelId);
          if (gameChannel) {
            gameChannel.send(`One or more players and/or the GM have asked the acting player or GM to please quickly move on from the current action or scene.`);
          }
        }
      }
    } else if (message.content.toLowerCase() === '.me') {
      me(message);
    } else if (message.content.toLowerCase().startsWith('.gear')) {
      const args = message.content.slice(prefix.length).split(/ +/);
      const command = args.shift().toLowerCase();
      const game = findGameByUserId(userId);
      if (!game) {
        await message.author.send(`You are not currently in a game in any channel.`);
        return;
      }
      const player = game.players[userId];
      if (game.characterGenStep === 7) {
        await handleGearCommand(message.author, game, userId, args);
      } else if (game.characterGenStep > 7 && !game.inLastStand) {
        await handleGearCommand(message.author, game, userId, args);
      } else {
        await message.author.send(`The \`.gear\` command can only be used during Character Generation Step 7 or during a scene.`);
      }
    }
  }

  if (message.channel.type !== ChannelType.DM) {
    if (message.content.startsWith(prefix)) {
      const args = message.content.slice(prefix.length).split(/ +/);
      const command = args.shift().toLowerCase();
      console.log('Command:', message.content, 'from', userName, 'in ' + message.channel.name);

      // Blocklist check (only for .startgame)
      if (blocklist[userId] && command === 'startgame') {
        await message.author.send(`Message removed. You are blocked from using the \`.startgame\` command.`);
        try {
          await message.delete();
        } catch (deleteError) {
          console.error(`Failed to delete message in <#${channelId}>: ${deleteError.message}`);
        }
        return;
      }

      // Game-required command check
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

      // Command handling
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

async function playAudioFromUrl(url, voiceChannel) {
  return new Promise((resolve, reject) => {
    const connection = getVoiceConnection(voiceChannel.guild.id);
    if (!connection) {
      reject(new Error('Not connected to a voice channel.'));
      return;
    }

    const player = createAudioPlayer();
    const resource = createAudioResource(url);

    player.play(resource);
    connection.subscribe(player);

    player.on(AudioPlayerStatus.Idle, () => {
      resolve();
    });

    player.on('error', (error) => {
      reject(error);
    });
  });
}

export async function playRecordings(message) {
  const channelId = message.channel.id;
  const game = gameData[channelId];
  const players = game.players;

  message.channel.send('The final scene fades to black. The story is over. Your final recordings will play after a moment of silence.');

  // Total of 13 second 'moment of silence'
  await new Promise(resolve => setTimeout(resolve, 10000));
  let delay = 3000;

  const playerIds = Object.keys(players);

  async function playNextRecording(index) {
    if (index >= playerIds.length) {
      // All recordings have been played. Now prompt the Initiator.
      const initiator = await message.guild.members.fetch(game.initiatorId);
      const dmChannel = await initiator.user.createDM();

      const dataEmbed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('Game Data Management')
        .setDescription(`Your Ten Candles session in <#${channelId}> has concluded. Are you ready to delete all session data?`);

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

      const dataFilter = (interaction) => interaction.user.id === game.initiatorId && interaction.message.id === dataMessage.id; // Check for initiator's ID
      const dataCollector = dmChannel.createMessageComponentCollector({ filter: dataFilter, time: 600000 }); // 10 minutes seems like ample time

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
      return;
    }

    const userId = playerIds[index];

    setTimeout(async () => {
      if (players[userId].recording) {
        if (game.gameMode === 'voice-plus-text') {
          const voiceChannelId = game.voiceChannelId;

          const existingConnection = getVoiceConnection(message.guild.id);
          if (!existingConnection) {
            const voiceChannel = client.channels.cache.get(voiceChannelId);
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
              const voiceChannel = client.channels.cache.get(voiceChannelId);
              await playAudioFromUrl(players[userId].recording, voiceChannel);
              message.channel.send(`Recording for <@${userId}>: (Audio Played)`);
            } catch (error) {
              console.error(`Error playing audio recording for ${userId}:`, error);
              message.channel.send(`Error playing recording for <@${userId}>. Check console for details.`);
            }
          } else {
            message.channel.send(`Recording for <@${userId}>:\n*<@${userId}>'s final message...*`);
            slowType(message.channel, players[userId].recording);
          }
        } else {
          // Handle text-only mode logic
          if (players[userId].recording.startsWith('http')) {
            message.channel.send(`Recording for <@${userId}>:\n${players[userId].recording}`);
          } else {
            message.channel.send(`Recording for <@${userId}>:\n*<@${userId}>'s final message...*`);
            slowType(message.channel, players[userId].recording);
          }
        }
      } else {
        message.channel.send(`No playable recording for <@${userId}>.`);
      }

      await playNextRecording(index + 1);
    }, delay);
  }

  await playNextRecording(0);
  saveGameData();
}

client.login(process.env.DISCORD_TOKEN);

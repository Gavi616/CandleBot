import 'dotenv/config';
import {
  Client, EmbedBuilder, ChannelType, GatewayIntentBits, MessageMentions,
  PermissionsBitField, AttachmentBuilder, MessageFlags, ButtonStyle,
  StringSelectMenuBuilder, ActionRowBuilder, ButtonBuilder, ComponentType
} from 'discord.js';
import fs from 'fs';
import { getHelpEmbed } from './embed.js';
import { TEST_USER_ID, finalRecordingsMessage } from './config.js';
import {
  loadGameData, saveGameData, printActiveGames, getAudioDuration,
  gameData, handleGearCommand, playAudioFromUrl, playRandomConflictSound,
  speakInChannel, requestConsent, loadBlockUserList, isWhitelisted,
  isBlockedUser, loadChannelWhitelist, saveChannelWhitelist, channelWhitelist,
  respondViaDM, findGameByUserId, handleTraitStacking, getRandomBrink, getRandomMoment,
  getRandomVice, getRandomVirtue, getRandomName, getRandomLook, getRandomConcept
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
const version = '0.9.944a';
const botName = 'Ten Candles Bot';
export const isTesting = true;
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

  loadBlockUserList();
  loadChannelWhitelist();
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

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const userId = message.author.id;
  const userName = message.author.username;

  if (message.channel.type === ChannelType.DM) {
    if (message.content.startsWith(prefix)) {
      const args = message.content.slice(prefix.length).split(/ +/);
      const command = args.shift().toLowerCase();

      console.log('DM Command:', message.content, 'from', userName);

      if (isTesting && command === 'testchargenstep') {
        await testCharGenStep(message, args);
      } else if (isTesting && command === 'testtts') {
        await testTTS(message, args);
      } else if (isTesting && command === 'testdice') {
        await testDiceSounds(message, args);
      } else if (isTesting && command === 'testfinalrec') {
        await testRecordingCommand(message, args);
      } else if (isTesting && command === 'testhts') {
        await testHandleTraitStacking(message, args)
      } else if (command === 'me') {
        await me(message);
      } else if (command === 'gear') {
        const game = findGameByUserId(userId);
        if (game) {
          await handleGearCommand(message.author, game, userId, args);
        } else {
          await message.author.send('You are not currently in a game.');
        }
      } else if (command === 'x') {
        const game = findGameByUserId(userId);
        if (game) {
          await message.author.send('You have anonymously signaled to wrap up the scene.');
        } else {
          await message.author.send('You are not currently in a game.');
        }
      }
    } else {
      await handleFinalRecording(message);
    }
    return;
  } else if (message.channel.type !== ChannelType.DM) {
    if (message.content.startsWith(prefix)) {
      const args = message.content.slice(prefix.length).split(/ +/);
      const command = args.shift().toLowerCase();

      console.log('Channel command:', message.content, 'from', userName, 'in ' + message.channel.name);

      if (command === 'whitelist') {
        try {
          await whitelistChannel(message, args);
        } catch (error) {
          console.error(`Error handling ${command} command:`, error);
          message.channel.send(`An error occurred while processing the ${command} command. Check the console for details.`);
        }
        return;
      }

      if (isBlockedUser(userId) && command === 'startgame') {
        await respondViaDM(message, `You are blocked from using the \`.startgame\` command.`, 'startgame');
        return;
      }

      if (command === 'startgame') {
        if (!isWhitelisted(message.channel.id)) {
          try {
            await message.author.send(`The channel <#${message.channel.id}> is not whitelisted for \`.startgame\` commands. Please ask an administrator to use \`.whitelist ${message.channel.id}\` to enable games in this channel.`);
            await message.delete();
          } catch (error) {
            console.error(`Error sending DM or deleting message:`, error);
          }
          return;
        }
      }

      const game = gameData[channelId];
      const gameRequiredCommands = ['conflict', 'nextstep', 'gamestatus', 'removeplayer', 'leavegame', 'cancelgame', 'died', 'me', 'x', 'theme'];
      if (gameRequiredCommands.includes(command)) {
        if (!game) {
          await respondViaDM(message, `There is no **Ten Candles** game in progress in <#${channelId}>.`, 'gameRequiredCommands');
          return;
        }
        if (!game.players[userId] && game.gmId !== userId) {
          await respondViaDM(message, `You are not a participant in the **Ten Candles** game in <#${channelId}>.`, 'gameRequiredCommands');
          return;
        }
      }

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
      } else if (command === 'blockuser') {
        await blockUser(message, args);
      } else if (command === 'unblockuser') {
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

export async function whitelistChannel(message, args) {
  if (!message.member.permissions.has('Administrator') && !message.member.permissions.has('KickMembers')) {
    try {
      await message.author.send('Only administrators or users with the `Kick Members` permission can use this command.');
      await message.delete();
    } catch (error) {
      console.error(`whitelistChannel: Failed to delete message: ${error.message}`);
    }
    return;
  }

  const channelToWhitelistId = parseChannelId(args[0]);
  if (!channelToWhitelistId) {
    try {
      await message.author.send('Invalid channel ID or mention.');
      await message.delete();
    } catch (error) {
      console.error(`whitelistChannel: Failed to delete message: ${error.message}`);
    }
    return;
  }

  let channel = client.channels.cache.get(channelToWhitelistId);
  if (!channel) {
    try {
      channel = await client.channels.fetch(channelToWhitelistId);
    } catch (error) {
      console.error(`whitelistChannel: Error fetching channel ${channelToWhitelistId}:`, error);
      try {
        await message.author.send(`Could not find channel with ID ${channelToWhitelistId}.`);
        await message.delete();
      } catch (error) {
        console.error(`whitelistChannel: Failed to delete message: ${error.message}`);
      }
      return;
    }
  }

  const channelName = channel ? channel.name : 'Unknown Channel';
  const guildName = channel ? channel.guild.name : 'Unknown Server';
  const adminName = message.member.id;
  const botName = client.user.id;
  const channelType = channel.type === ChannelType.GuildVoice ? 'voice' : 'text';

  let dmText;
  let channelText;
  if (args[1] && args[1].toLowerCase() === 'remove') {
    if (channelWhitelist[channelToWhitelistId]) {
      delete channelWhitelist[channelToWhitelistId];
      dmText = `**<#${channelToWhitelistId}>** has been removed from the channel whitelist.`;
      channelText = `This ${channelType} channel has been removed from the whitelist for <@${botName}> by <@${adminName}>.`;
    } else {
      dmText = `**<#${channelToWhitelistId}>** was not on the channel whitelist.`;
    }
  } else {
    if (!channelWhitelist[channelToWhitelistId]) {
      channelWhitelist[channelToWhitelistId] = true;
      dmText = `**<#${channelToWhitelistId}>** has been added to the channel whitelist.`;
      channelText = `This ${channelType} channel has been whitelisted for <@${botName}> by <@${adminName}>. Use the \`.startgame\` command to begin a session.`;
    } else {
      dmText = `**<#${channelToWhitelistId}>** is already on the channel whitelist.`;
    }
  }

  try {
    await message.author.send(dmText);
  } catch (error) {
    console.error('whitelistChannel: Failed to send DM:', error);
  }
  try {
    await message.delete();
  } catch (error) {
    console.error(`whitelistChannel: Failed to delete message: ${error.message}`);
  }
  if (channelWhitelist[channelToWhitelistId] || (args[1] && args[1].toLowerCase() === 'remove')) {
    saveChannelWhitelist();
  }
  if (channelText) {
    try {
      await channel.send(channelText);
    } catch (error) {
      console.error(`whitelistChannel: Failed to send message to channel ${channelToWhitelistId}:`, error);
    }
  }
  return;
}

export function parseChannelId(input) {
  if (!input) return null;

  const channelIdMatch = input.match(/<#(\d+)>/);

  if (channelIdMatch) {
    return channelIdMatch[1];
  }

  if (/^\d+$/.test(input)) {
    return input;
  }

  const channelName = input.startsWith('#') ? input.slice(1) : input;
  const channel = client.channels.cache.find(c => c.name === channelName);
  if (channel) {
    return channel.id;
  }
  return null;
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

async function sendTestDM(client, message) {
  if (isTesting) {
    try {
      const testUser = await client.users.fetch(TEST_USER_ID);
      await testUser.send(message);
      console.log(`Sent test DM to ${testUser.tag}`);
    } catch (error) {
      console.error(`Error sending test DM:`, error);
    }
  }
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

async function testHandleTraitStacking(message, args) {
  if (args.length < 4) {
    await message.channel.send('Usage: .testhts <Game Channel ID> <GM ID> <Player1 ID> <Player2 ID> [<Player3 ID> ...]');
    return;
  }

  const gameChannelId = args.shift();
  const gmId = args.shift();
  const playerIds = args;
  const channelId = message.channel.id;

  // Validate IDs
  if (!/^\d+$/.test(gmId)) {
    await message.channel.send(`Invalid GM ID: ${gmId}. Please use a numeric user ID.`);
    return;
  }
  if (!/^\d+$/.test(gameChannelId)) {
    await message.channel.send(`Invalid Game Channel ID: ${gameChannelId}. Please use a numeric channel ID.`);
    return;
  }
  for (const playerId of playerIds) {
    if (!/^\d+$/.test(playerId)) {
      await message.channel.send(`Invalid Player ID: ${playerId}. Please use a numeric user ID.`);
      return;
    }
  }

  // Fetch the game channel
  let gameChannel;
  try {
    gameChannel = await client.channels.fetch(gameChannelId);
  } catch (error) {
    console.error(`testHandleTraitStacking: Error fetching game channel ${gameChannelId}:`, error);
    await message.channel.send(`Could not find game channel with ID ${gameChannelId}.`);
    return;
  }

  if (!gameChannel) {
    await message.channel.send(`Could not find game channel with ID ${gameChannelId}.`);
    return;
  }

  // Fetch the guild
  const guild = gameChannel.guild;
  if (!guild) {
    await message.channel.send(`Could not find guild for channel ${gameChannelId}.`);
    return;
  }

  // Send a non-ephemeral message to the game channel and store the message object
  const testMessage = await gameChannel.send({ content: `A test of HandleTraitStacking() is being run by <@${message.author.id}> with GM <@${gmId}> and players ${playerIds.map(id => `<@${id}>`).join(', ')}.` });

  // Create a dummy game object
  const game = {
    gm: { consent: true, brink: '' },
    players: {},
    playerOrder: [], // Initialize as empty
    characterGenStep: 6, // Set to step 6 for trait stacking
    traitsRequested: true,
    theme: 'Test Theme',
    textChannelId: gameChannelId, // Use the provided gameChannelId
    guildId: guild.id,
    voiceChannelId: gameChannelId, // Use the provided gameChannelId
    gameMode: 'text-only',
    initiatorId: message.author.id,
    gmId: gmId,
    channelId: channelId,
    diceLost: 0,
  };

  const fetchedPlayers = []; // Array to store fetched player objects

  for (const playerId of playerIds) {
    try {
      const member = await guild.members.fetch(playerId);
      const player = member;
      if (player) {
        game.players[playerId] = {
          playerUsername: player.user.username,
          consent: true,
          brink: 'Test Brink',
          moment: 'Test Moment',
          virtue: 'Test Virtue',
          vice: 'Test Vice',
          name: 'Test Name',
          look: 'Test Look',
          concept: 'Test Concept',
          recordings: '',
          hopeDice: 0,
          virtueBurned: false,
          viceBurned: false,
          momentBurned: false,
          isDead: false,
          availableTraits: ['Virtue', 'Vice', 'Moment'], // Initialize availableTraits here
          stackOrder: [], // Initialize stackOrder here
          initialChoice: null, // Initialize initialChoice here
          group: "A", // Initialize group here
          stackConfirmed: false, // Initialize stackConfirmed here
        };
        fetchedPlayers.push(player); // Add fetched player to the array
        game.playerOrder.push(playerId); // Add playerId to playerOrder
      } else {
        console.error(`testHandleTraitStacking: Could not fetch member with ID ${playerId}`);
        await message.channel.send(`Could not fetch member with ID ${playerId}. Skipping this player.`);
      }
    } catch (error) {
      console.error(`testHandleTraitStacking: Error fetching member with ID ${playerId}:`, error);
      await message.channel.send(`Error fetching member with ID ${playerId}. Skipping this player.`);
    }
  }

  gameData[gameChannelId] = game; // Use the provided gameChannelId
  saveGameData();

  await handleTraitStacking(game); // Removed initialMessages
  console.log(`testHandleTraitStacking: handleTraitStacking complete`);
  await message.channel.send('Test for handleTraitStacking() complete.');

  try {
    await testMessage.delete();
  } catch (error) {
    console.error(`testHandleTraitStacking: Error deleting test message:`, error);
  }
}

async function testCharGenStep(message, args) {
  if (args.length < 4) {
    await message.channel.send('Usage: .testchargenstep <Step Number> <Game Channel ID> <GM ID> <Player1 ID> [<Player2 ID> ...]');
    return;
  }

  const step = parseInt(args.shift());
  const gameChannelId = args.shift();
  const gmId = args.shift();
  const playerIds = args;
  const channelId = message.channel.id;

  if (step < 1 || step > 10) { // Ensure step is between 2 and 9
    await message.channel.send(`Invalid Step Number: ${step}. Please use a number between 2 and 9.`);
    return;
  }

  // Validate IDs
  if (!/^\d+$/.test(gmId)) {
    await message.channel.send(`Invalid GM ID: ${gmId}. Please use a numeric user ID.`);
    return;
  }
  if (!/^\d+$/.test(gameChannelId)) {
    await message.channel.send(`Invalid Game Channel ID: ${gameChannelId}. Please use a numeric channel ID.`);
    return;
  }
  for (const playerId of playerIds) {
    if (!/^\d+$/.test(playerId)) {
      await message.channel.send(`Invalid Player ID: ${playerId}. Please use a numeric user ID.`);
      return;
    }
  }

  // Validate player count
  if (playerIds.length < 2 || playerIds.length > 11) { // Allow 2 to 10 players (not including the GM)
    await message.channel.send('Invalid number of players. Please provide between 2 and 10 player IDs.');
    return;
  }

  // Fetch the game channel
  let gameChannel;
  try {
    gameChannel = await client.channels.fetch(gameChannelId);
  } catch (error) {
    console.error(`testHandleTraitStacking: Error fetching game channel ${gameChannelId}:`, error);
    await message.channel.send(`Could not find game channel with ID ${gameChannelId}.`);
    return;
  }

  if (!gameChannel) {
    await message.channel.send(`Could not find game channel with ID ${gameChannelId}.`);
    return;
  }

  // Fetch the guild
  const guild = gameChannel.guild;
  if (!guild) {
    await message.channel.send(`Could not find guild for channel ${gameChannelId}.`);
    return;
  }

  // Send a non-ephemeral message to the game channel and store the message object
  const testMessage = await gameChannel.send({ content: `A test of Character Generation Step ${step} is being run by <@${message.author.id}> with GM <@${gmId}> and players ${playerIds.map(id => `<@${id}>`).join(', ')}.` });

  // Determine gameMode based on channel type
  const gameMode = gameChannel.type === ChannelType.GuildVoice ? 'voice-plus-text' : 'text-only';

  // Create a dummy game object
  const game = {
    gm: { consent: true, brink: getRandomBrink(true) }, // Use a random threat brink for the GM in the test
    players: {},
    playerOrder: [], // Initialize as empty
    characterGenStep: step, // Set to the specified step
    traitsRequested: true,
    theme: 'Test Theme',
    textChannelId: gameChannelId, // Use the provided gameChannelId
    guildId: guild.id,
    voiceChannelId: gameChannelId, // Use the provided gameChannelId
    gameMode: gameMode, // Set based on channel type
    initiatorId: message.author.id,
    gmId: gmId,
    channelId: gameChannelId,
    diceLost: 0,
  };

  // Fetch GM data
  const gmMember = await guild.members.fetch(gmId);
  if (!gmMember) {
    console.error(`testCharGenStep: Could not fetch GM member with ID ${gmId}`);
    await message.channel.send(`Could not fetch GM member with ID ${gmId}.`);
    return;
  }

  // Add GM to players object
  game.players[gmId] = {
    playerUsername: gmMember.user.username,
    consent: true,
    brink: getRandomBrink(true),
    moment: getRandomMoment(),
    virtue: getRandomVirtue(),
    vice: getRandomVice(),
    name: getRandomName(),
    look: getRandomLook(),
    concept: getRandomConcept(),
    recordings: '',
    hopeDice: 0,
    virtueBurned: false,
    viceBurned: false,
    momentBurned: false,
    isDead: false,
    availableTraits: ['Virtue', 'Vice', 'Moment'],
    stackOrder: [],
    initialChoice: null,
    group: "A",
    stackConfirmed: false,
  };

  const fetchedPlayers = []; // Array to store fetched player objects

  for (const playerId of playerIds) {
    try {
      const member = await guild.members.fetch(playerId);
      const player = member;
      if (player) {
        game.players[playerId] = {
          playerUsername: player.user.username,
          consent: true,
          brink: getRandomBrink(),
          moment: getRandomMoment(),
          virtue: getRandomVirtue(),
          vice: getRandomVice(),
          name: getRandomName(),
          look: getRandomLook(),
          concept: getRandomConcept(),
          recordings: '',
          hopeDice: 0,
          virtueBurned: false,
          viceBurned: false,
          momentBurned: false,
          isDead: false,
          availableTraits: ['Virtue', 'Vice', 'Moment'],
          stackOrder: [],
          initialChoice: null,
          group: "A",
          stackConfirmed: false,
        };
        fetchedPlayers.push(player); // Add fetched player to the array
        game.playerOrder.push(playerId); // Add playerId to playerOrder
      } else {
        console.error(`testHandleTraitStacking: Could not fetch member with ID ${playerId}`);
        await message.channel.send(`Could not fetch member with ID ${playerId}. Skipping this player.`);
      }
    } catch (error) {
      console.error(`testHandleTraitStacking: Error fetching member with ID ${playerId}:`, error);
      await message.channel.send(`Error fetching member with ID ${playerId}. Skipping this player.`);
    }
  }

  // Clear data for steps after the test step
  clearDataForLaterSteps(game, step);

  gameData[gameChannelId] = game; // Use the provided gameChannelId
  saveGameData();

  await message.channel.send(`Starting character generation at step ${step} in <#${gameChannelId}> with GM <@${gmId}> and players ${playerIds.map(id => `<@${id}>`).join(', ')}.`);
  await sendCharacterGenStep(gameChannel, game);

  try {
    await testMessage.delete();
  } catch (error) {
    console.error(`testHandleTraitStacking: Error deleting test message:`, error);
  }
}

function clearDataForLaterSteps(game, step) {
  const propertiesToClear = {
    6: ['stackOrder', 'initialChoice', 'stackConfirmed', 'availableTraits'],
    7: ['gear', 'recording'],
    8: ['recording'],
  };

  for (let i = step + 1; i <= 8; i++) {
    clearPlayerProperties(game, propertiesToClear[i]);
  }
}

function clearPlayerProperties(game, properties) {
  if (!properties) return;
  for (const playerId in game.players) {
    properties.forEach(property => delete game.players[playerId][property]);
  }
}

client.login(process.env.DISCORD_TOKEN);
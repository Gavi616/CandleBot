import 'dotenv/config';
import {
  Client,
  EmbedBuilder,
  ChannelType,
  GatewayIntentBits,
  PermissionsBitField
} from 'discord.js';
import fs from 'fs';
import { getHelpEmbed } from './embed.js';
import {
  sanitizeString,
  loadGameData,
  saveGameData,
  getGameData,
  printActiveGames,
  loadBlocklist,
  saveBlocklist,
  gameData,
  blocklist,
  askPlayerForCharacterInfoWithRetry
} from './utils.js';
import { sendCharacterGenStep } from './chargen.js';
import { startGame } from './commands/startgame.js';
import { conflict } from './commands/conflict.js';
import { nextStep, prevStep } from './commands/nextstep.js';
import { gameStatus } from './commands/gamestatus.js';
import { removePlayer } from './commands/removeplayer.js';
import { leaveGame } from './commands/leavegame.js';
import { cancelGame } from './commands/cancelgame.js';
import { died } from './commands/died.js';

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessageReactions
  ],
});

const prefix = '.';
const version = '0.9.912';
const botName = 'Ten Candles Bot';
const isTesting = true;
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
    console.error('Configuration file not found. Please create a config.js file with the required settings or copy from github.');
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
          await channel.send(`**${botName}** has restarted and found a game in-progress.`);
          await gamestatus(channel);
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
    await interaction.editReply({ content: 'No game found.' });
    return;
  }
  if (interaction.customId === 'gm_consent_yes' || interaction.customId === 'gm_consent_no' || interaction.customId === 'player_consent_yes' || interaction.customId === 'player_consent_no' || interaction.customId === 'input_yes' || interaction.customId === 'input_no') {
    return;
  }

  await interaction.deferUpdate();

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
      console.log('Command:', message.content, 'from', userName, 'in a Direct Message');

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
            gameChannel.send(`One or more players and/or the GM are ready to move on, please wrap up the scene quickly.`);
          }
        }
      }
    } else if (message.content.toLowerCase() === '.me') {
      me(message);
    } else {
      const game = findGameByUserId(userId);

      if (!game) return;

      const player = game.players[userId];

      if (game.characterGenStep === 3) {
        if (!player.name || !player.look || !player.concept) {
          if (!player.name) {
            await askPlayerForCharacterInfoWithRetry(message.author, game, userId, 'name', "What's your character's name or nickname?", 60000);
          }
          if (!player.look) {
            await askPlayerForCharacterInfoWithRetry(message.author, game, userId, 'look', 'What does your character look like at a quick glance?', 60000);
          }
          if (!player.concept) {
            await askPlayerForCharacterInfoWithRetry(message.author, game, userId, 'concept', 'Briefly, what is your character\'s concept (profession or role)?', 60000);
          }
        } else {
          const channelId = game.textChannelId;
          const gameChannel = client.channels.cache.get(channelId);
          if (gameChannel) {
            game.characterGenStep++;
            sendCharacterGenStep(gameChannel, game);
            saveGameData();
          }
        }
      }
    }
  }

  if (message.channel.type !== ChannelType.DM) {
    if (message.content.startsWith(prefix)) {
      if (blocklist[userId]) {
        message.author.send(`Message removed. You are blocked from using commands. Reason: ${blocklist[userId]}`);
        try {
          await message.delete();
        } catch (deleteError) {
          console.error(`Failed to delete message in <#${channelId}>: ${deleteError.message}`);
        }
        return;
      }
      console.log('Command:', message.content, 'from', userName, 'in', message.channel.name);

      if (message.content.startsWith(prefix)) {
        const args = message.content.slice(prefix.length).split(/ +/);
        const command = args.shift().toLowerCase();

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

        if (command === 'help') {
          const isAdmin = message.member.permissions.has('Administrator');
          const helpEmbed = getHelpEmbed(isAdmin, message);
          message.channel.send({ embeds: [helpEmbed.help] });
        } else if (command === 'startgame') {
          await startGame(message, gameData);
        } else if (command === 'conflict' || command === 'c') {
          await conflict(message, args, gameData);
        } else if (command === 'theme') {
          await setTheme(message, args);
        } else if (command === 'nextstep') {
          nextStep(message);
        } else if (command === 'prevstep') {
          prevStep(message);
        } else if (command === 'gamestatus') {
          gameStatus(message);
        } else if (command === 'removeplayer') {
          removePlayer(message, args);
        } else if (command === 'leavegame') {
          leaveGame(message, args);
        } else if (command === 'cancelgame') {
          await cancelGame(message);
        } else if (command === 'died') {
          await died(message, args);
        } else if (command === 'block') {
          blockUser(message, args);
        } else if (command === 'unblock') {
          unblockUser(message, args);
        }
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
      { name: 'Game Channel:', value: `<#${gameChannelId}>` },
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
    finalTruthMessage = "All (living) together: **And we are alive.**";
  }

  let fullMessage = `GM only: **These things are true. The world is dark.**\n\n`;

  if (truthOrderMessage) {
    fullMessage += `Establishing Truths order:\n${truthOrderMessage}\n\n`;
  }

  fullMessage += `${finalTruthMessage}`;

  message.channel.send(fullMessage);

  game.diceLost = 0;
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
}

export async function setTheme(message, args) {
  // Save theme description (if it was passed in) into gameData.json

  // Only if CharacterGeneration step === 1, move to step 2
}

export async function playRecordings(message) {
  const channelId = message.channel.id;
  const game = gameData[channelId];
  const players = game.players;

  if (!game) {
    message.reply('No game is in progress in this channel.');
    return;
  }

  if (game.scene < 1) {
    message.reply('The game has not started yet. Use `.nextstep` to continue.');
    return;
  }

  message.channel.send('The final scene fades to black. The story is over. Your final recordings will now play.');

  message.channel.send('Playing final recordings:');

  let delay = 5000;

  const playerIds = Object.keys(players);

  async function playNextRecording(index) {
    if (index >= playerIds.length) {
      delete gameData[channelId];
      saveGameData();
      return;
    }

    const userId = playerIds[index];

    setTimeout(async () => {
      if (players[userId].recording) {
        if (game.gameMode === 'voice-plus-text') {
          // Handle voice+text mode logic
          const voiceChannelId = game.voiceChannelId;

          // Check if the bot is already in the voice channel
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
            // It's an audio URL
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
            slowType(message.channel, players[userId].recording); // Use slowType here!
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

    delay = 3000;
  }

  await playNextRecording(0);
}

client.login(process.env.DISCORD_TOKEN);
